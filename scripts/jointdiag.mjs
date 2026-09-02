#!/usr/bin/env node
/**
 * koi-pond · 脊柱关节角断言（纯脚本，无浏览器，回归工具）
 * 驱动 lib/client.js 真实产物，黑盒反解每条鱼「画出来的脊柱」（身体层椭圆中心点列），
 * 逐关节测相邻两段方向差 δ（转角），断言掉头/急转时弯曲「平滑铺开、尾部参与」，
 * 不允许单关节折断式大转角：
 *   E) 有效关节（相邻段 ≥1px，剔除亚像素打结噪声）单关节转角 p99 ≤ 50°
 *   F) 整脊净弯 >60° 的急转帧里，有效关节上不允许出现 >45° 的折角
 * 指针模拟：以高于鱼速的速度追最近一条鱼并反复穿过它 → 逼迫 180° 掉头。
 * 修复前同口径基线：p99=166.8° / 急转帧含 >45° 折角 382/484(79%) / 折角集中于头侧。
 * 用法：node scripts/jointdiag.mjs <client.js 路径> [标签]
 * 环境变量：KOI_WARM=预热帧数(默认180)、KOI_FRAMES=追赶帧数(默认500)。
 */
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const target = process.argv[2]
const label = process.argv[3] || target

// ---- DOM / ctx mock（记录主画布 ellipse 结算几何 + CTM） ----
const listeners = Object.create(null)
function addL(t, cb) {
  ;(listeners[t] || (listeners[t] = [])).push(cb)
}
function fire(t, ev) {
  for (const cb of listeners[t] || []) cb(ev)
}

let mainCtx = null
let fills = [] // 每帧重置
let buff = []
let nanTotal = 0
const R = (v) => (Number.isFinite(v) ? v : 0)
const noop = () => {}

function parseRgba(str) {
  const mm = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(String(str))
  return mm ? { rgb: [+mm[1], +mm[2], +mm[3]], a: parseFloat(mm[4]) } : null
}
function xfPoint(m, x, y) {
  if (m && m[4] === 0 && m[5] === 0) return [x, y]
  const mm = m || [1, 0, 0, 1, 0, 0]
  return [mm[0] * x + mm[2] * y + mm[4], mm[1] * x + mm[3] * y + mm[5]]
}
function makeCtx() {
  const settle = (rec, m) => {
    for (const e of buff) {
      if (e.t === 'ell') {
        const [wx, wy] = xfPoint(m, e.x, e.y)
        rec.ells.push({ x: R(wx), y: R(wy), rx: R(e.rx), ry: R(e.ry) })
      }
    }
    buff = []
    return rec
  }
  const c = {
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'low',
    filter: 'none',
    setTransform: (a, b, cc, d, e, f) => {
      c._m = [a, b, cc, d, e, f]
    },
    translate: (x, y) => {
      const m = c._m
      c._m = [m[0], m[1], m[2], m[3], m[4] + x, m[5] + y]
    },
    rotate: (r) => {
      const cs = Math.cos(r)
      const sn = Math.sin(r)
      const [a, b, cc, d, e, f] = c._m
      c._m = [a * cs + cc * sn, b * cs + d * sn, -a * sn + cc * cs, -b * sn + d * cs, e, f]
    },
    scale: (sx, sy) => {
      const m = c._m
      c._m = [m[0] * sx, m[1] * sx, m[2] * sy, m[3] * sy, m[4], m[5]]
    },
    save: () => c._stack.push({ a: c.globalAlpha, m: c._m }),
    restore: () => {
      const s = c._stack.pop()
      if (s) {
        c.globalAlpha = s.a
        c._m = s.m
      }
    },
    clearRect: noop,
    fillRect: noop,
    arc: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    fillRect2: noop,
    drawImage: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    ellipse: (x, y, rx, ry) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) nanTotal++
      buff.push({ t: 'ell', x, y, rx, ry })
    },
    fill: () => {
      const rec = { grad: typeof c.fillStyle === 'object', ga: c.globalAlpha, ells: [] }
      settle(rec, c._m)
      if (c === mainCtx) fills.push(rec)
    },
    stroke: noop,
    _stack: [],
    _m: [1, 0, 0, 1, 0, 0],
  }
  return c
}
function makeEl(tag) {
  const attrs = {}
  const el = {
    tagName: tag,
    style: {},
    dataset: {},
    children: [],
    id: '',
    textContent: '',
    setAttribute: (k, v) => {
      attrs[k] = v
    },
    getAttribute: (k) => (k in attrs ? attrs[k] : null),
    removeAttribute: (k) => {
      delete attrs[k]
    },
    hasAttribute: (k) => k in attrs,
    append: (ch) => el.children.push(ch),
    remove: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  if (tag === 'canvas') {
    el.width = 0
    el.height = 0
    let c = null
    el.getContext = () => (c || (c = makeCtx()))
    Object.defineProperty(el, '_ctx', { get: () => c })
  }
  return el
}

const bodyEl = makeEl('body')
let rafQ = []
const sandbox = {
  console,
  Math,
  Date,
  document: {
    body: bodyEl,
    head: makeEl('head'),
    hidden: false,
    createElement: makeEl,
    addEventListener: () => {},
    removeEventListener: () => {},
  },
  localStorage: { getItem: () => null, setItem: () => {} },
  MutationObserver: class {
    constructor() {}
    observe() {}
    disconnect() {}
  },
  requestAnimationFrame: (cb) => rafQ.push(cb),
  cancelAnimationFrame: () => {},
}
sandbox.window = sandbox
sandbox.addEventListener = addL
sandbox.removeEventListener = () => {}
sandbox.window.innerWidth = 1920
sandbox.window.innerHeight = 1080
sandbox.window.devicePixelRatio = 2
sandbox.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })

