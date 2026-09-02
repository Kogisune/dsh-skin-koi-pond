/**
 * koi-pond · 锦鲤池塘动画运行时主入口（自包含版）
 * 转写自 carps-top/src/scripts/koiPond.ts（原生 Canvas，无 p5 依赖），为 DSH 主题适配：
 *   - mount(host) 在宿主容器内创建全屏 canvas，不再依赖 #koi-pond/#koi-canvas DOM
 *   - 画布透明背景（clearRect），让主题的池水渐变透出
 *   - 去掉博客内页遮罩（scrim/intensity/localStorage 模式），DSH 固定全亮
 *   - 保留：鱼群 flocking / 荷叶 Perlin 边缘 / 涟漪 / 指针交互 / 可见性暂停 / 减动效
 *   - 暴露 window.__koiSetScheme 实时换色（不重建鱼群）
 *
 * 模块化：本文件只保留「module 状态 + 主循环 + 生命周期」；
 * 渲染/骨骼/荷叶/涟漪/鱼 AI 分别在 plugin/koi/koi*.js 片段中
 * （build 按依赖顺序拼接进同一 factory 作用域）。
 */
import { resolveScheme, pickRandomScheme, getScheme } from './koiSchemes.js'

// ---- module 状态（声明在 factory 顶层共享作用域，供所有 koi 片段运行时解析）----
// 注意：不要用 IIFE 包裹本文件 —— 拆分后的各 koi 片段与这里共享同一作用域，
// IIFE 会把状态关进私有闭包，其他片段（koiLeaf/koiRender/koiFish…）将无法访问。
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
let ripples = []
// 供 cleanup 判断 window.__koiSetScheme 是否仍为本实例的
let setSchemeRef = null

// ---- 主循环（透明背景，让主题池水渐变透出） ----
function frame() {
  if (!ctx) return
  frameCount++
  updateLight()
  ctx.clearRect(0, 0, W, H)

  if (mouse.x > -999 && Date.now() - mouse.last > 1600) {
    mouse.x = -9999
    mouse.y = -9999
  }

  // 阴影层：荷叶影 + 鱼影画进离屏层后放大贴回，一次性得到柔和投影
  if (beginShadowLayer()) {
    for (let ld = 0; ld < decoLeaves.length; ld++) drawLeafCache(shadowCtx, decoLeaves[ld], 'cacheShadow')
    for (let l = 0; l < leaves.length; l++) drawLeafCache(shadowCtx, leaves[l], 'cacheShadow')

    for (let i = 0; i < flock.length; i++) {
      const k1 = flock[i]
      if (!k1.active) continue
      drawShadow(k1)
      drawShadowTail(k1)
    }
    flushShadowLayer()
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
    // 绘制顺序（全部读骨骼 k.sk）：尾腹色层 → 胸鳍/尾鳍(素材) → 主色层 → 暗部反光 → 背脊线
    drawTail(k)
    drawPectoralTail(k)
    drawBody(k)
    drawBodyLight(k)
    drawBackLine(k)
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

  // 荷叶面画在最上层，鱼从叶下游过时被遮住
  for (let ld = 0; ld < decoLeaves.length; ld++) drawLeafCache(ctx, decoLeaves[ld], 'cacheSurface')
  for (let l = 0; l < leaves.length; l++) drawLeafCache(ctx, leaves[l], 'cacheSurface')
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

  // 预热胸鳍/尾鳍素材（当前配色）：浏览器异步解码染色，尽早让首帧就有鳍；
  // 之后 setScheme 换色时 getFinSprite 按新 color2 懒烘/缓存，无需额外接线。
  getFinSprite('pec', scheme.c2)
  getFinSprite('tail', scheme.c2)

  // 荷叶/阴影配色跟随主题（暗色模式压暗）
  syncLeafPalette()
  syncShadowPalette()
  let themeObserver = null
  if (typeof MutationObserver !== 'undefined') {
    const onThemeChange = () => {
      syncLeafPalette()
      syncShadowPalette()
      buildLeafCaches() // 位图里烘死了配色，换主题必须重烤
    }
    themeObserver = new MutationObserver(onThemeChange)
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
  buildLeafCaches()

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
    const prevDpr = dpr
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    W = window.innerWidth
    H = window.innerHeight
    canvas.width = Math.floor(W * dpr)
    canvas.height = Math.floor(H * dpr)
    canvas.style.width = W + 'px'
    canvas.style.height = H + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    placeLeaves()
    if (dpr !== prevDpr) buildLeafCaches() // 位图分辨率跟随设备像素比
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
    for (const lf of leaves.concat(decoLeaves)) {
      lf.cacheShadow = null
      lf.cacheSurface = null
    }
    flock = []
    leaves = []
    decoLeaves = []
    ripples = []
    shadowCanvas = null
    shadowCtx = null
    started = false
    if (window.__koiSetScheme === setSchemeRef) delete window.__koiSetScheme
  }
}

const KoiPond = { mount }

export default KoiPond
