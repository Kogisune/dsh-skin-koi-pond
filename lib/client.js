window.__ModuleLoader__.load({
	id: "dsh-skin-koi-pond",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
/**
 * koi-pond · 锦鲤配色方案（自包含版，转写自 carps-top/src/utils/koiSchemes.ts）
 * 作为「鱼群颜色设置」的唯一数据源。
 * 每个方案：c/c2 鱼身主色/尾腹色；mods 游动行为参数。
 */
const KOI_PRESETS = [
  { id: 'kohaku', name: '红白', c: '#ffffff', c2: '#e23b2e', mods: { size: 0, speed: 0, perc: 100, number: 0 } },
  { id: 'sanke', name: '大正三色', c: '#ffffff', c2: '#141414', mods: { size: 0, speed: 0, perc: 100, number: 0 } },
  { id: 'showa', name: '昭和三色', c: '#141414', c2: '#e23b2e', mods: { size: 0, speed: 0, perc: 100, number: 0 } },
  { id: 'ogon', name: '黄金', c: '#f4c430', c2: '#d99a00', mods: { size: 1, speed: -1, perc: 120, number: 0 } },
  { id: 'tancho', name: '丹顶', c: '#ffffff', c2: '#ff3b30', mods: { size: 0, speed: 0, perc: 100, number: 0 } },
  { id: 'asagi', name: '浅黄', c: '#3b6fb5', c2: '#e23b2e', mods: { size: 0, speed: 1, perc: 110, number: 0 } },
  { id: 'utsuri', name: '绯写', c: '#f1541b', c2: '#141414', mods: { size: 0, speed: 2, perc: 110, number: 0 } },
  { id: 'panda', name: '写鲤（黑白）', c: '#141414', c2: '#ffffff', mods: { size: 1, speed: 0, perc: 100, number: 0 } },
  { id: 'momiji', name: '落叶', c: '#f1541b', c2: '#ffffff', mods: { size: 0, speed: 0, perc: 110, number: 0 } },
]

function getScheme(id) {
  return KOI_PRESETS.find((p) => p.id === id) ?? null
}

function pickRandomScheme() {
  const s = Math.random()
  const m = { size: 0, speed: 0, perc: 100, number: 0 }
  const koiColors2 = ['#141414', '#ffffff', '#ffffff', '#ffffff']
  const rc = () => koiColors2[Math.floor(Math.random() * koiColors2.length)]
  let c
  let c2
  if (s < 0.002) {
    c = '#FFC0CB'
    c2 = '#ef8aef'
    m.speed = 8
    m.perc = 120
  } else if (s < 0.008) {
    c = '#a245ff'
    c2 = '#0aebff'
    m.speed = 5
    m.perc = 120
  } else if (s < 0.03) {
    c = '#fffff1'
    c2 = '#ffbf00'
    m.perc = 380
    m.speed = 3
  } else if (s < 0.07) {
    c = '#141414'
    c2 = '#ca040a'
    m.size = 1
    m.perc = 100
    m.number = -5
  } else if (s < 0.12) {
    c = '#fffff2'
    c2 = '#234edb'
    m.perc = 150
  } else if (s < 0.18) {
    c = '#ffbf00'
    c2 = '#ffbf00'
    m.perc = 100
  } else if (s < 0.26) {
    c = '#141413'
    c2 = rc()
    m.perc = 100
  } else if (s < 0.33) {
    c = '#ffffff'
    c2 = rc()
    m.perc = 100
  } else if (s < 0.9) {
    c = '#f1541b'
    c2 = rc()
    m.perc = 120
  } else {
    c = '#ff5000'
    c2 = '#f1541b'
    m.perc = 120
  }
  return { id: 'random', name: '随机彩蛋', c, c2, mods: m }
}

function resolveScheme(saved) {
  if (saved && saved !== 'random') {
    const p = getScheme(saved)
    if (p) return p
  }
  return pickRandomScheme()
}




/**
 * koi-pond · 锦鲤池塘动画运行时（自包含版）
 * 转写自 carps-top/src/scripts/koiPond.ts（原生 Canvas，无 p5 依赖），为 DSH 主题适配：
 *   - mount(host) 在宿主容器内创建全屏 canvas，不再依赖 #koi-pond/#koi-canvas DOM
 *   - 画布透明背景（clearRect），让主题的池水渐变透出
 *   - 去掉博客内页遮罩（scrim/intensity/localStorage 模式），DSH 固定全亮
 *   - 保留：鱼群 flocking / 荷叶 Perlin 边缘 / 涟漪 / 指针交互 / 可见性暂停 / 减动效
 *   - 暴露 window.__koiSetScheme 实时换色（不重建鱼群）
 */


const KoiPond = (() => {
  // ---- module 状态 ----
  let started = false
  let container = null
  let canvas = null
  let ctx = null
  let flock = []
  let scheme = pickRandomScheme()
  let PERC = scheme.mods.perc
  let rafId = null
  let W = 0
  let H = 0
  let dpr = 1
  let frameCount = 0
  let leaves = []
  let decoLeaves = []
  let curAlpha = 1
  const DECO_COUNT = 6
  const NOTCH_HALF = 0.28
  const NOTCH_PROB = 0.3

  // ---- 小工具 / 数学 ----
  function rnd(a, b) {
    return a + Math.random() * (b - a)
  }
  function mag(a) {
    return Math.hypot(a.x, a.y)
  }
  function setMag(a, m) {
    const l = mag(a) || 1
    return { x: (a.x / l) * m, y: (a.y / l) * m }
  }
  function limit(a, mx) {
    return mag(a) > mx ? setMag(a, mx) : a
  }
  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y)
  }
  function rgba(hex, a255) {
    const h = hex.replace('#', '')
    const full =
      h.length === 3
        ? h
            .split('')
            .map((c) => c + c)
            .join('')
        : h
    const r = parseInt(full.substring(0, 2), 16)
    const g = parseInt(full.substring(2, 4), 16)
    const b = parseInt(full.substring(4, 6), 16)
    const a = Math.max(0, Math.min(1, a255 / 255))
    return `rgba(${r},${g},${b},${a})`
  }

  // Perlin noise（荷叶边缘）
  const perm = new Uint8Array(512)
  ;(function () {
    const p = []
    let i
    for (i = 0; i < 256; i++) p[i] = i
    for (i = 255; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const t = p[i]
      p[i] = p[j]
      p[j] = t
    }
    for (i = 0; i < 512; i++) perm[i] = p[i & 255]
  })()
  function fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10)
  }
  function lerp(a, b, t) {
    return a + t * (b - a)
  }
  function grad(h, x, y) {
    switch (h & 3) {
      case 0:
        return x + y
      case 1:
        return -x + y
      case 2:
        return x - y
      default:
        return -x - y
    }
  }
  function noise2(x, y) {
    const X = Math.floor(x) & 255
    const Y = Math.floor(y) & 255
    x -= Math.floor(x)
    y -= Math.floor(y)
    const u = fade(x)
    const v = fade(y)
    const aa = perm[perm[X] + Y]
    const ab = perm[perm[X] + Y + 1]
    const ba = perm[perm[X + 1] + Y]
    const bb = perm[perm[X + 1] + Y + 1]
    const res = lerp(
      lerp(grad(aa, x, y), grad(ba, x - 1, y), u),
      lerp(grad(ab, x, y - 1), grad(bb, x - 1, y - 1), u),
      v
    )
    return (res + 1) / 2
  }

  // ---- 荷叶 ----
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

  // ---- 鱼 ----
  function makeKoi(idx) {
    const baseSize = Math.floor(rnd(15, 20)) + scheme.mods.size
    const bodyLength = baseSize * 2
    const lf = leaves[idx % leaves.length]
    const ang = rnd(0, Math.PI * 2)
    const rr = rnd(12, 80)
    const px = lf.x + Math.cos(ang) * rr
    const py = lf.y + Math.sin(ang) * rr
    const out = Math.atan2(py - lf.y, px - lf.x) + rnd(-0.7, 0.7)
    const spd = rnd(2.5, 4.5)
    const k = {
      pos: { x: px, y: py },
      vel: { x: Math.cos(out) * spd, y: Math.sin(out) * spd },
      acc: { x: 0, y: 0 },
      maxSpeed: 3.5 + scheme.mods.speed,
      maxForce: 0.12,
      baseSize,
      baseSize0: baseSize,
      bodyLength,
      color: scheme.c,
      color2: scheme.c2,
      body: [],
      active: false,
      bornFrame: 8 + idx * 7,
      panic: 0,
      jitter: rnd(-0.6, 0.6),
    }
    for (let i = 0; i < bodyLength; i++) k.body.push({ x: px, y: py })
    return k
  }

  // 指针
  let mouse = { x: -9999, y: -9999, vx: 0, vy: 0, last: 0 }
  let drawing = false
  let lastRX = 0
  let lastRY = 0
  let ripples = []

  function steer(k, type) {
    let sx = 0
    let sy = 0
    let total = 0
    for (let j = 0; j < flock.length; j++) {
      const o = flock[j]
      if (o === k || !o.active) continue
      const d = dist(k.pos, o.pos)
      if (d < PERC) {
        if (type === 'align') {
          sx += o.vel.x
          sy += o.vel.y
        } else if (type === 'cohesion') {
          sx += o.pos.x
          sy += o.pos.y
        } else if (d > 0.001) {
          sx += (k.pos.x - o.pos.x) / d
          sy += (k.pos.y - o.pos.y) / d
        }
        total++
      }
    }
    let s = { x: sx, y: sy }
    if (total > 0) {
      s.x /= total
      s.y /= total
      if (type === 'cohesion') {
        s.x -= k.pos.x
        s.y -= k.pos.y
      }
      s = setMag(s, k.maxSpeed)
      s.x -= k.vel.x
      s.y -= k.vel.y
      s = limit(s, k.maxForce)
    }
    return s
  }

  const FLEE_R = 150
  function flee(k) {
    let s = { x: 0, y: 0 }
    if (mouse.x < -999) return s
    const px = mouse.x + mouse.vx * 4
    const py = mouse.y + mouse.vy * 4
    const d1 = dist(k.pos, mouse)
    const d2 = Math.hypot(k.pos.x - px, k.pos.y - py)
    const dd = Math.min(d1, d2)
    if (dd >= FLEE_R || dd < 0.001) return s
    const tx = d2 < d1 ? px : mouse.x
    const ty = d2 < d1 ? py : mouse.y
    const dd2 = Math.max(0.001, Math.hypot(k.pos.x - tx, k.pos.y - ty))
    const dx = (k.pos.x - tx) / dd2
    const dy = (k.pos.y - ty) / dd2
    const cj = Math.cos(k.jitter)
    const sj = Math.sin(k.jitter)
    const rx = dx * cj - dy * sj
    const ry = dx * sj + dy * cj
    const cross = mouse.vx * dy - mouse.vy * dx
    const sign = cross >= 0 ? 1 : -1
    const tanX = -dy * sign
    const tanY = dx * sign
    const closeness = 1 - dd / FLEE_R
    const panic = closeness * closeness
    const desX = rx * k.maxSpeed * 2.2 + tanX * k.maxSpeed * 0.9
    const desY = ry * k.maxSpeed * 2.2 + tanY * k.maxSpeed * 0.9
    s.x = desX - k.vel.x
    s.y = desY - k.vel.y
    s = limit(s, k.maxForce * (2 + panic * 6))
    if (panic > k.panic) k.panic = panic
    return s
  }

  function edges(k) {
    if (k.pos.x > W + 50) k.pos.x = -50
    else if (k.pos.x < -50) k.pos.x = W + 50
    if (k.pos.y > H + 50) k.pos.y = -50
    else if (k.pos.y < -50) k.pos.y = H + 50
  }
  function flockStep(k) {
    k.acc.x = 0
    k.acc.y = 0
    k.panic *= 0.93
    if (k.panic < 0.01) k.panic = 0
    const a = steer(k, 'align')
    const c = steer(k, 'cohesion')
    const sp = steer(k, 'separation')
    const av = flee(k)
    const w = 1 - 0.85 * Math.min(1, k.panic)
    k.acc.x += av.x + (sp.x * 1.1 + a.x * 1.1 + c.x * 0.8) * w
    k.acc.y += av.y + (sp.y * 1.1 + a.y * 1.1 + c.y * 0.8) * w
    k.acc.x += rnd(-0.05, 0.05)
    k.acc.y += rnd(-0.05, 0.05)
  }
  function updateKoi(k) {
    k.pos.x += k.vel.x
    k.pos.y += k.vel.y
    k.vel.x += k.acc.x
    k.vel.y += k.acc.y
    k.vel = limit(k.vel, k.maxSpeed * (1 + k.panic * 1.1))
    k.body.unshift({ x: k.pos.x, y: k.pos.y })
    k.body.pop()
  }

  function bodySize(index, k) {
    if (index < k.bodyLength / 6) return k.baseSize + index * 1.8
    return k.baseSize * 2 - index
  }
  function shadowBodySize(index, k) {
    if (index < k.bodyLength / 6) return k.baseSize + index * 1.8
    return k.baseSize * 1.8 - index
  }
  function tailSize(index, k) {
    if (index < k.bodyLength / 6) return k.baseSize + index * 0.1
    return k.baseSize * 1.4 - index
  }
  function ell(x, y, size, fill) {
    if (size <= 0 || !ctx) return
    ctx.fillStyle = fill
    ctx.beginPath()
    ctx.ellipse(x, y, size / 2, size / 2, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  // 影子：深色投影（水下自然投影感），替代原博客版的灰色与之前试用的白色
  const SHADOW_FILL = 'rgba(8,8,8,0.01)'
  function drawShadow(k) {
    for (let i = 0; i < k.body.length; i++) {
      const b = k.body[i]
      ell(b.x + 50, b.y + 50, shadowBodySize(i, k), SHADOW_FILL)
    }
  }
  function drawTail(k) {
    for (let i = 0; i < k.body.length; i++) {
      const b = k.body[i]
      const sz = tailSize(i, k)
      if (sz <= 0) continue
      ell(b.x, b.y, sz, rgba(k.color2, (k.bodyLength + 30 - i) * curAlpha))
    }
  }
  function drawShadowTail(k) {
    for (let i = 0; i < k.body.length; i++) {
      const b = k.body[i]
      ell(b.x + 50, b.y + 50, tailSize(i, k), SHADOW_FILL)
    }
  }
  function drawBody(k) {
    for (let i = 0; i < k.body.length; i++) {
      const b = k.body[i]
      const sz = bodySize(i, k)
      if (sz <= 0) continue
      ell(b.x, b.y, sz, rgba(k.color, (k.bodyLength - i) * curAlpha))
    }
  }

  function makeRipple(x, y, small) {
    return {
      x,
      y,
      size: small ? rnd(24, 64) : rnd(40, 140),
      lifespan: 400,
      sizeStep: rnd(2, 3),
      lifeStep: rnd(2, 10),
    }
  }
  function drawRipple(r) {
    if (!ctx) return
    const a = Math.max(0, Math.min(1, r.lifespan / 255))
    ctx.lineWidth = 0.8
    ctx.strokeStyle = `rgba(255,255,255,${a * curAlpha * 0.8})`
    ctx.beginPath()
    ctx.arc(r.x, r.y, r.size / 2, 0, Math.PI * 2)
    ctx.stroke()
  }

  // 荷叶影子（深色投影）
  function drawLeafShadow(lf) {
    if (!ctx) return
    const verts = leafVerts(lf)
    const sh = 50 * lf.size
    ctx.save()
    ctx.translate(lf.x, lf.y)
    ctx.globalAlpha = curAlpha
    ctx.fillStyle = 'rgba(8,8,8,0.1)'
    ctx.beginPath()
    ctx.moveTo(verts[0].x + sh, verts[0].y + sh)
    for (let v = 1; v < verts.length; v++) ctx.lineTo(verts[v].x + sh, verts[v].y + sh)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
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

  function drawLeafSurface(lf) {
    if (!ctx) return
    const verts = leafVerts(lf)
    ctx.save()
    ctx.translate(lf.x, lf.y)
    ctx.globalAlpha = curAlpha
    ctx.fillStyle = leafPalette.fill
    ctx.beginPath()
    ctx.moveTo(verts[0].x, verts[0].y)
    for (let v = 1; v < verts.length; v++) ctx.lineTo(verts[v].x, verts[v].y)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = leafPalette.stroke
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(verts[0].x, verts[0].y)
    for (let e = 1; e < verts.length; e++) ctx.lineTo(verts[e].x, verts[e].y)
    ctx.closePath()
    ctx.stroke()
    ctx.strokeStyle = leafPalette.vein
    ctx.lineWidth = 2
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
      if (lf.hasNotch && Math.abs(angDiff(a, lf.notch)) < NOTCH_HALF + 0.12) continue
      const rr = leafRadius(lf, a)
      ctx.beginPath()
      ctx.moveTo(Math.cos(a) * rr * 0.1, Math.sin(a) * rr * 0.1)
      ctx.lineTo(Math.cos(a) * rr * 0.86, Math.sin(a) * rr * 0.86)
      ctx.stroke()
    }
    ctx.fillStyle = leafPalette.center
    ctx.beginPath()
    ctx.arc(0, 0, 5 * lf.size, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  // ---- 主循环（透明背景，让主题池水渐变透出） ----
  function frame() {
    if (!ctx) return
    frameCount++
    ctx.clearRect(0, 0, W, H)

    if (mouse.x > -999 && Date.now() - mouse.last > 1600) {
      mouse.x = -9999
      mouse.y = -9999
    }

    for (let ld = 0; ld < decoLeaves.length; ld++) drawLeafShadow(decoLeaves[ld])
    for (let l = 0; l < leaves.length; l++) drawLeafShadow(leaves[l])

    for (let i = 0; i < flock.length; i++) {
      const k1 = flock[i]
      if (!k1.active) continue
      drawShadow(k1)
      drawShadowTail(k1)
    }

    for (let j = 0; j < flock.length; j++) {
      const k = flock[j]
      if (!k.active) {
        if (frameCount >= k.bornFrame) {
          k.active = true
          ripples.push(makeRipple(k.pos.x, k.pos.y, true))
        } else {
          continue
        }
      }
      edges(k)
      flockStep(k)
      updateKoi(k)
      drawTail(k)
      drawBody(k)
    }

    if (frameCount % 30 === 0) ripples.push(makeRipple(rnd(0, W), rnd(0, H), false))
    if (ripples.length > 220) ripples.splice(0, ripples.length - 220)
    for (let r = ripples.length - 1; r >= 0; r--) {
      const rp = ripples[r]
      rp.size += rp.sizeStep
      rp.lifespan -= rp.lifeStep
      if (rp.lifespan < 0) {
        ripples.splice(r, 1)
        continue
      }
      drawRipple(rp)
    }

    for (let ld = 0; ld < decoLeaves.length; ld++) drawLeafSurface(decoLeaves[ld])
    for (let l = 0; l < leaves.length; l++) drawLeafSurface(leaves[l])
  }

  const reduced =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let last = 0
  let frameMin = 1000 / 30
  function loop(ts) {
    rafId = requestAnimationFrame(loop)
    if (ts - last < frameMin) return
    last = ts
    frame()
  }

  function placeLeaves() {
    leaves[1].x = W - 100
    leaves[1].y = H - 100
    for (let d = 0; d < decoLeaves.length; d++) {
      decoLeaves[d].x = decoLeaves[d].fx * W
      decoLeaves[d].y = decoLeaves[d].fy * H
    }
  }

  /**
   * mount(host, opts) — 在宿主容器内创建全屏 canvas 并启动锦鲤池塘。
   * @param {HTMLElement} host 容器（fixed/absolute，样式由主题 CSS 负责）
   * @param {{koi?: number, fps?: number, scheme?: string|null}} opts
   * @returns {() => void} cleanup — 停止动画并移除 canvas
   */
  function mount(host, opts = {}) {
    if (started || !host) return () => {}
    container = host

    canvas = document.createElement('canvas')
    canvas.setAttribute('aria-hidden', 'true')
    host.append(canvas)
    ctx = canvas.getContext('2d')
    if (!ctx) {
      canvas.remove()
      return () => {}
    }

    const cfg = { koi: opts.koi ?? 12, fps: opts.fps ?? 30 }
    frameMin = 1000 / cfg.fps

    dpr = Math.min(window.devicePixelRatio || 1, 2)
    W = window.innerWidth
    H = window.innerHeight
    // 初始尺寸（leaves 尚未创建，不能走 resizeCanvas→placeLeaves）
    canvas.width = Math.floor(W * dpr)
    canvas.height = Math.floor(H * dpr)
    canvas.style.width = W + 'px'
    canvas.style.height = H + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    scheme = resolveScheme(opts.scheme ?? localStorage.getItem('koi-scheme'))
    PERC = scheme.mods.perc

    // 荷叶颜色跟随主题（暗色模式加深）
    syncLeafPalette()
    let themeObserver = null
    if (typeof MutationObserver !== 'undefined') {
      themeObserver = new MutationObserver(syncLeafPalette)
      themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
    }

    leaves = [spawnLeaf(100, 100, 0.4, 100, 1), spawnLeaf(0, 0, 1, 40, 1)]
    decoLeaves = []
    for (let di = 0; di < DECO_COUNT; di++) {
      const dl = spawnLeaf(0, 0, rnd(0.6, 1.4), rnd(16, 32), rnd(0.28, 0.45))
      dl.fx = rnd(0.08, 0.92)
      dl.fy = rnd(0.08, 0.92)
      decoLeaves.push(dl)
    }
    placeLeaves()

    const koiCount = Math.max(4, cfg.koi + scheme.mods.number)
    flock = []
    for (let i = 0; i < koiCount; i++) flock.push(makeKoi(i))

    function onPointerMove(e) {
      const nx = e.clientX
      const ny = e.clientY
      if (mouse.x > -999) {
        mouse.vx = mouse.vx * 0.6 + (nx - mouse.x) * 0.4
        mouse.vy = mouse.vy * 0.6 + (ny - mouse.y) * 0.4
      }
      mouse.x = nx
      mouse.y = ny
      mouse.last = Date.now()
      if (drawing) {
        const dx = nx - lastRX
        const dy = ny - lastRY
        if (dx * dx + dy * dy > 26 * 26) {
          ripples.push(makeRipple(nx, ny, true))
          lastRX = nx
          lastRY = ny
        }
      }
    }
    function onPointerDown(e) {
      drawing = true
      lastRX = e.clientX
      lastRY = e.clientY
      ripples.push(makeRipple(lastRX, lastRY, false))
      mouse.x = lastRX
      mouse.y = lastRY
      mouse.last = Date.now()
    }
    function onPointerUp() {
      drawing = false
    }
    function resizeCanvas() {
      if (!canvas || !ctx) return
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = Math.floor(W * dpr)
      canvas.height = Math.floor(H * dpr)
      canvas.style.width = W + 'px'
      canvas.style.height = H + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      placeLeaves()
    }
    function onVis() {
      if (document.hidden) {
        if (rafId) {
          cancelAnimationFrame(rafId)
          rafId = null
        }
      } else if (!reduced) {
        rafId = requestAnimationFrame(loop)
      }
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerdown', onPointerDown, { passive: true })
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    window.addEventListener('blur', onPointerUp)
    window.addEventListener('resize', resizeCanvas)
    document.addEventListener('visibilitychange', onVis)

    if (reduced) {
      for (let ri = 0; ri < flock.length; ri++) flock[ri].active = true
      frame()
    } else {
      rafId = requestAnimationFrame(loop)
    }

    // 实时换色（不重建鱼群）
    const setScheme = function (id) {
      const next = id && id !== 'random' ? getScheme(id) : null
      const s = next ?? pickRandomScheme()
      scheme = s
      PERC = s.mods.perc
      for (let i = 0; i < flock.length; i++) {
        const k = flock[i]
        k.color = s.c
        k.color2 = s.c2
        k.baseSize = k.baseSize0 + s.mods.size
        k.maxSpeed = 3.5 + s.mods.speed
      }
      try {
        localStorage.setItem('koi-scheme', id || 'random')
      } catch {}
    }
    setSchemeRef = setScheme
    window.__koiSetScheme = setScheme

    started = true

    return function cleanup() {
      if (rafId) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      if (themeObserver) {
        themeObserver.disconnect()
        themeObserver = null
      }
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('blur', onPointerUp)
      window.removeEventListener('resize', resizeCanvas)
      document.removeEventListener('visibilitychange', onVis)
      if (canvas) canvas.remove()
      canvas = null
      ctx = null
      flock = []
      leaves = []
      decoLeaves = []
      ripples = []
      started = false
      if (window.__koiSetScheme === setSchemeRef) delete window.__koiSetScheme
    }
  }

  // 供 cleanup 判断 __koiSetScheme 是否仍为本实例的
  let setSchemeRef = null

  return { mount }
})()




/**
 * koi-pond · 客户端入口（Cordis 插件）
 * 锦鲤池塘主题：注入 design-token CSS、挂载 Canvas 锦鲤池塘动画（carps.top koiPond 移植）、
 * 水波涟漪装饰层与锦鲤剪影。卸载时由 effect disposer 完整还原。
 * 构建时 scripts/build.mjs 会把 css/*.css 内联进 CSS 占位符、并把 koi 模块合并进同一 factory。
 */


const SKIN_ATTR = 'data-dsh-koi-pond'
const STYLE_ID = 'koi-pond-style'
const RIPPLE_ID = 'koi-pond-ripple'
const POND_HOST_ID = 'koi-pond-dsh'
const SCRIM_ID = 'koi-pond-scrim'

function apply() {
  const body = document.body
  const owned = []
  const originalAttr = body.getAttribute(SKIN_ATTR)

  // 1. 作用域属性
  body.setAttribute(SKIN_ATTR, '')

  // 2. 注入设计令牌 + 部件 CSS（构建时内联）
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = "/* ===== base.css ===== */\n/* ============================================================\r\n   koi-pond · base.css — 共享基础（任何部件都加载）\r\n   设计令牌：锦鲤池塘意象\r\n   深色 = 池塘夜色（墨青池水 / 月光文字 / 锦鲤橙红）\r\n   浅色 = 宣纸日色（米白宣纸 / 墨色文字 / 朱红锦鲤）\r\n   作用域：body[data-dsh-koi-pond]\r\n   ============================================================ */\r\n\r\n/* ---------- 深色 · 池塘夜色（默认） ---------- */\r\nbody[data-dsh-koi-pond] {\r\n  color: #e6f0e9;\r\n\r\n  /* 自有令牌：锦鲤池塘色板（蓝调池水） */\r\n  --koi-bg-0: #0a1118;          /* 池底墨蓝（页面最深处） */\r\n  --koi-bg-1: #0e1822;          /* 中层池水 */\r\n  --koi-bg-2: #14222e;          /* 池面（侧栏/卡片） */\r\n  --koi-bg-3: #192b38;          /* 抬升层 */\r\n  --koi-bg-4: #203747;          /* hover 层 */\r\n  --koi-ink-1: #e6f0e9;         /* 月光白（主文字） */\r\n  --koi-ink-2: #a9c4b4;         /* 次级文字 */\r\n  --koi-ink-3: #7c9a89;         /* 三级文字 */\r\n  --koi-ink-4: #5c7a6a;         /* 弱化文字 */\r\n  --koi-accent: #f26a3c;        /* 锦鲤橙红（主强调） */\r\n  --koi-accent-hi: #ff8a5c;     /* 锦鲤亮橙 */\r\n  --koi-gold: #d9a441;          /* 金鳞 */\r\n  --koi-lotus: #3fae7a;         /* 荷叶绿（辅助，UI 偏蓝用独立色值） */\r\n  --koi-water: #4fb8c9;         /* 水光蓝 */\r\n  --koi-border-1: #243a4e;\r\n  --koi-border-2: #2e4a5e;\r\n  --koi-border-3: #40607a;\r\n  --koi-glass: #0e1822b8;       /* 水光玻璃 */\r\n  --koi-shadow: 0 18px 48px #00000059, 0 2px 8px #0000003d;\r\n\r\n  /* 覆盖 DSH 官方设计令牌（dsw-alias） */\r\n  --dsw-alias-bg-base: transparent;\r\n  --dsw-alias-bg-layer-1: #0e1822e6;\r\n  --dsw-alias-bg-layer-2: #14222eeb;\r\n  --dsw-alias-bg-layer-3: #192b38f0;\r\n  --dsw-alias-bg-overlay: #0a1118f7;\r\n  --dsw-alias-border-l1: #2e4a5e33;\r\n  --dsw-alias-border-l2-darkmode-thin: #40607a40;\r\n  --dsw-alias-border-l2: #40607a4d;\r\n  --dsw-alias-border-l3: #f26a3ca3;\r\n  --dsw-alias-brand-primary: #f26a3c;\r\n  --dsw-alias-brand-text: #ffe7dc;\r\n  --dsw-alias-button-elevated-fill: #192b38f0;\r\n  --dsw-alias-button-floating-fill: #14222ef5;\r\n  --dsw-alias-button-floating-hover: #203747;\r\n  --dsw-alias-button-info-fill: #40a8c9;\r\n  --dsw-alias-button-info-hover: #52b8d6;\r\n  --dsw-alias-interactive-bg-active: #f26a3c3d;\r\n  --dsw-alias-interactive-bg-hover: #40a8c924;\r\n  --dsw-alias-interactive-bg-hover-solid: #203747;\r\n  --dsw-alias-label-primary: #e6f0e9;\r\n  --dsw-alias-label-primary-bluish: #cde0d3;\r\n  --dsw-alias-label-secondary: #a9c4b4;\r\n  --dsw-alias-label-tertiary: #7c9a89;\r\n  --dsw-alias-label-caption: #64806f;\r\n  --dsw-alias-label-dimmed: #4d6657;\r\n  --dsw-alias-state-business-primary: #f26a3c;\r\n  --dsw-alias-state-business-tertiary: #2e4a5e;\r\n  --dsw-alias-state-warn-tertiary: #d9a44133;\r\n  --dsw-alias-state-warn-label: #e5b860;\r\n  --dsw-alias-state-danger-tertiary: #f26a3c2e;\r\n  --dsw-alias-state-danger-label: #ff8a5c;\r\n  --dsw-alias-markdown-code-block: #0e1822f7;\r\n  --dsw-specific-input-major: #14222ee0;\r\n  --dsw-specific-selector: #192b38e6;\r\n  --dsw-specific-sidebar-fill: #0b141ee6;\r\n  --dsw-specific-sidebar-nav-item-active-accent: #f26a3c42;\r\n  --dsw-shadow-lv1: 0 2px 10px #00000033;\r\n  --dsw-shadow-lv2: var(--koi-shadow);\r\n\r\n  background-color: var(--koi-bg-0);\r\n}\r\n\r\n/* ---------- 浅色 · 宣纸日色 ---------- */\r\nbody[data-dsh-koi-pond]:not([data-ds-dark-theme]) {\r\n  color: #1c2b24;\r\n\r\n  --koi-bg-0: #f5f3ea;\r\n  --koi-bg-1: #efece0;\r\n  --koi-bg-2: #e8e4d4;\r\n  --koi-bg-3: #faf8f0;\r\n  --koi-bg-4: #f0ecdc;\r\n  --koi-ink-1: #1c2b24;\r\n  --koi-ink-2: #46594e;\r\n  --koi-ink-3: #6d8075;\r\n  --koi-ink-4: #93a39a;\r\n  --koi-accent: #d9562f;\r\n  --koi-accent-hi: #e86a40;\r\n  --koi-gold: #b8860b;\r\n  --koi-lotus: #2e8b57;\r\n  --koi-water: #2a9db4;\r\n  --koi-border-1: #d8dce6;\r\n  --koi-border-2: #c9cede;\r\n  --koi-border-3: #b0bcd4;\r\n  --koi-glass: #faf8f0c7;\r\n  --koi-shadow: 0 14px 36px #3a4a5e24, 0 2px 8px #3a4a5e1a;\r\n\r\n  --dsw-alias-bg-base: transparent;\r\n  --dsw-alias-bg-layer-1: #efece0e6;\r\n  --dsw-alias-bg-layer-2: #e8e4d4eb;\r\n  --dsw-alias-bg-layer-3: #faf8f0f0;\r\n  --dsw-alias-bg-overlay: #f5f3eafa;\r\n  --dsw-alias-border-l1: #b0bcd433;\r\n  --dsw-alias-border-l2-darkmode-thin: #b0bcd440;\r\n  --dsw-alias-border-l2: #b0bcd44d;\r\n  --dsw-alias-border-l3: #d9562fa3;\r\n  --dsw-alias-brand-primary: #d9562f;\r\n  --dsw-alias-brand-text: #5c2415;\r\n  --dsw-alias-button-elevated-fill: #faf8f0f0;\r\n  --dsw-alias-button-floating-fill: #faf8f0f5;\r\n  --dsw-alias-button-floating-hover: #f0ecdc;\r\n  --dsw-alias-button-info-fill: #2e8ba8;\r\n  --dsw-alias-button-info-hover: #38a5bd;\r\n  --dsw-alias-interactive-bg-active: #d9562f3d;\r\n  --dsw-alias-interactive-bg-hover: #2e8ba81f;\r\n  --dsw-alias-interactive-bg-hover-solid: #f0ecdc;\r\n  --dsw-alias-label-primary: #1c2b24;\r\n  --dsw-alias-label-primary-bluish: #2c3d33;\r\n  --dsw-alias-label-secondary: #46594e;\r\n  --dsw-alias-label-tertiary: #6d8075;\r\n  --dsw-alias-label-caption: #93a39a;\r\n  --dsw-alias-label-dimmed: #a8b5ad;\r\n  --dsw-alias-state-business-primary: #d9562f;\r\n  --dsw-alias-state-business-tertiary: #e8e4d4;\r\n  --dsw-alias-state-warn-tertiary: #b8860b24;\r\n  --dsw-alias-state-warn-label: #8a6508;\r\n  --dsw-alias-state-danger-tertiary: #d9562f24;\r\n  --dsw-alias-state-danger-label: #c2451f;\r\n  --dsw-alias-markdown-code-block: #efece0f7;\r\n  --dsw-specific-input-major: #faf8f0e0;\r\n  --dsw-specific-selector: #f0ecdce6;\r\n  --dsw-specific-sidebar-fill: #e8e4d4e6;\r\n  --dsw-specific-sidebar-nav-item-active-accent: #d9562f38;\r\n  --dsw-shadow-lv1: 0 2px 8px #3a4a5e1a;\r\n  --dsw-shadow-lv2: var(--koi-shadow);\r\n\r\n  background-color: var(--koi-bg-0);\r\n}\r\n\r\n/* ---------- 全局基础 ---------- */\r\nbody[data-dsh-koi-pond] [id='root'] {\r\n  background: transparent;\r\n  position: relative;\r\n}\r\n\r\nbody[data-dsh-koi-pond] ::selection {\r\n  background: var(--koi-accent);\r\n  color: #fff;\r\n}\r\n\r\nbody[data-dsh-koi-pond] :focus-visible {\r\n  outline-color: var(--koi-accent);\r\n}\r\n\r\n/* 滚动条：池水青 */\r\nbody[data-dsh-koi-pond] *::-webkit-scrollbar {\r\n  width: 10px;\r\n  height: 10px;\r\n}\r\nbody[data-dsh-koi-pond] *::-webkit-scrollbar-thumb {\r\n  background: var(--koi-border-2);\r\n  border-radius: 6px;\r\n  border: 2px solid transparent;\r\n  background-clip: content-box;\r\n}\r\nbody[data-dsh-koi-pond] *::-webkit-scrollbar-thumb:hover {\r\n  background: var(--koi-border-3);\r\n  border: 2px solid transparent;\r\n  background-clip: content-box;\r\n}\r\nbody[data-dsh-koi-pond] *::-webkit-scrollbar-track {\r\n  background: transparent;\r\n}\r\n\r\n/* 主题切换过渡：仅颜色，避免闪烁 */\r\nbody[data-dsh-koi-pond] * {\r\n  transition-property: background-color, border-color, color, box-shadow;\r\n  transition-duration: 0.18s;\r\n  transition-timing-function: ease;\r\n}\r\nbody[data-dsh-koi-pond] [data-skin-chrome],\r\nbody[data-dsh-koi-pond] [data-koi-ripple] {\r\n  transition: none;\r\n}\r\n@media (prefers-reduced-motion: reduce) {\r\n  body[data-dsh-koi-pond] * {\r\n    transition: none;\r\n    animation: none;\r\n  }\r\n}\r\n\n\n/* ===== background.css ===== */\n/* ============================================================\n   koi-pond · background.css — 池水背景部件\n   墨青池水渐变 + 缓慢涟漪动画 + 右下角锦鲤剪影\n   ============================================================ */\n\nbody[data-dsh-koi-pond] {\n  /* 池水：由深至浅的纵向渐变（蓝调），底部透出一点幽光 */\n  background-image:\n    radial-gradient(120% 90% at 50% -10%, #16283a 0%, transparent 55%),\n    radial-gradient(90% 70% at 85% 110%, #103a524d 0%, transparent 60%),\n    linear-gradient(180deg, var(--koi-bg-0) 0%, var(--koi-bg-1) 100%);\n  background-attachment: fixed;\n}\n\nbody[data-dsh-koi-pond]:not([data-ds-dark-theme]) {\n  background-image:\n    radial-gradient(120% 90% at 50% -10%, #fffdf4 0%, transparent 55%),\n    radial-gradient(90% 70% at 85% 110%, #2a9db414 0%, transparent 60%),\n    linear-gradient(180deg, var(--koi-bg-0) 0%, var(--koi-bg-1) 100%);\n}\n\n/* ---------- 涟漪层（纯装饰，pointer-events: none） ---------- */\nbody[data-dsh-koi-pond] [data-koi-ripple] {\n  position: fixed;\n  inset: 0;\n  z-index: 0;\n  pointer-events: none;\n  overflow: hidden;\n  background-image:\n    radial-gradient(circle at 20% 30%, transparent 0 6px, #4fb8c90f 6.5px, transparent 7px),\n    radial-gradient(circle at 72% 62%, transparent 0 10px, #4fb8c90a 10.5px, transparent 11px),\n    radial-gradient(circle at 88% 22%, transparent 0 4px, #f26a3c0d 4.5px, transparent 5px);\n  animation: koi-ripple-drift 26s ease-in-out infinite alternate;\n}\n\n@keyframes koi-ripple-drift {\n  0% { transform: translateY(0) scale(1); opacity: 0.9; }\n  100% { transform: translateY(-14px) scale(1.06); opacity: 0.55; }\n}\n\n/* 单圈涟漪：缓慢扩散的水波环 */\nbody[data-dsh-koi-pond] [data-koi-ripple]::before,\nbody[data-dsh-koi-pond] [data-koi-ripple]::after {\n  content: '';\n  position: absolute;\n  border-radius: 50%;\n  border: 1px solid #4fb8c91f;\n  animation: koi-ripple-ring 9s linear infinite;\n}\nbody[data-dsh-koi-pond] [data-koi-ripple]::before {\n  width: 220px;\n  height: 220px;\n  left: 18%;\n  bottom: 22%;\n}\nbody[data-dsh-koi-pond] [data-koi-ripple]::after {\n  width: 140px;\n  height: 140px;\n  right: 26%;\n  bottom: 30%;\n  animation-delay: 4.5s;\n  border-color: #f26a3c1c;\n}\n\n@keyframes koi-ripple-ring {\n  0% { transform: scale(0.35); opacity: 0; }\n  18% { opacity: 1; }\n  100% { transform: scale(1.6); opacity: 0; }\n}\n\n/* ---------- 背景遮罩（15% 白 + 3px 模糊）——容器内 absolute，不参与全局层级 ---------- */\nbody[data-dsh-koi-pond] #koi-pond-dsh #koi-pond-scrim {\n  position: absolute;\n  inset: 0;\n  pointer-events: none;\n  background: rgba(255, 255, 255, 0.15);\n  backdrop-filter: blur(2px);\n  -webkit-backdrop-filter: blur(3px);\n}\n\n/* ---------- Canvas 锦鲤池塘（carps.top koiPond 移植） ---------- */\nbody[data-dsh-koi-pond] #koi-pond-dsh {\n  position: fixed;\n  inset: 0;\n  z-index: -1;\n  pointer-events: none;\n  overflow: hidden;\n}\nbody[data-dsh-koi-pond] #koi-pond-dsh canvas {\n  display: block;\n  position: absolute;\n  inset: 0;\n}\n\n/* 减动效：涟漪与锦鲤静止 */\n@media (prefers-reduced-motion: reduce) {\n  body[data-dsh-koi-pond] [data-koi-ripple] {\n    animation: none;\n  }\n  body[data-dsh-koi-pond] [data-koi-ripple]::before,\n  body[data-dsh-koi-pond] [data-koi-ripple]::after {\n    animation: none;\n  }\n}\n\n\n/* ===== sidebar.css ===== */\n/* ============================================================\r\n   koi-pond · sidebar.css — 侧栏部件\r\n   深池水渐变 + 锦鲤金选中态 + 竹节分隔线\r\n   ============================================================ */\r\n\r\nbody[data-dsh-koi-pond] :is([data-pane='sidebar'], [class*='sidebarCol']) {\r\n  --dsw-alias-label-primary: var(--koi-ink-1);\r\n  --dsw-alias-label-secondary: var(--koi-ink-2);\r\n  --dsw-alias-label-tertiary: var(--koi-ink-3);\r\n  --dsw-alias-label-caption: var(--koi-ink-4);\r\n  --dsw-alias-border-l1: var(--koi-border-1);\r\n  --dsw-alias-border-l2: var(--koi-border-2);\r\n  --dsw-alias-button-elevated-fill: var(--koi-bg-3);\r\n  --dsw-alias-button-floating-hover: var(--koi-bg-4);\r\n  --dsw-alias-interactive-bg-hover: #40a8c91a;\r\n  --dsw-alias-interactive-bg-active: #f26a3c33;\r\n\r\n  z-index: auto;\r\n  background: transparent;\r\n  border-right: 0;\r\n  position: relative;\r\n}\r\n\r\n/* 侧栏池水底：纵向渐变 + 隐约水纹 */\r\nbody[data-dsh-koi-pond] :is([data-pane='sidebar'], [class*='sidebarCol']) > div {\r\n  background:\r\n    radial-gradient(120% 60% at 50% 0%, #1c34294d 0%, transparent 60%),\r\n    linear-gradient(180deg, var(--koi-bg-1) 0%, var(--koi-bg-2) 100%);\r\n  position: relative;\r\n  overflow: hidden;\r\n  box-shadow: inset -1px 0 var(--koi-border-1);\r\n}\r\n\r\n/* Logo 行：宣纸衬底 + 锦鲤描边 */\r\nbody[data-dsh-koi-pond] [class*='logoRow'] {\r\n  background: linear-gradient(135deg, #f26a3c14 0%, transparent 46%),\r\n    linear-gradient(180deg, var(--koi-bg-3) 0%, var(--koi-bg-2) 100%);\r\n  border: 1px solid var(--koi-border-2);\r\n  border-radius: 12px;\r\n  min-height: 58px;\r\n  margin: 10px 10px 4px;\r\n  padding: 8px 10px;\r\n  box-shadow: inset 0 0 0 1px #ffffff08, 0 6px 16px #00000026;\r\n}\r\nbody[data-dsh-koi-pond] [class*='logoRow'] button[class*='brand'] {\r\n  color: var(--koi-ink-1);\r\n}\r\n\r\n/* 新建会话按钮：锦鲤橙红渐变 */\r\nbody[data-dsh-koi-pond] button[class*='newSession'] {\r\n  color: #fff6ef;\r\n  background: linear-gradient(135deg, var(--koi-accent-hi) 0%, var(--koi-accent) 55%, #d94a24 100%);\r\n  border: 0;\r\n  border-radius: 10px;\r\n  min-height: 40px;\r\n  margin: 8px 10px;\r\n  font-weight: 600;\r\n  letter-spacing: 0.02em;\r\n  box-shadow: 0 4px 12px #f26a3c40, inset 0 1px #ffffff2e;\r\n  transition: filter 0.15s, transform 0.15s, box-shadow 0.15s;\r\n}\r\nbody[data-dsh-koi-pond] button[class*='newSession']:hover {\r\n  filter: brightness(1.06);\r\n  transform: translateY(-1px);\r\n  box-shadow: 0 6px 16px #f26a3c59, inset 0 1px #ffffff2e;\r\n}\r\nbody[data-dsh-koi-pond] button[class*='newSession'] svg {\r\n  color: #fff6ef;\r\n}\r\n\r\n/* 分组标题 */\r\nbody[data-dsh-koi-pond] [class*='sectionHeader'] {\r\n  color: var(--koi-ink-3);\r\n  letter-spacing: 0.04em;\r\n  font-size: 12px;\r\n}\r\nbody[data-dsh-koi-pond] [class*='sectionHeader'] [class*='sectionLabel'] {\r\n  color: var(--koi-ink-3);\r\n}\r\n\r\n/* 搜索框 */\r\nbody[data-dsh-koi-pond] :is([data-pane='sidebar'], [class*='sidebarCol'])\r\n  [class*='search'][class*='searchExpanded']:has(> input[class*='searchInput']) {\r\n  background: var(--koi-bg-3);\r\n  border: 1px solid var(--koi-border-2);\r\n  border-radius: 9px;\r\n  height: 40px;\r\n  margin: 0 10px;\r\n  padding-inline: 12px;\r\n  box-shadow: inset 0 1px 3px #0000001f;\r\n}\r\nbody[data-dsh-koi-pond] :is([data-pane='sidebar'], [class*='sidebarCol'])\r\n  [class*='search'][class*='searchExpanded']:has(> input[class*='searchInput']):focus-within {\r\n  border-color: var(--koi-accent);\r\n  box-shadow: inset 0 1px 3px #0000001f, 0 0 0 2px #f26a3c1f;\r\n}\r\nbody[data-dsh-koi-pond] [class*='searchInput']::placeholder {\r\n  color: var(--koi-ink-4);\r\n  opacity: 1;\r\n}\r\n\r\n/* 会话行：静谧，选中 = 锦鲤金描边 + 橙红指示条 */\r\nbody[data-dsh-koi-pond] [data-koi-session-row] {\r\n  border-radius: 8px;\r\n  margin-inline: 8px;\r\n  padding-inline: 10px;\r\n  height: 34px;\r\n}\r\nbody[data-dsh-koi-pond] :is([data-pane='sidebar'], [class*='sidebarCol']) [aria-selected='true'],\r\nbody[data-dsh-koi-pond] :is([data-pane='sidebar'], [class*='sidebarCol']) [class*='active'][role='button'] {\r\n  color: var(--koi-ink-1);\r\n  background: linear-gradient(0deg, #f26a3c24 0%, #f26a3c0a 78%, transparent 100%);\r\n  /* border-left: 2px solid var(--koi-accent); */\r\n  border-radius: 0 8px 8px 0;\r\n}\r\nbody[data-dsh-koi-pond] :is([data-pane='sidebar'], [class*='sidebarCol'])\r\n  [aria-selected='true'] [class*='title'] {\r\n  color: var(--koi-ink-1);\r\n  font-weight: 500;\r\n}\r\nbody[data-dsh-koi-pond] :is([data-pane='sidebar'], [class*='sidebarCol'])\r\n  [aria-selected='true'] [class*='time'] {\r\n  color: var(--koi-gold);\r\n}\r\nbody[data-dsh-koi-pond] :is([data-pane='sidebar'], [class*='sidebarCol'])\r\n  [role='button']:hover:not([aria-selected='true']) {\r\n  background: #40a8c914;\r\n  border-radius: 8px;\r\n}\r\n\r\n/* 侧栏底部设置区 */\r\nbody[data-dsh-koi-pond] [data-slot='sidebar.settings'] > :is(button, [role='button']) {\r\n  color: var(--koi-ink-2);\r\n  background: var(--koi-bg-3);\r\n  border: 1px solid var(--koi-border-2);\r\n  border-radius: 9px;\r\n  min-height: 42px;\r\n  box-shadow: 0 3px 8px #0000001f;\r\n}\r\nbody[data-dsh-koi-pond] [data-slot='sidebar.settings'] > :is(button, [role='button']):is(:hover, :focus-visible) {\r\n  color: var(--koi-accent);\r\n  border-color: var(--koi-border-3);\r\n  background: var(--koi-bg-4);\r\n}\r\n\r\n/* 徽标 / cordis 面板入口 */\r\nbody[data-dsh-koi-pond] [data-cordis-badge] {\r\n  color: var(--koi-ink-2);\r\n  background: var(--koi-bg-3);\r\n  border: 1px solid var(--koi-border-2);\r\n  min-height: 46px;\r\n  box-shadow: inset 0 0 0 1px #ffffff08;\r\n}\r\nbody[data-dsh-koi-pond] [data-cordis-badge]:is(:hover, :focus-visible, [data-active]) {\r\n  color: var(--koi-accent);\r\n  border-color: var(--koi-accent);\r\n}\r\n\n\n/* ===== titlebar.css ===== */\n/* ============================================================\n   koi-pond · titlebar.css — 顶栏部件\n   一线水痕分隔 + 水光微透\n   ============================================================ */\n\nbody[data-dsh-koi-pond] header[class*='header'] {\n  border-bottom: 1px solid var(--koi-border-1);\n  background: linear-gradient(180deg, #0a100e66 0%, transparent 100%);\n  backdrop-filter: blur(10px) saturate(0.9);\n}\nbody[data-dsh-koi-pond]:not([data-ds-dark-theme]) header[class*='header'] {\n  background: linear-gradient(180deg, #fffdf459 0%, transparent 100%);\n}\n\nbody[data-dsh-koi-pond] header[class*='header'] :is(nav, span, button, a, div) {\n  color: var(--koi-ink-2);\n}\nbody[data-dsh-koi-pond] header[class*='header'] button:hover {\n  color: var(--koi-accent);\n}\n\n/* Tab：选中 = 锦鲤橙下划线 */\nbody[data-dsh-koi-pond] :is([data-pane='conversation'], [class*='centerCol'])\n  button[class*='tabActive'] {\n  color: var(--koi-ink-1);\n  border-bottom-color: var(--koi-accent);\n}\nbody[data-dsh-koi-pond] :is([data-pane='conversation'], [class*='centerCol'])\n  button[class*='tab']:hover {\n  color: var(--koi-ink-1);\n}\n\n/* 顶栏计数/元信息弱化 */\nbody[data-dsh-koi-pond] header[class*='header'] :is([class*='counter'], [class*='caption'], [class*='meta']) {\n  color: var(--koi-ink-4);\n}\n\n/* 聚焦环 */\nbody[data-dsh-koi-pond] header[class*='header'] :is(button, [role='tab']):focus-visible {\n  outline-offset: 2px;\n  border-radius: 4px;\n  outline: 1px solid var(--koi-accent);\n  box-shadow: 0 0 0 2px #f26a3c2e;\n}\n\n\n/* ===== composer.css ===== */\n/* ============================================================\r\n   koi-pond · composer.css — 输入区部件\r\n   水光玻璃卡片 + 锦鲤描边 + 橙红主按钮\r\n   ============================================================ */\r\n\r\nbody[data-dsh-koi-pond] [data-composer-card] {\r\n  --dsw-alias-bg-base: transparent;\r\n  background:\r\n    linear-gradient(180deg, #ffffff14 0%, transparent 40%),\r\n    var(--koi-glass);\r\n  border: 1px solid var(--koi-border-2);\r\n  border-radius: 22px;\r\n  box-shadow: var(--koi-shadow), inset 0 1px #ffffff14;\r\n  backdrop-filter: blur(14px) saturate(0.92);\r\n  min-height: 0;\r\n  overflow: visible;\r\n}\r\nbody[data-dsh-koi-pond]:not([data-ds-dark-theme]) [data-composer-card] {\r\n  background:\r\n    linear-gradient(180deg, #ffffff73 0%, transparent 40%),\r\n    var(--koi-glass);\r\n  box-shadow: var(--koi-shadow), inset 0 1px #ffffffb8;\r\n}\r\n\r\n/* 聚焦态：锦鲤橙描边 */\r\nbody[data-dsh-koi-pond] [data-composer-card]:focus-within {\r\n  border-color: var(--koi-accent);\r\n  box-shadow: var(--koi-shadow), 0 0 0 2px #f26a3c21, inset 0 1px #ffffff14;\r\n}\r\n\r\nbody[data-dsh-koi-pond] [data-composer-card] textarea {\r\n  caret-color: var(--koi-accent);\r\n}\r\nbody[data-dsh-koi-pond] [data-composer-card] textarea::placeholder {\r\n  color: var(--koi-ink-4);\r\n  opacity: 1;\r\n}\r\n\r\n/* 输入区圆形工具按钮 */\r\nbody[data-dsh-koi-pond] [data-composer-card] button[class*='add'],\r\nbody[data-dsh-koi-pond] [data-composer-card] [class*='modes'] button[class*='trigger']:has([class*='triggerIcon']) {\r\n  color: var(--koi-ink-2);\r\n  background: var(--koi-bg-3);\r\n  border: 1px solid var(--koi-border-2);\r\n  /* border-radius: 50%; */\r\n  box-shadow: inset 0 0 0 1px #ffffff0a;\r\n}\r\nbody[data-dsh-koi-pond] [data-composer-card] button[class*='add']:hover,\r\nbody[data-dsh-koi-pond] [data-composer-card] [class*='modes'] button[class*='trigger']:hover {\r\n  color: var(--koi-accent);\r\n  border-color: var(--koi-border-3);\r\n  transform: translateY(-1px);\r\n}\r\n\r\n/* 主发送按钮：锦鲤橙红 */\r\nbody[data-dsh-koi-pond] [data-composer-card] button[class*='primary'] {\r\n  color: #fff6ef;\r\n  background: linear-gradient(135deg, var(--koi-accent-hi) 0%, var(--koi-accent) 60%, #d94a24 100%);\r\n  border: 0;\r\n  border-radius: 50%;\r\n  box-shadow: 0 4px 12px #f26a3c3d, inset 0 1px #ffffff2e;\r\n  transition: filter 0.15s, transform 0.15s, box-shadow 0.15s;\r\n}\r\nbody[data-dsh-koi-pond] [data-composer-card] button[class*='primary']:hover:not(:disabled) {\r\n  filter: brightness(1.07);\r\n  transform: translateY(-1px);\r\n  box-shadow: 0 6px 16px #f26a3c52, inset 0 1px #ffffff2e;\r\n}\r\nbody[data-dsh-koi-pond] [data-composer-card] button[class*='primary']:disabled {\r\n  opacity: 0.55;\r\n}\r\n\r\n/* 输入区底部 dock 工具条 */\r\nbody[data-dsh-koi-pond] [data-slot='conversation.composer.dock'] > * {\r\n  color: var(--koi-ink-3);\r\n  background: linear-gradient(90deg, transparent, #40a8c90d 10% 90%, transparent);\r\n}\r\nbody[data-dsh-koi-pond] [data-slot='conversation.composer.dock'] > * [class*='sep'] {\r\n  color: var(--koi-ink-4);\r\n}\r\n\r\n/* 模式/模型选择按钮 */\r\nbody[data-dsh-koi-pond] [data-composer-card] [class*='trailing'] button[aria-haspopup='menu'] {\r\n  color: var(--koi-ink-2);\r\n  background: transparent;\r\n  border-radius: 9px;\r\n}\r\nbody[data-dsh-koi-pond] [data-composer-card] [class*='trailing'] button[aria-haspopup='menu']:hover {\r\n  color: var(--koi-accent);\r\n  background: #40a8c90f;\r\n}\r\n\n\n/* ===== overlay.css ===== */\n/* ============================================================\r\n   koi-pond · overlay.css — 弹层/对话框部件\r\n   统一 z-index 变量 + 水光玻璃面板\r\n   ============================================================ */\r\n\r\nbody[data-dsh-koi-pond] {\r\n  /* 弹层 z-index 统一治理（统一层级变量，规避弹层撞车） */\r\n  --koi-z-dropdown: 900;\r\n  --koi-z-popover: 950;\r\n  --koi-z-modal: 1000;\r\n  --koi-z-toast: 1050;\r\n}\r\n\r\nbody[data-dsh-koi-pond] [role='dialog'][aria-modal='true'],\r\nbody[data-dsh-koi-pond] [data-cordis-panel] {\r\n  z-index: var(--koi-z-modal);\r\n  --dsw-alias-bg-base: var(--koi-bg-3);\r\n  --dsw-alias-label-primary: var(--koi-ink-1);\r\n  --dsw-alias-label-secondary: var(--koi-ink-2);\r\n  --dsw-alias-label-tertiary: var(--koi-ink-3);\r\n  --dsw-alias-label-caption: var(--koi-ink-4);\r\n  --dsw-alias-border-l1: var(--koi-border-1);\r\n  --dsw-alias-border-l2: var(--koi-border-2);\r\n  --dsw-alias-interactive-bg-hover: #40a8c91a;\r\n  --dsw-alias-state-warn-tertiary: #d9a44124;\r\n  --dsw-alias-state-warn-label: var(--koi-gold);\r\n\r\n  color: var(--koi-ink-1);\r\n  backdrop-filter: blur(18px) saturate(0.9);\r\n  background: linear-gradient(145deg, var(--koi-bg-3) 0%, var(--koi-bg-2) 100%);\r\n  border: 1px solid var(--koi-border-2);\r\n  border-radius: 14px;\r\n  box-shadow: var(--koi-shadow), inset 0 0 0 1px #ffffff0d;\r\n}\r\n\r\nbody[data-dsh-koi-pond] [role='dialog'][aria-modal='true'] > header,\r\nbody[data-dsh-koi-pond] [data-cordis-panel] > header {\r\n  background: var(--koi-bg-3);\r\n  border-bottom: 1px solid var(--koi-border-1);\r\n  color: var(--koi-ink-1);\r\n}\r\n\r\nbody[data-dsh-koi-pond] [data-cordis-row] {\r\n  background: var(--koi-bg-3);\r\n  box-shadow: inset 0 1px #ffffff0a;\r\n  border: 1px solid var(--koi-border-1);\r\n  border-radius: 9px;\r\n}\r\nbody[data-dsh-koi-pond] [data-cordis-row][data-cordis-awaiting] {\r\n  border-color: var(--koi-gold);\r\n  box-shadow: inset 0 0 0 1px #d9a44126, 0 4px 12px #0000002b;\r\n}\r\n\r\nbody[data-dsh-koi-pond] [data-cordis-panel] :is([data-cordis-approve], [data-cordis-approve-plugin], [data-cordis-decline]) {\r\n  color: var(--koi-ink-1);\r\n  background: var(--koi-bg-4);\r\n  border: 1px solid var(--koi-border-2);\r\n  border-radius: 8px;\r\n}\r\nbody[data-dsh-koi-pond] [data-cordis-panel] [data-cordis-approve] {\r\n  color: #fff6ef;\r\n  background: linear-gradient(135deg, var(--koi-accent-hi), var(--koi-accent));\r\n  border: 0;\r\n}\r\n\r\n/* 下拉菜单 / 弹窗 */\r\nbody[data-dsh-koi-pond] [role='menu'],\r\nbody[data-dsh-koi-pond] [role='listbox'],\r\nbody[data-dsh-koi-pond] [role='tooltip'] {\r\n  z-index: var(--koi-z-popover);\r\n  background: var(--koi-bg-3);\r\n  border: 1px solid var(--koi-border-2);\r\n  border-radius: 10px;\r\n  box-shadow: var(--koi-shadow);\r\n  color: var(--koi-ink-1);\r\n}\r\nbody[data-dsh-koi-pond] [role='menuitem']:hover,\r\nbody[data-dsh-koi-pond] [role='option']:hover,\r\nbody[data-dsh-koi-pond] [role='option'][aria-selected='true'] {\r\n  background: #40a8c91a;\r\n  color: var(--koi-ink-1);\r\n}\r\n\r\n/* Toast：上浮一层 */\r\nbody[data-dsh-koi-pond] [role='status'],\r\nbody[data-dsh-koi-pond] [data-toast] {\r\n  z-index: var(--koi-z-toast);\r\n  background: var(--koi-bg-3);\r\n  border: 1px solid var(--koi-border-2);\r\n  border-radius: 10px;\r\n  box-shadow: var(--koi-shadow);\r\n  color: var(--koi-ink-1);\r\n}\r\n\n\n/* ===== fonts.css ===== */\n/* ============================================================\n   koi-pond · fonts.css — 字体部件\n   中文优先的系统字体栈 + 标题衬线点缀（纸墨感）\n   ============================================================ */\n\nbody[data-dsh-koi-pond] {\n  --koi-font-ui: 'PingFang SC', 'HarmonyOS Sans SC', 'Microsoft YaHei UI',\n    'Microsoft YaHei', 'Noto Sans SC', system-ui, -apple-system, sans-serif;\n  --koi-font-serif: 'Songti SC', 'Noto Serif SC', 'STSong', 'SimSun', Georgia, serif;\n  --koi-font-mono: 'Cascadia Code', 'JetBrains Mono', 'Sarasa Mono SC',\n    Consolas, 'Courier New', monospace;\n\n  font-family: var(--koi-font-ui);\n}\n\n/* 标题/品牌处用衬线，纸墨感 */\nbody[data-dsh-koi-pond] [class*='headline'],\nbody[data-dsh-koi-pond] [class*='logoRow'] button[class*='brand'],\nbody[data-dsh-koi-pond] [class*='sectionHeader'] {\n  font-family: var(--koi-font-serif);\n}\n\n/* 代码块 */\nbody[data-dsh-koi-pond] code,\nbody[data-dsh-koi-pond] pre,\nbody[data-dsh-koi-pond] [data-terminal] {\n  font-family: var(--koi-font-mono);\n}\n\n/* 输入区 */\nbody[data-dsh-koi-pond] [data-composer-card] textarea,\nbody[data-dsh-koi-pond] [class*='searchInput'],\nbody[data-dsh-koi-pond] input,\nbody[data-dsh-koi-pond] textarea {\n  font-family: var(--koi-font-ui);\n}\n\n/* 行高/字距微调，阅读更舒展 */\nbody[data-dsh-koi-pond] [data-chat-flow] [class*='markdown'],\nbody[data-dsh-koi-pond] [data-chat-flow-kind] [class*='markdown'] {\n  line-height: 1.75;\n  letter-spacing: 0.01em;\n}\n\n\n/* ===== ui.css ===== */\n/* ============================================================\r\n   koi-pond · ui.css — 通用 UI 部件\r\n   消息气泡 / 代码块 / 状态色 / 通用按钮\r\n   ============================================================ */\r\n\r\n/* ---------- 对话消息 ---------- */\r\n\r\n/* 用户气泡：宣纸底 + 锦鲤描边 */\r\nbody[data-dsh-koi-pond] [class*='userRow'] [class*='bubble'] {\r\n  background: var(--koi-bg-3);\r\n  border: 1px solid var(--koi-border-2);\r\n  border-radius: 14px 14px 4px 14px;\r\n  box-shadow: 0 4px 14px #0000001a;\r\n  color: var(--koi-ink-1);\r\n}\r\n\r\n/* 助手消息卡：池水玻璃 */\r\nbody[data-dsh-koi-pond] [data-chat-flow-kind='assistant-step'] > * > * > * > div[class*='markdown'] {\r\n  box-sizing: border-box;\r\n  background: linear-gradient(180deg, #ffffff0d 0%, transparent 42%), var(--koi-glass);\r\n  border: 1px solid var(--koi-border-1);\r\n  border-radius: 14px 14px 14px 4px;\r\n  align-self: flex-start;\r\n  width: fit-content;\r\n  max-width: min(680px, 96%);\r\n  padding: 14px 18px;\r\n  box-shadow: 0 4px 14px #0000001f;\r\n  color: var(--koi-ink-1);\r\n}\r\nbody[data-dsh-koi-pond]:not([data-ds-dark-theme])\r\n  [data-chat-flow-kind='assistant-step'] > * > * > * > div[class*='markdown'] {\r\n  background: linear-gradient(180deg, #ffffff73 0%, transparent 42%), var(--koi-glass);\r\n  border-color: var(--koi-border-2);\r\n}\r\n\r\n/* 思考块：荷叶绿微光 */\r\nbody[data-dsh-koi-pond] [data-variant='think'] > [data-open='true'] > [data-disclosure-row='true'] {\r\n  background: #40a8c914;\r\n  border: 1px solid #40a8c92e;\r\n  border-radius: 9px;\r\n  color: var(--koi-ink-2);\r\n}\r\nbody[data-dsh-koi-pond] [data-variant='think'][data-state='running'] [class*='row']:after {\r\n  background: linear-gradient(90deg, transparent, #f26a3c40 46%, #40a8c933 62%, transparent);\r\n  width: 220px;\r\n  height: 2px;\r\n  border-radius: 2px;\r\n  left: -220px;\r\n  animation: koi-think-sweep 2.6s ease-in-out infinite;\r\n}\r\n@keyframes koi-think-sweep {\r\n  0% { opacity: 0; transform: translateX(0); }\r\n  14% { opacity: 1; }\r\n  86% { opacity: 1; }\r\n  100% { opacity: 0; transform: translateX(calc(100vw + 440px)); }\r\n}\r\n\r\n/* bash/工具块 */\r\nbody[data-dsh-koi-pond] [data-variant='bash'] {\r\n  background: var(--koi-bg-1);\r\n  border: 1px solid var(--koi-border-1);\r\n  border-radius: 9px;\r\n  color: var(--koi-ink-2);\r\n}\r\nbody[data-dsh-koi-pond] [data-terminal] {\r\n  color: var(--koi-ink-1);\r\n}\r\n\r\n/* ---------- 代码块 ---------- */\r\nbody[data-dsh-koi-pond] [class*='markdown'] pre,\r\nbody[data-dsh-koi-pond] [class*='markdown'] code {\r\n  background: var(--koi-bg-1);\r\n  border: 1px solid var(--koi-border-1);\r\n  border-radius: 8px;\r\n  color: var(--koi-ink-1);\r\n}\r\n\r\n/* ---------- 行内状态点（运行中 = 金鳞微光） ---------- */\r\nbody[data-dsh-koi-pond] [data-state='running'] :is([class*='runState'], [class*='stateDot']) {\r\n  filter: drop-shadow(0 0 6px #d9a441b3);\r\n  color: var(--koi-gold);\r\n}\r\n\r\n/* ---------- 通用按钮（非 composer） ---------- */\r\nbody[data-dsh-koi-pond] button {\r\n  border-radius: 8px;\r\n}\r\nbody[data-dsh-koi-pond] button:not([class*='primary']):not([class*='newSession']):hover {\r\n  color: var(--koi-accent);\r\n  background: #40a8c914;\r\n}\r\n\r\n/* ---------- 链接：锦鲤橙，去下划线改描边感 ---------- */\r\nbody[data-dsh-koi-pond] a {\r\n  color: var(--koi-accent);\r\n  text-decoration: none;\r\n  border-bottom: 1px solid #f26a3c3d;\r\n  transition: border-color 0.15s, color 0.15s;\r\n}\r\nbody[data-dsh-koi-pond] a:hover {\r\n  color: var(--koi-accent-hi);\r\n  border-bottom-color: var(--koi-accent);\r\n}\r\n\r\n/* ---------- 分隔线 ---------- */\r\nbody[data-dsh-koi-pond] hr,\r\nbody[data-dsh-koi-pond] [class*='divider'] {\r\n  border-color: var(--koi-border-1);\r\n}\r\n\r\n/* ---------- 表格（markdown） ---------- */\r\nbody[data-dsh-koi-pond] [class*='markdown'] table {\r\n  border-collapse: collapse;\r\n}\r\nbody[data-dsh-koi-pond] [class*='markdown'] th,\r\nbody[data-dsh-koi-pond] [class*='markdown'] td {\r\n  border: 1px solid var(--koi-border-2);\r\n  padding: 6px 12px;\r\n}\r\nbody[data-dsh-koi-pond] [class*='markdown'] th {\r\n  background: var(--koi-bg-3);\r\n  color: var(--koi-ink-1);\r\n}\r\n\r\n/* ---------- 引用块：池水青左边线 ---------- */\r\nbody[data-dsh-koi-pond] [class*='markdown'] blockquote {\r\n  border-left: 3px solid var(--koi-water);\r\n  background: #4fb8c90d;\r\n  border-radius: 0 8px 8px 0;\r\n  margin: 8px 0;\r\n  padding: 6px 14px;\r\n  color: var(--koi-ink-2);\r\n}\r\n\r\n/* ---------- 图标按钮 ---------- */\r\nbody[data-dsh-koi-pond] [class*='iconButton'] {\r\n  color: var(--koi-ink-3);\r\n  border-radius: 8px;\r\n}\r\nbody[data-dsh-koi-pond] [class*='iconButton']:hover {\r\n  color: var(--koi-accent);\r\n  background: #40a8c914;\r\n}\r\n"
  document.head.append(style)
  owned.push(style)

  // 3. Canvas 锦鲤池塘动画（carps.top koiPond 移植，透明背景）
  const pondHost = document.createElement('div')
  pondHost.id = POND_HOST_ID
  pondHost.setAttribute('aria-hidden', 'true')
  body.append(pondHost)
  owned.push(pondHost)
  const cleanupPond = KoiPond.mount(pondHost, { koi: 12, fps: 30 })

  // 4. 背景遮罩（15% 白 + 3px 模糊）——挂在容器内部，不参与全局层级
  const scrim = document.createElement('div')
  scrim.id = SCRIM_ID
  scrim.setAttribute('aria-hidden', 'true')
  pondHost.append(scrim)

  // 5. 水波涟漪装饰层（纯 CSS 动画）
  const ripple = document.createElement('div')
  ripple.id = RIPPLE_ID
  ripple.dataset.koiRipple = ''
  ripple.setAttribute('aria-hidden', 'true')
  body.append(ripple)
  owned.push(ripple)

  // 卸载还原
  return () => {
    cleanupPond()
    for (const node of owned) node.remove()
    if (originalAttr === null) body.removeAttribute(SKIN_ATTR)
    else body.setAttribute(SKIN_ATTR, originalAttr)
  }
}

		exports.apply = apply;
		return module.exports;
	}
});
