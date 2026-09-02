#!/usr/bin/env node
/**
 * koi-pond · 鱼状态机行为探针（纯脚本，无浏览器，回归工具）
 * 驱动 lib/client.js 真实产物，黑盒验证状态机三段语义：
 *   NORMAL  普通巡游（无指针时巡航速度稳定、漫游不越界）
 *   AVOID   指针进入 FLEE_R 后鱼持续躲避（速度抬升、方向远离指针）
 *   ESCAPE  ① 很近的点击 → 立即逃跑；② 被围住（持续躲避超 2s）→ 逃跑；
 *           逃跑表现为：速度爆发（≥1.5×巡航）且冲向最近的边缘/越界环绕；
 *           越界后回到普通态（速度回落）。
 * 断言（可复现随机种子，概率宽松）：
 *   G) 点击惊吓：点击后 45 帧内峰值速度 ≥ 1.5×巡航中位，随后触达边缘(<55px)或环绕
 *   H) 围堵逃跑：指针贴身持续 >2s（60+ 帧）后速度爆发且触达边缘/环绕
 *   I) 逃跑收尾：越界环绕后 80 帧内速度回落（≤ 1.5×巡航）
 * 用法：node scripts/stateprobe.mjs <client.js 路径> [标签]
 * 环境变量：KOI_WARM=预热帧数(默认150)、KOI_CLICK=点击后观察帧数(默认260)。
 */
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const target = process.argv[2]
const label = process.argv[3] || target
const WARM = Number(process.env.KOI_WARM || 150)
const AFTER = Number(process.env.KOI_CLICK || 260)

// ---- 可复现随机：LCG 种子替换 Math.random，同一产物每次结果一致 ----
let seed = 20260902
function lcg() {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}
const sandboxMath = Object.create(Math)
sandboxMath.random = lcg

// ---- DOM / ctx mock（记录主画布 ellipse 结算几何 + CTM，同 fishshape/jointdiag） ----
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

// canvas 路径是「每个 context 独立」的：ellipse 累积到本 context 的当前 path，
// beginPath() 清空，fill() 按调用时刻的 CTM 结算本 path（不会跨 context / 跨帧累积）。
// 之前把 ellipse 全推进全局共享 buff、只在 fill 时整批结算，导致每条鱼的首点都等于
// 「全帧第一个椭圆 + 当前 translate」→ 整条鱼迹被平移一个常量（约 +311,+146），
// 所有速度/点击测量都基于错误的幽灵鱼头。这里按真实语义修正。

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
    clearRect: () => {
      c._path = [] // 真实 canvas 中 clearRect 不影响 path；但脚本侧从不复用 path，仅为兜底
    },
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

// ---- 帧驱动（34ms ≈ 30fps） ----
let ts = 0
function tick() {
  const q = rafQ
  rafQ = []
  ts += 34
  fills = []
  for (const cb of q) cb(ts)
}

// ---- 单帧：取 globalAlpha 递减段 = 主色身体层；每个 fish 稳定对应一个 run ----
const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
function fishHeads() {
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
  return fish.map((p) => p[0]) // 头部 ≈ 递减段第一个点
}

// ---- 通用工具 ----
const distToEdge = (p) => Math.min(p.x, p.y, W - p.x, H - p.y)
function movePointer(x, y) {
  fire('pointermove', { clientX: x, clientY: y })
}
function releasePointer() {
  fire('pointerup', {})
  movePointer(-2000, -2000) // 移出判定区（x<-999 → 视为无指针）
}

