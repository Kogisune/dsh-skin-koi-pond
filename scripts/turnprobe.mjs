#!/usr/bin/env node
/**
 * koi-pond · 掉头/螺旋探针（纯脚本，无浏览器，回归工具）
 * 病灶背景：身体形状 = 头部轨迹历史的弧长重采样。若头部路径的转弯半径塌缩到
 * 远小于体长（低速 pivot / 自由转向），轨迹历史卷成环，身体跟着卷成螺旋
 * （实测截图：鱼原地卷成近整圈）。本探针在「指针正面拦截」场景下黑盒测量：
 *   T1) pivot 帧：低速（<1.5px/帧）下航向单帧转向 >0.5rad —— 原地打转签名
 *   T2) 最小转弯半径：单帧弦长/转角 ≈ 圆弧半径，螺旋时塌到 ~0.2-2px
 *   T3) 36 帧窗累计同向旋转 ≤500° —— 超过即「持续盘旋」（基准重录 09-07：航向偏摆
 *       0.35→0.12 后躲避变为坚决 C 弧，拦截场景下累计旋转 445°，见 T4 注）
 * 断言阈值宽松（跨种子稳健）；数字随参数调整需重录基准并注明不可比。
 * 用法：node scripts/turnprobe.mjs <client.js 路径> [标签]
 * 环境变量：KOI_SEED=随机种子（默认 20260902）、KOI_WARM=预热帧数（默认 240）。
 */
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const target = process.argv[2]
const label = process.argv[3] || target
const WARM = Number(process.env.KOI_WARM || 240)

let seed = Number(process.env.KOI_SEED || 20260902) >>> 0
function lcg() {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}
const sandboxMath = Object.create(Math)
sandboxMath.random = lcg

const listeners = Object.create(null)
function addL(t, cb) {
  ;(listeners[t] || (listeners[t] = [])).push(cb)
}
function fire(t, ev) {
  for (const cb of listeners[t] || []) cb(ev)
}
let mainCtx = null
let fills = []
let nanTotal = 0
const noop = () => {}
const R = (v) => (Number.isFinite(v) ? v : 0)

