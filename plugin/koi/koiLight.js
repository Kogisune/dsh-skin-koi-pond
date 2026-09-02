/**
 * koi-light · 实时光照系统与椭圆绘制基元（共享作用域片段）
 * 依赖：koiMath（rgba/shade/lerp）、koiPond 的状态（frameCount/W/H/curAlpha，运行时解析）。
 * 包含：ell / ellLit（AO 方向渐变，渐变对象缓存）/ 实时光源（updateLight / lightDirIndex）/
 * 阴影离屏层（beginShadowLayer / flushShadowLayer / shadowPalette）。
 */
function ell(target, x, y, size, fill) {
  if (size <= 0 || !target) return
  target.fillStyle = fill
  target.beginPath()
  target.ellipse(x, y, size / 2, size / 2, 0, 0, Math.PI * 2)
  target.fill()
}

// ---- 实时光照 ----
// 光源绕池缓慢移动（Lissajous 轨迹）+ 光强低频呼吸；每条鱼每段按
// 「段 → 光源」方向实时计算受光面，光影随光源位置实时变化。
// 方向离散为 8 向，让渐变缓存可控（缓存 key 含方向索引，每帧零新建）。
const LIGHT_AMP_X = 0.36 // 光源横向游走半径（占屏宽比例）
const LIGHT_AMP_Y = 0.26 // 纵向
const LIGHT_PERIOD = 4600 // 一个周期帧数（约 77s @60fps）
const LIGHT_DIRS = [
  [1, 0], [0.7071, 0.7071], [0, 1], [-0.7071, 0.7071],
  [-1, 0], [-0.7071, -0.7071], [0, -1], [0.7071, -0.7071],
]
let lightX = 0
let lightY = 0
let lightAmp = 1 // 光强呼吸系数（0.76 ~ 1.0）
function updateLight() {
  const ph = frameCount / LIGHT_PERIOD
  lightX = (0.5 + Math.sin(ph * Math.PI * 2) * LIGHT_AMP_X) * W
  lightY = (0.36 + Math.cos(ph * Math.PI * 2 * 0.73) * LIGHT_AMP_Y) * H
  lightAmp = 0.88 + Math.sin(frameCount * 0.008) * 0.12
}
// 从点 (x,y) 指向光源的方向，离散为 8 向索引
function lightDirIndex(x, y) {
  const dx = lightX - x
  const dy = lightY - y
  const l = Math.hypot(dx, dy)
  if (!l) return 6 // 原点 → 朝上
  const a = Math.atan2(dy, dx)
  return ((Math.round(a / (Math.PI / 4)) + 8) % 8)
}

// 方向光照椭圆（AO）：径向渐变，渐变中心向受光方向偏移，
// 中心=原色（受光），边缘=原色按 dark 倍率压暗（遮蔽）。
// 多段沿身体串接后，受光侧连成亮脊、背光侧累积成暗边，产生立体感。
// 渐变对象按 (hex, r, di, dark) 缓存复用 —— 半径/AO 强度只依赖段序号、
// 方向只有 8 种；坐标通过 translate 进入局部系，因此每帧零创建。
const litCache = new Map()
function ellLit(target, x, y, size, hex, a255, di, dark) {
  if (size <= 0 || !target) return
  const r = size / 2
  const key = hex + '|' + Math.round(r * 2) + '|' + di + '|' + Math.round(dark * 100)
  let g = litCache.get(key)
  if (!g) {
    const d = LIGHT_DIRS[di]
    g = target.createRadialGradient(d[0] * r * 0.45, d[1] * r * 0.45, r * 0.08, 0, 0, r)
    g.addColorStop(0, rgba(hex, 255))
    g.addColorStop(1, rgba(shade(hex, dark), 255))
    litCache.set(key, g)
  }
  target.save()
  target.translate(x, y)
  target.globalAlpha = Math.max(0, Math.min(1, a255 / 255))
  target.fillStyle = g
  target.beginPath()
  target.ellipse(0, 0, r, r, 0, 0, Math.PI * 2)
  target.fill()
  target.restore()
}

// ---- 阴影层 ----
// 影子先画在 1/SHADOW_DOWNSCALE 分辨率的离屏画布上，再放大贴回主画布：
// 浏览器的双线性插值顺带得到柔和投影（原来是一堆硬边椭圆），
// 同时把阴影的填充开销压到约 1/8。
const SHADOW_DOWNSCALE = 0.35
let shadowPalette = { fish: 'rgba(2,8,14,0.012)', leaf: 'rgba(2,8,14,0.1)' }
let shadowCanvas = null
let shadowCtx = null

// 投影颜色跟随亮暗主题（原来只有荷叶面色切换，影子恒为近黑，
// 在宣纸日色下会留下一片脏灰）
function syncShadowPalette() {
  const dark = document.body && document.body.hasAttribute('data-ds-dark-theme')
  shadowPalette = dark
    ? { fish: 'rgba(2,8,14,0.012)', leaf: 'rgba(2,8,14,0.1)' }
    : { fish: 'rgba(30,46,38,0.016)', leaf: 'rgba(30,46,38,0.085)' }
}

function beginShadowLayer() {
  if (!shadowCanvas) {
    shadowCanvas = document.createElement('canvas')
    shadowCtx = shadowCanvas.getContext('2d')
  }
  if (!shadowCtx) return false
  const pw = Math.max(1, Math.floor(W * dpr * SHADOW_DOWNSCALE))
  const ph = Math.max(1, Math.floor(H * dpr * SHADOW_DOWNSCALE))
  if (shadowCanvas.width !== pw || shadowCanvas.height !== ph) {
    shadowCanvas.width = pw
    shadowCanvas.height = ph
  }
  const s = dpr * SHADOW_DOWNSCALE
  shadowCtx.setTransform(s, 0, 0, s, 0, 0)
  shadowCtx.clearRect(0, 0, W, H)
  return true
}

function flushShadowLayer() {
  if (!shadowCtx || !ctx) return
  const smoothing = ctx.imageSmoothingEnabled
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(shadowCanvas, 0, 0, W, H)
  ctx.imageSmoothingEnabled = smoothing
}