let mod = null
sandbox.window.__ModuleLoader__ = {
  load: (spec) => {
    mod = spec.factory(() => {
      throw new Error('require unsupported')
    })
  },
}
vm.createContext(sandbox)
vm.runInContext(readFileSync(target, 'utf8'), sandbox, { filename: target })
const dispose = mod.apply()

const pondHost = bodyEl.children.find((c) => c.id === 'koi-pond-dsh')
if (!pondHost || !pondHost.children[0]) throw new Error('未找到 #koi-pond-dsh 内的 canvas')
mainCtx = pondHost.children[0]._ctx
if (!mainCtx) throw new Error('主画布尚未取 context')

// ---- 帧驱动 ----
let ts = 0
function tick() {
  const q = rafQ
  rafQ = []
  ts += 34
  fills = []
  buff = []
  for (const cb of q) cb(ts)
}

// ---- 单帧：按 globalAlpha 单调方向切渐变 run，取「递减段」= 主色身体层 ----
const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
function analyseFrame() {
  const fish = []
  const consider = (seg) => {
    if (seg.length < 6 || seg[0].ga - seg[seg.length - 1].ga <= 0.005) return
    const pts = []
    for (const f of seg) if (f.ells.length) pts.push(f.ells[0])
    let glitch = false
    for (let k = 1; k < pts.length; k++) if (near(pts[k], pts[k - 1]) > 200) glitch = true
    if (!glitch && pts.length >= 10) fish.push(pts)
  }
  let i = 0
  const n = fills.length
  while (i < n) {
    if (!fills[i].grad) {
      i++
      continue
    }
    let j = i
    while (j + 1 < n && fills[j + 1].grad) j++
    const run = fills.slice(i, j + 1)
    let s0 = 0
    let dir = 0
    for (let k = 1; k < run.length; k++) {
      const d = run[k].ga - run[k - 1].ga
      const nd = Math.abs(d) < 1e-6 ? dir : Math.sign(d)
      if (dir !== 0 && nd !== dir) {
        consider(run.slice(s0, k))
        s0 = k
      }
      dir = nd
    }
    consider(run.slice(s0))
    i = j + 1
  }
  return fish
}

