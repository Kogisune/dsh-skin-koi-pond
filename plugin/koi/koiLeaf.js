/**
 * koi-leaf · 荷叶生成与离屏烘焙（共享作用域片段）
 * 依赖：koiMath（rnd/noise2/lerp）、koiLight（shadowPalette）、koiPond 的状态
 * （dpr/curAlpha/leaves/decoLeaves，运行时解析）。
 * 荷叶是静态的：mount / 主题切换 / dpr 变化时把每片荷叶烘焙成两张位图
 * （阴影与叶面分开，保留「荷叶影在鱼下、荷叶面在鱼上」的遮挡层次），
 * 运行时每帧只剩 16 次 drawImage，Perlin 噪声与折线计算归零。
 */
const DECO_COUNT = 6
const NOTCH_HALF = 0.28
const NOTCH_PROB = 0.3

function spawnLeaf(x, y, offset, scale, size) {
  return {
    x,
    y,
    offset,
    scale,
    size: size || 1,
    notch: rnd(0, Math.PI * 2),
    hasNotch: Math.random() < NOTCH_PROB,
  }
}
function angDiff(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b))
}
function leafRadius(lf, a) {
  const nx = lf.offset * Math.cos(a) + lf.offset
  const ny = lf.offset * Math.sin(a) + lf.offset
  let r = (180 + (noise2(nx, ny) * 2 - 1) * lf.scale) * lf.size
  if (lf.hasNotch) {
    const da = Math.abs(angDiff(a, lf.notch))
    if (da < NOTCH_HALF) {
      const t = da / NOTCH_HALF
      r = r * t * t
    }
  }
  return r
}
function leafVerts(lf) {
  const verts = []
  for (let i = 0; i < 360; i++) {
    const a = (i * Math.PI) / 180
    const r = leafRadius(lf, a)
    verts.push({ x: r * Math.cos(a), y: r * Math.sin(a) })
  }
  return verts
}

// ---- 荷叶离屏缓存 ----
const LEAF_SHADOW_QUALITY = 0.5 // 阴影本来就要柔化，半分辨率足够且省 3/4 内存
const LEAF_SURFACE_QUALITY = 1

function leafShadowOffset(lf) {
  return 50 * lf.size
}

function bakeLeafCache(lf, quality, paint) {
  const maxR = (180 + lf.scale) * lf.size // noise2 ∈ [0,1] → 半径上界
  const half = maxR + leafShadowOffset(lf) + 8
  const res = dpr * quality
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.ceil(half * 2 * res))
  c.height = Math.max(1, Math.ceil(half * 2 * res))
  const cx = c.getContext('2d')
  if (!cx) return null
  cx.setTransform(res, 0, 0, res, 0, 0)
  cx.translate(half, half)
  paint(cx, lf)
  return { canvas: c, half }
}

function buildLeafCaches() {
  const all = leaves.concat(decoLeaves)
  for (let i = 0; i < all.length; i++) {
    const lf = all[i]
    lf.cacheShadow = bakeLeafCache(lf, LEAF_SHADOW_QUALITY, paintLeafShadow)
    lf.cacheSurface = bakeLeafCache(lf, LEAF_SURFACE_QUALITY, paintLeafSurface)
  }
}

function drawLeafCache(target, lf, key) {
  const cache = lf[key]
  if (!cache) return
  const d = cache.half * 2
  target.drawImage(cache.canvas, lf.x - cache.half, lf.y - cache.half, d, d)
}

// 荷叶影子（画到已 translate 至叶心的离屏上下文）
function paintLeafShadow(target, lf) {
  const verts = leafVerts(lf)
  const o = leafShadowOffset(lf)
  target.save()
  target.globalAlpha = curAlpha
  target.fillStyle = shadowPalette.leaf
  target.beginPath()
  target.moveTo(verts[0].x + o, verts[0].y + o)
  for (let v = 1; v < verts.length; v++) target.lineTo(verts[v].x + o, verts[v].y + o)
  target.closePath()
  target.fill()
  target.restore()
}

// ---- 荷叶颜色：亮色=原版亮绿，暗色=压暗绿（上次的变色只作用于暗色模式） ----
let leafPalette = {
  fill: 'rgba(71,184,151,0.9)',
  stroke: 'rgba(23,111,88,0.28)',
  vein: 'rgba(23,111,88,0.17)',
  center: 'rgba(23,111,88,0.22)',
}
function syncLeafPalette() {
  const dark = document.body && document.body.hasAttribute('data-ds-dark-theme')
  leafPalette = dark
    ? {
        fill: 'rgba(47,130,105,0.85)',
        stroke: 'rgba(18,72,58,0.35)',
        vein: 'rgba(18,72,58,0.22)',
        center: 'rgba(18,72,58,0.28)',
      }
    : {
        fill: 'rgba(71,184,151,0.9)',
        stroke: 'rgba(23,111,88,0.28)',
        vein: 'rgba(23,111,88,0.17)',
        center: 'rgba(23,111,88,0.22)',
      }
}

// 荷叶面（画到已 translate 至叶心的离屏上下文）
function paintLeafSurface(target, lf) {
  const verts = leafVerts(lf)
  target.save()
  target.globalAlpha = curAlpha
  target.fillStyle = leafPalette.fill
  target.beginPath()
  target.moveTo(verts[0].x, verts[0].y)
  for (let v = 1; v < verts.length; v++) target.lineTo(verts[v].x, verts[v].y)
  target.closePath()
  target.fill()
  target.strokeStyle = leafPalette.stroke
  target.lineWidth = 1.5
  target.beginPath()
  target.moveTo(verts[0].x, verts[0].y)
  for (let e = 1; e < verts.length; e++) target.lineTo(verts[e].x, verts[e].y)
  target.closePath()
  target.stroke()
  target.strokeStyle = leafPalette.vein
  target.lineWidth = 2
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
    if (lf.hasNotch && Math.abs(angDiff(a, lf.notch)) < NOTCH_HALF + 0.12) continue
    const rr = leafRadius(lf, a)
    target.beginPath()
    target.moveTo(Math.cos(a) * rr * 0.1, Math.sin(a) * rr * 0.1)
    target.lineTo(Math.cos(a) * rr * 0.86, Math.sin(a) * rr * 0.86)
    target.stroke()
  }
  target.fillStyle = leafPalette.center
  target.beginPath()
  target.arc(0, 0, 5 * lf.size, 0, Math.PI * 2)
  target.fill()
  target.restore()
}