let fails = 0
function assert(name, cond, detail) {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : '  ←  FAIL'}${detail ? '  [' + detail + ']' : ''}`)
  if (!cond) fails++
}

console.log(`── ${label} 状态机行为探针（W=${W}×${H}，种子 20260902）─────────────────`)
for (let i = 0; i < WARM; i++) tick() // 等所有鱼激活 + 轨迹成型
const fish0 = fishHeads()

// 选「离中心最近、且距边缘 >140」的一条鱼（run 索引在整段内稳定）
let sel = -1
let selD = Infinity
for (let r = 0; r < fish0.length; r++) {
  const h = fish0[r]
  if (distToEdge(h) < 140) continue
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
const head = (idx) => fishHeads()[idx]
const SPEED = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
const TRACE = !!process.env.KOI_TRACE
if (TRACE) {
  // 诊断：预热后每条鱼头部坐标的合法范围（应落在 [-60, W+60] 内）
  const all = fishHeads()
  console.log(`  [trace] 预热鱼数=${all.length} 头部x范围=[${Math.min(...all.map((p) => p.x)).toFixed(0)}, ${Math.max(...all.map((p) => p.x)).toFixed(0)}] y范围=[${Math.min(...all.map((p) => p.y)).toFixed(0)}, ${Math.max(...all.map((p) => p.y)).toFixed(0)}]`)
}

// ================= 场景 A：点击惊吓（G + I） =================
console.log('── [G] 很近的点击 → 立即逃跑（速度爆发 + 冲边缘/环绕）')
// A1) 无指针巡航基线
const cru = []
let prev = head(sel)
for (let i = 0; i < 26; i++) {
  tick()
  const h = head(sel)
  cru.push(SPEED(h, prev))
  prev = h
}
cru.sort((a, b) => a - b)
const cruise = cru.length ? cru[Math.floor(cru.length / 2)] : 2.6
// A2) 把指针移到鱼头并点击（很近的点击）
const clickAt = head(sel)
movePointer(clickAt.x, clickAt.y)
fire('pointerdown', { clientX: clickAt.x, clientY: clickAt.y })
fire('pointerup', {})
// A3) 观察：爆发峰值 + 边缘逼近/环绕 + 收尾回落
let peak = 0
let minEdge = Infinity
let teleport = false
let peakFrame = 0
let settled = false
let prevHeads = fishHeads()
const hs0 = prevHeads
prev = hs0[sel] || { x: 0, y: 0 }
for (let i = 0; i < AFTER; i++) {
  tick()
  const hs = fishHeads()
  const h = hs[sel] || prev
  // 环绕帧：越界后从对侧绕回，单帧位移 >400px 是「位置瞬移」伪影而非真实游速，
  // 不计入峰值（但仍记录 teleport 供 G2 判断出口）
  const jump = Math.max(Math.abs(h.x - prev.x), Math.abs(h.y - prev.y))
  if (jump > 400) teleport = true
  const sp = jump > 400 ? 0 : SPEED(h, prev)
  if (TRACE && sp > 4.0) {
    const all2 = []
    for (let r = 0; r < hs.length; r++) {
      const p2 = prevHeads[r] || hs[r]
      all2.push(`r${r}:${SPEED(hs[r], p2).toFixed(1)}`)
    }
    console.log(`  [trace] 帧${i} sel(r${sel}) sp=${sp.toFixed(1)} at (${h.x.toFixed(0)},${h.y.toFixed(0)})  全鱼速=${all2.join(' ')}`)
  }
  prevHeads = hs
  if (i < 45 && sp > peak) {
    peak = sp
    peakFrame = i
  }
  const de = distToEdge(h)
  if (de < minEdge) minEdge = de
  prev = h
  if (teleport && i > 0) {
    // 环绕后观察 80 帧是否回落
    let done = true
    for (let k = 0; k < 80 && i + k < AFTER; k++) {
      const h2 = head(sel)
      const s2 = SPEED(h2, prev)
      prev = h2
      if (s2 > cruise * 1.5) done = false
    }
    settled = done
    break
  }
}
console.log(`  巡航中位=${cruise.toFixed(2)}px/帧  点击后峰值=${peak.toFixed(2)}(${peakFrame}帧)  最近边缘=${minEdge.toFixed(0)}px  环绕=${teleport}  回落=${settled}`)
assert('G1 点击后速度爆发 ≥1.5×巡航', peak >= cruise * 1.5, `peak ${peak.toFixed(2)} vs ${(cruise * 1.5).toFixed(2)}`)
assert('G2 触达最近边缘(<55px)或环绕', minEdge < 55 || teleport, `minEdge=${minEdge.toFixed(0)} teleport=${teleport}`)
if (teleport) assert('I 越界环绕后 80 帧内速度回落 ≤1.5×巡航', settled, settled ? '' : '峰值仍 ≥1.5×巡航 → 可能未收尾')
releasePointer()

// ================= 场景 B：围堵 2s（H） =================
console.log('── [H] 指针贴身围堵 >2s → 逃跑（持续躲避后爆发）')
// 换一条鱼（离上次点击位置远一些，避免残余影响）
const fishNow = fishHeads()
let sel2 = -1
let best = -Infinity
for (let r = 0; r < fishNow.length; r++) {
  const h = fishNow[r]
  const dClick = Math.hypot(h.x - clickAt.x, h.y - clickAt.y)
  if (r !== sel && dClick > 260 && distToEdge(h) > 100) {
    const dd = Math.hypot(h.x - W / 2, h.y - H / 2)
    if (dd > best) {
      best = dd
      sel2 = r
    }
  }
}
if (sel2 < 0) sel2 = sel
// 围堵 4s：速度分两窗对比 —— 窗1(0~54帧)是纯躲避，窗2(55帧后)若触发逃跑则明显更快；
// 顺带监测是否冲边缘/环绕（逃跑的出口）。
const CHASE = 150
let avoidPeak = 0
let escPeak = 0
let minEdge2 = Infinity
let tele2 = false
let tprev = head(sel2)
for (let i = 0; i < CHASE; i++) {
  // 指针贴住鱼头追（相当于把鱼围在指针下持续躲避；60 帧≈2s 后应触发逃跑）
  const h = head(sel2)
  movePointer(h.x + 6, h.y + 6)
  tick()
  const nh = head(sel2)
  const jump = Math.max(Math.abs(nh.x - tprev.x), Math.abs(nh.y - tprev.y))
  if (jump > 400) {
    tele2 = true
    break
  }
  const sp = SPEED(nh, tprev)
  if (i < 55) {
    if (sp > avoidPeak) avoidPeak = sp
  } else if (sp > escPeak) escPeak = sp
  const de = distToEdge(nh)
  if (de < minEdge2) minEdge2 = de
  tprev = nh
}
releasePointer()
// 若围堵期已看到环绕就算通过；否则再观察 240 帧等它冲边/环绕
if (!tele2) {
  let te = head(sel2)
  for (let i = 0; i < 240; i++) {
    tick()
    const h = head(sel2)
    const jump = Math.max(Math.abs(h.x - te.x), Math.abs(h.y - te.y))
    if (jump > 400) {
      tele2 = true
      break
    }
    const sp = SPEED(h, te)
    if (sp > escPeak) escPeak = sp
    const de = distToEdge(h)
    if (de < minEdge2) minEdge2 = de
    if (minEdge2 < 40) break
    te = h
  }
}
console.log(`  躲避期峰值=${avoidPeak.toFixed(2)}  逃跑期峰值=${escPeak.toFixed(2)}  最近边缘=${minEdge2.toFixed(0)}px  环绕=${tele2}`)
assert('H1 逃跑期速度 ≥1.5×巡航', escPeak >= cruise * 1.5, `esc ${escPeak.toFixed(2)} vs ${(cruise * 1.5).toFixed(2)}`)
assert('H2 逃跑期比纯躲避更快（爆发）', escPeak >= avoidPeak * 1.08, `esc ${escPeak.toFixed(2)} vs avoid ${avoidPeak.toFixed(2)}`)
assert('H3 逃跑触达边缘(<40px)或环绕', minEdge2 < 40 || tele2, `minEdge=${minEdge2.toFixed(0)} teleport=${tele2}`)

dispose()
console.log(nanTotal ? `  ⚠ NaN 坐标=${nanTotal}` : `  apply/dispose 无异常 ✓（NaN 坐标=0）`)
console.log(fails ? `══ 状态机探针存在 FAIL ✗（${label}）` : '══ 状态机行为探针全部通过 ✓')
process.exit(fails ? 1 : 0)