// ---- 关节角指标 ----
const wrap = (a) => {
  while (a > Math.PI) a -= 2 * Math.PI
  while (a < -Math.PI) a += 2 * Math.PI
  return a
}
const DEG = 180 / Math.PI
function jointMetrics(pts) {
  const m = pts.length
  const dirs = []
  const segLen = []
  for (let k = 0; k < m - 1; k++) {
    dirs.push(Math.atan2(pts[k + 1].y - pts[k].y, pts[k + 1].x - pts[k].x))
    segLen.push(Math.hypot(pts[k + 1].x - pts[k].x, pts[k + 1].y - pts[k].y))
  }
  let maxJ = 0
  let tMax = 0
  let maxK = 0
  let bend = 0 // 总绝对转角
  let rear = 0 // 后 40% 承担转角
  let sum = 0 // 有符号和 → 整脊净弯（折/掉头程度）
  // 只统计「有效关节」：相邻两段都 ≥ MIN_SEG，排除亚像素打结（肉眼不可见、方向无意义）
  const MIN_SEG = 1
  for (let k = 1; k < dirs.length; k++) {
    const d = wrap(dirs[k] - dirs[k - 1])
    const ad = Math.abs(d)
    if (segLen[k - 1] < MIN_SEG || segLen[k] < MIN_SEG) continue
    bend += ad
    sum += d
    const t = k / dirs.length
    if (ad > maxJ) {
      maxJ = ad
      tMax = t
      maxK = k
    }
    if (t >= 0.6) rear += ad
  }
  const jm = { maxJ: maxJ * DEG, tMax, bend: bend * DEG, rearFrac: bend > 1e-6 ? rear / bend : 0, fold: Math.abs(wrap(sum)) * DEG, n: m }
  if (jm.maxJ > 40) {
    // 明显单关节转角：附上它前后各 3 段的长度与方向，供判断是真实折角还是亚像素伪影
    jm.detail = []
    for (let k = Math.max(1, maxK - 3); k <= Math.min(dirs.length - 1, maxK + 3); k++) {
      jm.detail.push({
        t: (k / dirs.length).toFixed(2),
        len: segLen[k].toFixed(1),
        j: (Math.abs(wrap(dirs[k] - dirs[k - 1])) * DEG).toFixed(0),
      })
    }
  }
  return jm
}

// ---- 模拟：巡航 → 快速追鱼并反复穿过（逼掉头）→ 收尾 ----
const stats = { frames: 0, fish: 0, samples: [], foldEvt: [], elbow: 0, elbowT: [], worst: null }
const FLEE_R = 150
let mx = 960
let my = 540
let prevHeads = []
let prevHeadsPrev = []

for (let i = 0; i < Number(process.env.KOI_WARM || 180); i++) tick() // 等激活 + 轨迹成型

const CHASE = Number(process.env.KOI_FRAMES || 500)
for (let i = 0; i < CHASE; i++) {
  // 远距离缓追；逼近后改为朝鱼前方冲刺（速度高于鱼速 → 穿过身体到它前方，
  // 鱼必须 180° 掉头逃开）→ 反复制造掉头事件而不是焊死在鱼头上抖动。
  const hs = prevHeads
  let tx = mx
  let ty = my
  if (hs.length) {
    let bi = -1
    let bd = Infinity
    for (let j = 0; j < hs.length; j++) {
      const d = Math.hypot(hs[j].x - mx, hs[j].y - my)
      if (d < bd) {
        bd = d
        bi = j
      }
    }
    const h0 = hs[bi] || { x: mx, y: my }
    let hx = h0.x
    let hy = h0.y
    let sx = 0
    let sy = 0
    if (i > 0 && bi < prevHeadsPrev.length) {
      const ph = prevHeadsPrev[bi]
      sx = h0.x - ph.x
      sy = h0.y - ph.y
    }
    const sl = Math.hypot(sx, sy) || 1
    const d = Math.hypot(h0.x - mx, h0.y - my)
    const overshoot = d < 90 ? 26 : 5
    tx = h0.x + (sx / sl) * overshoot
    ty = h0.y + (sy / sl) * overshoot
    const V = d < 90 ? 17 : 9
    const dx = tx - mx
    const dy = ty - my
    const dl = Math.hypot(dx, dy) || 1
    const stp = Math.min(V, dl)
    mx += (dx / dl) * stp
    my += (dy / dl) * stp
  }
  if (mx < 40) mx = 40
  if (mx > 1880) mx = 1880
  if (my < 40) my = 40
  if (my > 1040) my = 1040
  fire('pointermove', { clientX: mx, clientY: my })
  tick()

  const fs = analyseFrame()
  stats.frames++
  prevHeadsPrev = prevHeads
  prevHeads = []
  for (const pts of fs) {
    stats.fish++
    prevHeads.push(pts[0])
    const jm = jointMetrics(pts)
    stats.samples.push(jm)
    if (jm.detail && !stats.worst) stats.worst = jm
    if (jm.fold > 60) {
      stats.foldEvt.push(jm)
      if (jm.maxJ > 45) {
        stats.elbow++
        stats.elbowT.push(jm.tMax)
      }
    }
  }
}