function makeCtx() {
  const c = {
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    filter: 'none',
    setTransform: (a, b, cc, d, e, f) => {
      c._m = [a, b, cc, d, e, f]
    },
    translate: (x, y) => {
      const m = c._m
      c._m = [m[0], m[1], m[2], m[3], m[4] + R(x), m[5] + R(y)]
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
    clearRect: () => {},
    fillRect: noop,
    arc: noop,
    beginPath: () => {
      c._path = []
    },
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    drawImage: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    ellipse: (x, y, rx, ry) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) nanTotal++
      c._path.push({ x, y, rx, ry })
    },
    fill: () => {
      const m = c._m
      const ells = []
      for (const e of c._path) {
        ells.push({ x: e.x * m[0] + e.y * m[2] + m[4], y: e.x * m[1] + e.y * m[3] + m[5] })
      }
      if (c === mainCtx) fills.push({ grad: typeof c.fillStyle === 'object', ga: c.globalAlpha, ells })
    },
    stroke: noop,
    _stack: [],
    _path: [],
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

const W = 1280
const H = 720
const bodyEl = makeEl('body')
let rafQ = []
const sandbox = {
  console,
  Math: sandboxMath,
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
sandbox.window.innerWidth = W
sandbox.window.innerHeight = H
sandbox.window.devicePixelRatio = 1
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

let ts = 0
function tick() {
  const q = rafQ
  rafQ = []
  ts += 34
  fills = []
  for (const cb of q) cb(ts)
}

const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
// 返回每条鱼的完整身体点列（主色递减 run），而非仅头部 —— 整脊净弯要用
function fishBodies() {
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

function movePointer(x, y) {
  fire('pointermove', { clientX: x, clientY: y })
}
function releasePointer() {
  fire('pointerup', {})
  movePointer(-2000, -2000)
}

let fails = 0
function assert(name, cond, detail) {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : '  ←  FAIL'}${detail ? '  [' + detail + ']' : ''}`)
  if (!cond) fails++
}
function angDiff(a, b) {
  let d = a - b
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return d
}

console.log(`── ${label} 掉头/螺旋探针（W=${W}×${H}，种子 ${Number(process.env.KOI_SEED || 20260902)}）─────────────────`)
for (let i = 0; i < WARM; i++) tick()

// ---- 场景：指针在鱼的正前方近距离拦截（历史 pivot/螺旋 的高发场景），持续追着鱼头放 ----
// 选一条距边足够远的鱼
const bodies0 = fishBodies()
let sel = -1
let selD = Infinity
for (let r = 0; r < bodies0.length; r++) {
  const h = bodies0[r][0]
  const de = Math.min(h.x, h.y, W - h.x, H - h.y)
  if (de < 200) continue
  const d = Math.hypot(h.x - W / 2, h.y - H / 2)
  if (d < selD) {
    selD = d
    sel = r
  }
}
if (sel < 0) {
  console.log('  ✗ 预热后没有满足条件的鱼样本')
  process.exit(1)
}

const OBS = 150 // 观察帧数（≈5s @30fps）
let pivotFrames = 0
let minR = Infinity
let maxWinRot = 0
let minSpeed = Infinity
let rotBuf = []
let prevH = null
let prevAng = null
for (let i = 0; i < OBS; i++) {
  const b = fishBodies()
  const h = (b[sel] || bodies0[sel])[0]
  // 当前航向估计：上一帧路径方向（首帧用身体第 3 点反推）
  const ref = b[sel][3] || { x: h.x - 1, y: h.y }
  const ang0 = prevAng !== null ? prevAng : Math.atan2(h.y - ref.y, h.x - ref.x)
  // 指针始终放在鱼头正前方 40px（沿当前运动方向）—— 正面拦截，逼硬躲避。
  // 钳在画布内（真实鼠标不会离屏追鱼；离屏会让鱼卡在界外循环）
  const px = Math.max(20, Math.min(W - 20, h.x + Math.cos(ang0) * 40))
  const py = Math.max(20, Math.min(H - 20, h.y + Math.sin(ang0) * 40))
  movePointer(px, py)
  tick()
  const b2 = fishBodies()
  const h2 = (b2[sel] || b[sel])[0]
  const step = Math.hypot(h2.x - h.x, h2.y - h.y)
  const ang = Math.atan2(h2.y - h.y, h2.x - h.x)
  // 只测鱼头在画布内（留 30px 边距）的帧：半出画布的鱼 head ellipse run 被裁切，
  // 质心抖动会产生 135°/R=2px 的测量伪影（实测 trace 帧85）
  const inBounds = h2.x > 30 && h2.x < W - 30 && h2.y > 30 && h2.y < H - 30
  if (prevH && inBounds && step > 0.05 && step < 200) {
    const dth = Math.abs(angDiff(ang, prevAng))
    // 转弯半径（弧近似）：R ≈ step / dθ；环绕瞬移(>200px)已排除
    if (dth > 0.02) {
      const rad = step / dth
      if (rad < minR) minR = rad
      if (process.env.KOI_TRACE && rad < 8) {
        console.log(`  [trace] 帧${i} step=${step.toFixed(2)} dθ=${((dth * 180) / Math.PI).toFixed(0)}° R=${rad.toFixed(1)}px at (${h2.x.toFixed(0)},${h2.y.toFixed(0)})`)
      }
    }
    if (step < 1.5 && dth > 0.5) pivotFrames++
    if (step < minSpeed) minSpeed = step
    rotBuf.push(angDiff(ang, prevAng))
    if (rotBuf.length > 36) rotBuf.shift()
    let cum = 0
    for (const d of rotBuf) cum += d
    if (Math.abs(cum) > maxWinRot) maxWinRot = Math.abs(cum)
  }
  prevH = h2
  prevAng = ang
}
releasePointer()

// 整脊净弯：观察末段每帧身体点列的总转角和（头→尾），>270° 即卷成环/螺旋
let maxNetBend = 0
for (let i = 0; i < 60; i++) {
  tick()
  const bs = fishBodies()
  const pts = bs[sel]
  if (!pts || pts.length < 8) continue
  let net = 0
  let pa = null
  for (let k = 1; k < pts.length - 1; k++) {
    const a1 = Math.atan2(pts[k].y - pts[k - 1].y, pts[k].x - pts[k - 1].x)
    if (pa !== null) net += angDiff(a1, pa)
    pa = a1
  }
  if (Math.abs(net) > maxNetBend) maxNetBend = Math.abs(net)
}

console.log(`  pivot帧=${pivotFrames}  最小转弯半径=${minR === Infinity ? '∞' : minR.toFixed(1)}px  36帧最大累计旋转=${((maxWinRot * 180) / Math.PI).toFixed(0)}°  观察期最小帧位移=${minSpeed.toFixed(2)}px  整脊净弯峰值=${((maxNetBend * 180) / Math.PI).toFixed(0)}°`)
assert('T1 无 pivot 帧（低速下单帧转向 ≤0.5rad）', pivotFrames === 0, `${pivotFrames} 帧`)
assert('T2 最小转弯半径 > 6px（螺旋时塌到 0.2~2px）', minR > 6, `minR=${minR === Infinity ? '∞' : minR.toFixed(1)}`)
assert('T3 36 帧窗累计同向旋转 ≤500°（持续盘旋=卷环前兆）', maxWinRot <= (500 * Math.PI) / 180, `${((maxWinRot * 180) / Math.PI).toFixed(0)}°`)
// T4 基准重录（09-07）：巡航航向偏摆 0.35→0.12（真实锦鲤「头稳」参考）后，躲避从
// 「摇摆碎转」变为「坚决的完整 C 弯」——脉冲不再正负抵消，深 C 净弯实测 226°（种子
// 31337）。旧阈 200° 是在航向噪声下校准的。卷环硬线仍是 ~270°，阈 250° 留 20° 余量。
assert('T4 整脊净弯 ≤250°（≥270° 即身体卷成环）', maxNetBend <= (250 * Math.PI) / 180, `${((maxNetBend * 180) / Math.PI).toFixed(0)}°`)

dispose()
console.log(nanTotal ? `  ⚠ NaN 坐标=${nanTotal}` : `  apply/dispose 无异常 ✓（NaN 坐标=0）`)
console.log(fails ? `══ 掉头/螺旋探针存在 FAIL ✗（${label}）` : '══ 掉头/螺旋探针全部通过 ✓')
process.exit(fails ? 1 : 0)
