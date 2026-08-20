/**
 * koi-pond · 锦鲤池塘动画运行时（自包含版）
 * 转写自 carps-top/src/scripts/koiPond.ts（原生 Canvas，无 p5 依赖），为 DSH 主题适配：
 *   - mount(host) 在宿主容器内创建全屏 canvas，不再依赖 #koi-pond/#koi-canvas DOM
 *   - 画布透明背景（clearRect），让主题的池水渐变透出
 *   - 去掉博客内页遮罩（scrim/intensity/localStorage 模式），DSH 固定全亮
 *   - 保留：鱼群 flocking / 荷叶 Perlin 边缘 / 涟漪 / 指针交互 / 可见性暂停 / 减动效
 *   - 暴露 window.__koiSetScheme 实时换色（不重建鱼群）
 */
import { resolveScheme, pickRandomScheme, getScheme } from './koiSchemes.js'

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

export default KoiPond