// ---- 汇总 ----
const pct = (arr, p) => {
  if (!arr.length) return NaN
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(s.length * p))]
}
const J = stats.samples.map((s) => s.maxJ)
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—')
console.log(`── ${label} 脊柱关节角诊断 ─────────────────────`)
console.log(`帧=${stats.frames}  鱼样本=${stats.fish}`)
console.log(
  `单关节最大转角:  p50=${f1(pct(J, 0.5))}°  p90=${f1(pct(J, 0.9))}°  p99=${f1(pct(J, 0.99))}°  max=${f1(J.length ? Math.max(...J) : NaN)}°`
)
console.log(`整脊净弯>60° 帧样本=${stats.foldEvt.length}  其中出现>45°折角=${stats.elbow}`)
if (stats.elbow) {
  console.log(`  折角位置分布(头→尾): p25=${f1(pct(stats.elbowT, 0.25))}  p50=${f1(pct(stats.elbowT, 0.5))}  p75=${f1(pct(stats.elbowT, 0.75))}`)
}
const fe = stats.foldEvt
if (fe.length) {
  const rf = fe.map((s) => s.rearFrac)
  const mj = fe.map((s) => s.maxJ)
  console.log(`急转帧(净弯>60°) 后40%关节承担占比: p50=${f1(pct(rf, 0.5))}  p25=${f1(pct(rf, 0.25))}   （大→ 尾部参与弯曲）`)
  console.log(`急转帧内最大单关节转角:  p50=${f1(pct(mj, 0.5))}°  max=${f1(Math.max(...mj))}°`)
}
if (stats.worst) {
  console.log(`首个 >40° 有效关节样本：tMax=${stats.worst.tMax.toFixed(2)}  周边(t/段长/关节角):`)
  for (const d of stats.worst.detail) console.log(`    t=${d.t}  len=${d.len}px  j=${d.j}°`)
}

// ---- 断言（回归） ----
// 目标：掉头/急转的弯曲必须「平滑铺开 + 尾部参与」，不允许单关节折断式大转角。
// 修复前同口径：p99=166.8°、急转帧含 >45° 折角 382/484(79%)、折角集中于头侧(t≈0.3)。
const Jvalid = stats.samples.map((s) => s.maxJ)
const p99J = pct(Jvalid, 0.99)
const maxJ = Jvalid.length ? Math.max(...Jvalid) : 0
const foldSharp = stats.foldEvt.filter((s) => s.maxJ > 45).length // 有效关节上 >45° 的急转折角
const okJ = {
  E: Number.isFinite(p99J) && p99J <= 50, // 有效关节 p99 ≤ 50°（修复前 166.8°）
  F: stats.foldEvt.length > 30 && foldSharp === 0, // 急转帧不允许有效关节 >45° 折角（修复前 79%）
}
const pass = okJ.E && okJ.F
console.log(`[E] 单关节转角 p99 ≤50°  p99=${f1(p99J)}°  max=${f1(maxJ)}°  →  ${okJ.E ? '✓' : '✗'}`)
console.log(`[F] 急转无>45°折角   急转帧=${stats.foldEvt.length}  折角=${foldSharp}  →  ${okJ.F ? '✓' : '✗'}`)
console.log(pass ? `══ 脊柱关节角断言通过 ✓（${label}）` : `══ 存在 FAIL ✗（${label}）`)
dispose()
console.log(`${label}  apply/dispose 无异常 ✓（NaN 坐标=${nanTotal}）`)
process.exit(pass ? 0 : 1)
