#!/usr/bin/env node
/**
 * koi-pond · 鱼体几何测量
 * 驱动 lib/client.js 真实产物，从主画布的 ellipse(x,y) 调用流反解出每条鱼的身体点列，
 * 量化两个指标：
 *   step  = 相邻身体点的间距中位数（越大 → 越容易露出串珠纹）
 *   span  = 单次绘制里头点到尾段末点的距离（≈ 体长，随速度漂移即「被拉长」）
 * 并模拟鼠标悬停触发躲闪，对比巡航 / 躲闪两态。
 * 用法：node .tmp/fishshape.mjs <client.js 路径> <标签>
 */
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const target = process.argv[2]
const label = process.argv[3] || target

// ---- DOM mock ----
const listeners = Object.create(null)
function addL(t, cb) {
  ;(listeners[t] || (listeners[t] = [])).push(cb)
}
function fire(t, ev) {
  for (const cb of listeners[t] || []) cb(ev)
}

let recording = false
let pts = []
let mainCtx = null
const ctxSeq = []
let ellipseTotal = 0
let nanTotal = 0

function alphaOf(fill) {
  const m = /^rgba\([^)]*,\s*([\d.]+)\)$/.exec(String(fill))
  return m ? parseFloat(m[1]) : 1
}

function makeCtx(owner) {
  const noop = () => {}
  // 2D 变换矩阵（仿 canvas CTM：a,b,c,d,e,f）。渲染层用 translate+局部坐标画
  // 身体段（ellLit）与鳍（save/translate/rotate），不还原变换就测不到世界坐标。
  const M = () => c._m
  const c = {
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'low',
    filter: 'none',
    clearRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    fillRect: noop,
    lineTo: noop,
    arc: noop,
    fill: noop,
    stroke: noop,
    drawImage: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    setTransform: (a, b, cc, d, e, f) => {
      c._m = [a, b, cc, d, e, f]
    },
    translate: (x, y) => {
      const m = M()
      c._m = [m[0], m[1], m[2], m[3], m[4] + x, m[5] + y]
    },
    rotate: (r) => {
      const cs = Math.cos(r)
      const sn = Math.sin(r)
      const [a, b, cc, d] = M()
      c._m = [a * cs + cc * sn, b * cs + d * sn, -a * sn + cc * cs, -b * sn + d * cs, M()[4], M()[5]]
    },
    scale: (sx, sy) => {
      const m = M()
      c._m = [m[0] * sx, m[1] * sx, m[2] * sy, m[3] * sy, m[4], m[5]]
    },
    // save/restore 同时追踪 globalAlpha 与 CTM（ellLit 的 alpha 在 globalAlpha 上）
    save: () => {
      c._stack.push({ a: c.globalAlpha, m: c._m })
    },
    restore: () => {
      const s = c._stack.pop()
      if (s) {
        c.globalAlpha = s.a
        c._m = s.m
      }
    },
    ellipse: (x, y) => {
      ellipseTotal++
      if (!Number.isFinite(x) || !Number.isFinite(y)) nanTotal++
      if (!recording || c !== mainCtx || process.env.KOI_NOANALYSE) return
      if (/^rgba\(8,8,8,/.test(String(c.fillStyle))) return
      // 腹侧反光层（drawBodyLight，rgba(14,58,74,…)）在身体层之后、隔点绘制，
      // 混入会把「体长」虚高约 1/3，按色值排除
      if (/^rgba\(14,58,74,/.test(String(c.fillStyle))) return
      const m = M()
      const wx = m[0] * x + m[2] * y + m[4]
      const wy = m[1] * x + m[3] * y + m[5]
      pts.push({ x: wx, y: wy, a: alphaOf(c.fillStyle) * c.globalAlpha })
    },
    fillStyle: '',
    _stack: [],
    _m: [1, 0, 0, 1, 0, 0],
  }
  ctxSeq.push(c)
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
    append: (c) => el.children.push(c),
    remove: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  if (tag === 'canvas') {
    el.width = 0
    el.height = 0
    let c = null
    el.getContext = () => (c || (c = makeCtx(el)))
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
    constructor(cb) {
      this._cb = cb
    }
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
// KOI_REDUCED=1 走「减动效」分支：鱼群立即全部激活 + 只渲染一帧
sandbox.window.matchMedia = () => ({
  matches: !!process.env.KOI_REDUCED,
  addEventListener() {},
  removeEventListener() {},
})

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

// 主画布 = 挂到 #koi-pond-dsh 容器里的那块 canvas
const pondHost = bodyEl.children.find((c) => c.id === 'koi-pond-dsh')
if (!pondHost || !pondHost.children[0]) throw new Error('未找到 #koi-pond-dsh 内的 canvas')
mainCtx = pondHost.children[0]._ctx
if (!mainCtx) throw new Error('主画布尚未取 context')

// ---- 帧驱动 ----
let ts = 0
let heads = []
function tick() {
  const q = rafQ
  rafQ = []
  ts += 34 // 30fps
  pts = []
  recording = true
  for (const cb of q) cb(ts)
  recording = false
  if (!process.env.KOI_NOANALYSE) heads = analyse().map((r) => r.head)
  return pts
}

// ---- 几何反解 ----
// frame() 绘制顺序 drawTail → drawBody：尾鳍层 alpha 递增（0.35→0.75）、
// 身体层 alpha 递减（0.9→0.3）。按 alpha 方向翻转切段，只保留递减段 = 身体层。
function splitLayers() {
  const runs = []
  let cur = []
  let prevDir = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    if (cur.length) {
      const d = p.a - cur[cur.length - 1].a
      const dir = Math.abs(d) < 1e-6 ? prevDir : Math.sign(d)
      if (dir !== prevDir) {
        runs.push(cur)
        cur = []
      }
      prevDir = dir
    } else {
      prevDir = 0
    }
    cur.push(p)
  }
  if (cur.length) runs.push(cur)
  return runs.filter((r) => r.length > 4)
}

// 单帧内 >GLITCH 的点距只可能是「环绕瞬移把身体拉断」，单独计数
const GLITCH = 100
function layerStats(r) {
  const d = []
  let glitch = 0
  for (let i = 1; i < r.length; i++) {
    const v = Math.hypot(r[i].x - r[i - 1].x, r[i].y - r[i - 1].y)
    if (v > GLITCH) glitch++
    else d.push(v)
  }
  d.sort((a, b) => a - b)
  const step = d.length ? d[Math.floor(d.length / 2)] : 0
  return {
    head: r[0],
    step,
    stepMax: d.length ? d[d.length - 1] : 0,
    span: (r.length - 1) * step, // 体长 = 段数 × 段间距（对瞬移跳变稳健）
    nBody: r.length,
    glitch,
  }
}

// 递减段 = 身体层（尾鳍层是递增段，直接丢弃）
function bodyLayer(r) {
  return r[0].a > r[r.length - 1].a ? r : null
}

function analyse() {
  return splitLayers()
    .map(bodyLayer)
    .filter((r) => r && r.length > 4)
    .map(layerStats)
}

const pct = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : 0)
function newSet() {
  return { step: [], span: [], spanN: [], nBody: [], stepMax: [], glitch: 0 }
}
function collect(out, r) {
  if (r.span <= 0) return
  out.step.push(r.step)
  out.span.push(r.span)
  out.spanN.push(r.span / Math.max(1, r.nBody - 1)) // 每段体长，消除鱼体型采样偏差
  out.nBody.push(r.nBody)
  out.stepMax.push(r.stepMax)
  out.glitch += r.glitch
}
function snapshot(frames) {
  const out = newSet()
  for (let i = 0; i < frames; i++) {
    tick()
    for (const r of analyse()) collect(out, r)
  }
  return out
}

function report(tag, s) {
  const f = (n) => n.toFixed(2).padStart(7)
  const mx = (a) => (a.length ? Math.max(...a) : 0)
  const mn = (a) => (a.length ? Math.min(...a) : 0)
  const nan = s.step.filter((v) => !Number.isFinite(v)).length
  console.log(
    `${tag.padEnd(14)} 段距 中位=${f(pct(s.step, 0.5))} p95=${f(pct(s.step, 0.95))} min=${f(mn(s.step))} max=${f(mx(s.stepMax))}  |  ` +
      `体长 中位=${f(pct(s.span, 0.5))} max=${f(mx(s.span))}  |  点数=${pct(s.nBody, 0.5)}  拉断帧=${s.glitch}` +
      (nan ? `  NaN=${nan} ⚠` : '')
  )
}

// ---- 阶段一：巡航（无指针） ----
for (let i = 0; i < Number(process.env.KOI_WARM || 150); i++) tick() // 等全部鱼激活 + 轨迹成型
const cruise = snapshot(Number(process.env.KOI_MEASURE || 40))
report('巡航', cruise)

// ---- 阶段二：指针追鱼（模拟「把鼠标移到鱼身上」） ----
// 指针以有限速度（9px/帧）追最近的一条鱼。指针不能被焊死在鱼头上：
// 那样 dd≈0 会让逃逸方向每帧乱翻转，鱼会被钉在原地而不是逃窜。
const FLEE_R = 150 // 与源码一致
const CHASE_SPEED = 7
let mx = 960
let my = 540
let chasing = true
const panic = newSet()
const bystander = newSet()
let prevHead = null

const CHASE_FRAMES = Number(process.env.KOI_FRAMES || 240)
for (let i = 0; i < CHASE_FRAMES; i++) {
  const a = heads.length ? heads : [{ x: mx, y: my }]
  // 追最近的那条鱼
  let tg = a[0]
  let td = Infinity
  for (const h of a) {
    const d = Math.hypot(h.x - mx, h.y - my)
    if (d < td) {
      td = d
      tg = h
    }
  }
  // 滞后：贴到 50px 内就停手（用户把鼠标停在鱼身上），鱼逃到 130px 外再追
  if (td < 50) chasing = false
  else if (td > 130) chasing = true
  if (chasing) {
    const vx = tg.x - mx
    const vy = tg.y - my
    const vl = Math.hypot(vx, vy) || 1
    const stp = Math.min(CHASE_SPEED, vl)
    mx += (vx / vl) * stp
    my += (vy / vl) * stp
  }

  fire('pointermove', { clientX: mx, clientY: my })
  tick()

  const cur = analyse()
  if (!cur.length) continue
  let best = cur[0]
  let bd = Infinity
  for (const r of cur) {
    const d = Math.hypot(r.head.x - mx, r.head.y - my)
    if (d < bd) {
      bd = d
      best = r
    }
  }
  if (process.env.KOI_DEBUG && i % 20 === 0 && prevHead) {
    const v = Math.hypot(best.head.x - prevHead.x, best.head.y - prevHead.y)
    console.log(
      `  [debug] f=${i} 指针↔鱼=${bd.toFixed(0)}px 鱼速=${v.toFixed(2)}px/帧 段距=${best.step.toFixed(2)} 体长=${best.span.toFixed(0)}`
    )
  }
  prevHead = best.head
  if (bd < FLEE_R) collect(panic, best)
  for (const r of cur) {
    if (r === best) continue
    if (Math.hypot(r.head.x - mx, r.head.y - my) > FLEE_R * 2) collect(bystander, r)
  }
}
report('躲闪(逃逸圈内)', panic)
report('同帧(圈外鱼)', bystander)

console.log(
  `${' '.repeat(14)} 体长漂移(躲闪/巡航) = ${(pct(panic.spanN, 0.5) / Math.max(0.01, pct(cruise.spanN, 0.5))).toFixed(2)}×   ` +
    `段距漂移 = ${(pct(panic.step, 0.5) / Math.max(0.01, pct(cruise.step, 0.5))).toFixed(2)}×   （1.00× 为不随速度变化）`
)

// ---- 减动效分支：apply() 内同步渲染一帧，验证确实画出了鱼且坐标无 NaN ----
if (process.env.KOI_REDUCED) {
  console.log(
    `${' '.repeat(14)} [减动效] 该帧 ellipse 总数=${ellipseTotal}  NaN 坐标=${nanTotal}  ` +
      (ellipseTotal > 0 && nanTotal === 0 ? '✓ 鱼已画出且坐标有效' : '⚠ 异常')
  )
}

dispose()
console.log(`${label.padEnd(16)} apply/dispose 无异常 ✓`)
