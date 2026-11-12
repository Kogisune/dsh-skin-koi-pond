#!/usr/bin/env node
/**
 * koi-pond · 运动形态诊断探针（只读观测，不设断言）
 *
 * 目的：把「转弯生硬旋转」「摆尾不自然」这两个观感症状，落成可测的逐帧曲线。
 * 手段：对 lib/client.js 文本做一次内存插桩（不改磁盘源码、不改产物），
 *       在 frame() 末尾把 flock 的体态状态快照出来；Node vm 沙箱固定 LCG 种子驱动。
 *
 * 观测指标：
 *   - 摆尾：体波周期、尾端法向摆幅（高通去趋势后）、各关节角幅值分布、
 *           沿脊柱的相位滞后、尾鳍/胸鳍角度周期与体波是否同频
 *   - 转弯：航向 dθ 序列与二阶差分、头段方向是否 1:1 硬锁 vel、
 *           稳态弯曲（C 形）占比、身体弯曲相对转向发起的滞后
 *
 * 用法：node scripts/motiondiag.mjs [client.js 路径] [标签]
 * 环境变量：KOI_SEED（默认 20260902）、KOI_FRAMES（默认 520）
 */
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const target = process.argv[2] || 'lib/client.js'
const label = process.argv[3] || target
const FRAMES = Number(process.env.KOI_FRAMES || 520)

// ---- 可复现随机 ----
let seed = Number(process.env.KOI_SEED || 20260902) >>> 0
function lcg() {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}
const sandboxMath = Object.create(Math)
sandboxMath.random = lcg

// ---- DOM / canvas mock（与 stateprobe 同一套最小语义）----
const noop = () => {}
const R = (v) => (Number.isFinite(v) ? v : 0)
function makeCtx() {
  const c = {
    strokeStyle: '', lineWidth: 1, globalAlpha: 1, imageSmoothingEnabled: true, filter: 'none',
    setTransform: (a, b, cc, d, e, f) => { c._m = [a, b, cc, d, e, f] },
    translate: (x, y) => { const m = c._m; c._m = [m[0], m[1], m[2], m[3], m[4] + R(x), m[5] + R(y)] },
    rotate: (r) => {
      const cs = Math.cos(r), sn = Math.sin(r)
      const [a, b, cc, d, e, f] = c._m
      c._m = [a * cs + cc * sn, b * cs + d * sn, -a * sn + cc * cs, -b * sn + d * cs, e, f]
    },
    scale: (sx, sy) => { const m = c._m; c._m = [m[0] * sx, m[1] * sx, m[2] * sy, m[3] * sy, m[4], m[5]] },
    save: () => c._stack.push({ a: c.globalAlpha, m: c._m }),
    restore: () => { const s = c._stack.pop(); if (s) { c.globalAlpha = s.a; c._m = s.m } },
    clearRect: noop, fillRect: noop, arc: noop, beginPath: noop, closePath: noop,
    moveTo: noop, lineTo: noop, drawImage: noop, clip: noop,
    quadraticCurveTo: noop, bezierCurveTo: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => null,
    ellipse: noop, fill: noop, stroke: noop,
    _stack: [], _path: [], _m: [1, 0, 0, 1, 0, 0],
  }
  return c
}
function makeEl(tag) {
  const attrs = {}
  const el = {
    tagName: tag, style: {}, dataset: {}, children: [], id: '', textContent: '',
    setAttribute: (k, v) => { attrs[k] = v },
    getAttribute: (k) => (k in attrs ? attrs[k] : null),
    removeAttribute: (k) => { delete attrs[k] },
    hasAttribute: (k) => k in attrs,
    append: (ch) => el.children.push(ch), remove: noop,
    addEventListener: noop, removeEventListener: noop,
  }
  if (tag === 'canvas') {
    el.width = 0; el.height = 0
    let c = null
    el.getContext = () => (c || (c = makeCtx()))
    Object.defineProperty(el, '_ctx', { get: () => c })
  }
  return el
}
const W = 1280, H = 720
const bodyEl = makeEl('body')
let rafQ = []
const listeners = Object.create(null)
function addL(t, cb) { (listeners[t] || (listeners[t] = [])).push(cb) }
const sandbox = {
  console, Math: sandboxMath, Date,
  document: {
    body: bodyEl, head: makeEl('head'), hidden: false,
    createElement: makeEl, addEventListener: noop, removeEventListener: noop,
  },
  localStorage: { getItem: () => null, setItem: noop },
  MutationObserver: class { observe() {} disconnect() {} },
  requestAnimationFrame: (cb) => rafQ.push(cb),
  cancelAnimationFrame: noop,
  location: { search: '' },
}
sandbox.window = sandbox
sandbox.addEventListener = addL
sandbox.removeEventListener = noop
sandbox.window.innerWidth = W
sandbox.window.innerHeight = H
sandbox.window.devicePixelRatio = 1
sandbox.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })

// ---- 插桩：frame() 末尾导出 flock 快照（只在 render=true 分支到达）----
let src = readFileSync(target, 'utf8')
const ANCHOR = '  if (specimenRef && specimenRef.active) drawSpecimenDebug(specimenRef)\n  drawFishDebugAll()\n}'
if (!src.includes(ANCHOR)) throw new Error('未找到 frame() 末尾插桩锚点（产物结构变了）')
src = src.replace(
  ANCHOR,
  '  if (specimenRef && specimenRef.active) drawSpecimenDebug(specimenRef)\n  drawFishDebugAll()\n  if (window.__motionDiag) window.__motionDiag(flock, frameCount)\n}'
)

// ---- 快照采集（每条鱼一份）----
const frames = []
sandbox.__motionDiag = (flock, frameCount) => {
  const snap = []
  for (const k of flock || []) {
    if (!k || !k.sk || !k.sk.spine) continue
    snap.push(snapshot(k, frameCount))
  }
  frames.push({ f: frameCount, fish: snap })
}
function snapshot(k, frameCount) {
  const sk = k.sk
  const m = sk.spine.length
  const body = k.body
  const n = body.length
  const a0 = sk.spine[0]
  const dx = body[n - 1].x - body[0].x
  const dy = body[n - 1].y - body[0].y
  const tailOff = -Math.sin(a0) * dx + Math.cos(a0) * dy
  const idx = [sk.headSegs, Math.round(m * 0.33), Math.round(m * 0.66), m - 1]
  const rel = idx.map((i) => (sk.rel[Math.max(0, Math.min(m - 1, i))] * 180) / Math.PI)
  let bendSum = 0
  for (let i = 0; i < m; i++) bendSum += sk.bend[i]
  const tn = sk.tan[n - 1]
  const finAng = tn ? Math.atan2(tn.dy, tn.dx) + Math.PI : NaN
  return {
    f: frameCount,
    x: k.pos.x, y: k.pos.y,
    hdg: Math.atan2(k.vel.y, k.vel.x),
    sp: Math.hypot(k.vel.x, k.vel.y),
    ph: k.swimPhase, beat: k.beat, panic: k.panic,
    speedNorm: k.speedNorm, cruise: k.cruise,
    spine0: a0, spineTail: sk.spine[m - 1],
    bodyBend: (sk.spine[m - 1] - a0) * 180 / Math.PI,
    tailOff, bodyArc: k.baseSize * 5.75,
    rel, bendSum,
    flap: sk.flap, spread: sk.spread, finAng,
    state: k.fs ? k.fs.name : '?',
  }
}

let mod = null
sandbox.window.__ModuleLoader__ = {
  load: (spec) => { mod = spec.factory(() => { throw new Error('require unsupported') }) },
}
vm.createContext(sandbox)
vm.runInContext(src, sandbox, { filename: target })
mod.apply()

// ---- 帧驱动：略大于 1/30s，避免累加器补步破坏逐帧连续性 ----
let ts = 0
function tick() {
  const q = rafQ; rafQ = []
  ts += 1000 / 30 + 1e-6
  for (const cb of q) cb(ts)
}
for (let i = 0; i < FRAMES; i++) tick()
if (frames.length < 300) throw new Error(`有效帧不足：${frames.length}`)

// ---- 工具 ----
const D = 180 / Math.PI
const norm = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a }
const pctl = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))] }
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1)
function period(sig) {
  const xs = []
  for (let i = 1; i < sig.length; i++) if (sig[i - 1] < 0 && sig[i] >= 0) xs.push(i)
  const gaps = []
  for (let i = 1; i < xs.length; i++) gaps.push(xs[i] - xs[i - 1])
  return { n: gaps.length, frames: mean(gaps) }
}
// 滑动均值去趋势（高通）：把持续转弯造成的巨大直流弯曲剔掉，只留摆尾交流分量
function detrend(sig, half = 12) {
  return sig.map((v, i) => {
    let s = 0, c = 0
    for (let j = Math.max(0, i - half); j <= Math.min(sig.length - 1, i + half); j++) { s += sig[j]; c++ }
    return v - s / c
  })
}
function lagOf(a, b, maxLag = 20) {
  const na = a.map((v) => v - mean(a)), nb = b.map((v) => v - mean(b))
  let best = -Infinity, bestLag = 0
  for (let L = -maxLag; L <= maxLag; L++) {
    let s = 0, cnt = 0
    for (let i = 0; i < na.length; i++) {
      const j = i + L
      if (j < 0 || j >= nb.length) continue
      s += na[i] * nb[j]; cnt++
    }
    const v = s / (cnt || 1)
    if (v > best) { best = v; bestLag = L }
  }
  return bestLag
}
function unwrap(sig) {
  const out = [sig[0]]
  for (let i = 1; i < sig.length; i++) out.push(out[i - 1] + norm(sig[i] - sig[i - 1]))
  return out
}

// ---- 分鱼时间序列 ----
const WARM = 160
const NF = Math.min(...frames.slice(WARM).map((fr) => fr.fish.length))
const series = Array.from({ length: NF }, (_, fi) => frames.slice(WARM).map((fr) => fr.fish[fi]).filter(Boolean))
const dThetaOf = (s) => s.map((r, i) => i ? norm(r.hdg - s[i - 1].hdg) * D : 0)
const dThetaAll = series.map(dThetaOf)
// 找满足条件的最长连续段（跨鱼取最长）
function longestRun(pred) {
  let best = { fi: 0, from: 0, to: 0, len: 0 }
  for (let fi = 0; fi < NF; fi++) {
    const d = dThetaAll[fi]
    let st = -1
    for (let i = 0; i <= d.length; i++) {
      const ok = i < d.length && pred(d[i], i, fi)
      if (ok && st < 0) st = i
      else if (!ok && st >= 0) {
        if (i - st > best.len) best = { fi, from: st, to: i, len: i - st }
        st = -1
      }
    }
  }
  return best
}
const straight = longestRun((v, i, fi) => Math.abs(v) < 0.6 && series[fi][i].sp > 1.5)
const slow = longestRun((v, i, fi) => series[fi][i].sp < 0.8)
const turning = longestRun((v) => Math.abs(v) > 1.0)

// ---- 全局指标 ----
const allD = dThetaAll.flat()
const allBend = series.flatMap((s) => s.map((r) => Math.abs(r.bodyBend)))
const allHeadOff = series.flatMap((s) => s.map((r) => Math.abs(norm(r.spine0 - (r.hdg + Math.PI))) * D))
const allJHead = series.flatMap((s) => s.map((r, i) => i ? norm(r.spine0 - s[i - 1].spine0) * D : 0))
let lockNum = 0, lockDen = 0
for (let i = 0; i < allD.length; i++) { lockNum += allJHead[i] * allD[i]; lockDen += allD[i] * allD[i] }
const jerkAll = dThetaAll.flatMap((d) => d.map((v, i) => i ? Math.abs(v - d[i - 1]) : 0))

console.log(`\n===== ${label} · 运动形态诊断（seed ${process.env.KOI_SEED || 20260902}，有效帧 ${frames.length}，鱼 ${NF} 条）=====`)
console.log(`常态直游段：鱼#${straight.fi} 帧 ${series[straight.fi][straight.from]?.f}–${series[straight.fi][straight.to - 1]?.f}（${straight.len} 帧，|dθ|<0.6° 且 v>1.5）`)
console.log(`近停滞段：鱼#${slow.fi} ${slow.len} 帧（v<0.8，即 SPEED_FLOOR 0.6 附近）｜持续转弯段：鱼#${turning.fi} ${turning.len} 帧（|dθ|>1.0°）`)

// 1) 摆尾节奏（准直游段）
const ss = series[straight.fi].slice(straight.from, straight.to)
const dPh = mean(ss.slice(1).map((r, i) => r.ph - ss[i].ph))
const waveFrames = 2 * Math.PI / dPh
const tailAC = detrend(ss.map((r) => r.tailOff))
const finAC = detrend(unwrap(ss.map((r) => r.finAng)))
const bodyBendAC = detrend(ss.map((r) => r.bodyBend))
const flapSig = ss.map((r) => r.flap - mean(ss.map((v) => v.flap)))
const spreadSig = ss.map((r) => r.spread - mean(ss.map((v) => v.spread)))
const tailP = period(tailAC), finP = period(finAC), flapP = period(flapSig), spreadP = period(spreadSig)
console.log('\n-- 1) 摆尾节奏（准直游段，周期单位：帧 @30fps）--')
const dPhArr = ss.slice(1).map((r, i) => r.ph - ss[i].ph)
console.log(`体波相位 dφ/帧 = ${dPh.toFixed(4)} rad（p50 ${pctl(dPhArr, 0.5).toFixed(4)}，min ${Math.min(...dPhArr).toFixed(4)}，max ${Math.max(...dPhArr).toFixed(4)}）→ 理论周期 ${waveFrames.toFixed(1)} 帧 / ${(waveFrames / 30).toFixed(2)}s（${(30 / waveFrames).toFixed(2)}Hz）`)
console.log(`该鱼 beat p50 ${pctl(ss.map((r) => r.beat), 0.5).toFixed(3)}｜speedNorm p50 ${pctl(ss.map((r) => r.speedNorm), 0.5).toFixed(3)}｜cruise ${ss[0].cruise.toFixed(2)}｜实速 p50 ${pctl(ss.map((r) => r.sp), 0.5).toFixed(2)}｜panic p50 ${pctl(ss.map((r) => r.panic), 0.5).toFixed(2)}｜状态 ${ss[0].state}`)
console.log(`尾端摆幅 AC 周期 ${tailP.frames.toFixed(1)} 帧（${tailP.n} 个周期）｜尾鳍角度 AC ${finP.frames.toFixed(1)} 帧｜bodyBend AC ${period(bodyBendAC).frames.toFixed(1)} 帧`)
console.log(`胸鳍 flap ${flapP.frames.toFixed(1)} 帧 = ${(flapP.frames / waveFrames).toFixed(2)}× 体波｜尾鳍 spread ${spreadP.frames.toFixed(1)} 帧 = ${(spreadP.frames / waveFrames).toFixed(2)}× 体波`)
console.log('（A1 前：spread 是渲染层不读的死变量、频率 0.5× 体波；A1 后：同频 + 相位滞后，叠加进尾鳍角度）')

// 2) 摆幅与沿体分布
const arc = mean(ss.map((r) => r.bodyArc))
const ampPx = pctl(tailAC.map(Math.abs), 0.95)
const relSeries = [0, 1, 2, 3].map((j) => detrend(ss.map((r) => r.rel[j])))
const relAmp = relSeries.map((s) => pctl(s.map(Math.abs), 0.95))
console.log('\n-- 2) 摆幅与沿体分布（准直游段，AC 分量）--')
console.log(`尾端法向摆幅 p95 = ${ampPx.toFixed(2)}px = 体长 ${(ampPx / arc * 100).toFixed(1)}%（体长 ${arc.toFixed(0)}px）`)
console.log(`头尾朝向差 AC p95 = ${pctl(bodyBendAC.map(Math.abs), 0.95).toFixed(2)}°｜稳态 DC 弯曲 p50 = ${pctl(allBend, 0.5).toFixed(1)}°，p95 = ${pctl(allBend, 0.95).toFixed(1)}°（全群全段）`)
console.log(`关节角 AC p95（头后 / 1-3 / 2-3 / 尾端）= ${relAmp.map((v) => v.toFixed(2) + '°').join(' / ')}`)
console.log(`沿脊柱相位滞后（互相关 lag 帧）：头后→1/3 ${lagOf(relSeries[0], relSeries[1])}，1/3→2/3 ${lagOf(relSeries[1], relSeries[2])}，2/3→尾 ${lagOf(relSeries[2], relSeries[3])}，头后→尾 ${lagOf(relSeries[0], relSeries[3])}`)
console.log(`理论行波滞后：WAVE_SPAN=4.5 rad 沿全长 → 整条鱼相位差 ${(4.5 / dPh).toFixed(1)} 帧；头后→尾实测见上`)

// 3) 转弯平滑度 / 刚性
console.log('\n-- 3) 转弯平滑度与头段刚性（全群全段）--')
console.log(`航向 dθ：p50 |值| ${pctl(allD.map(Math.abs), 0.5).toFixed(2)}°/帧，p95 ${pctl(allD.map(Math.abs), 0.95).toFixed(2)}°，max ${Math.max(...allD.map(Math.abs)).toFixed(2)}°`)
console.log(`持续转弯占比（|dθ|>1°）：${(allD.filter((v) => Math.abs(v) > 1).length / allD.length * 100).toFixed(1)}%；稳态弯成 C 形（|bodyBend|>45°）占比 ${(allBend.filter((v) => v > 45).length / allBend.length * 100).toFixed(1)}%`)
console.log(`dθ 二阶差分 |jerk|：p50 ${pctl(jerkAll, 0.5).toFixed(2)}°，p95 ${pctl(jerkAll, 0.95).toFixed(2)}°，max ${Math.max(...jerkAll).toFixed(2)}°`)
console.log(`头段方向变化 / 航向变化 回归斜率 = ${(lockNum / (lockDen || 1)).toFixed(3)}（=1 表示头段 1:1 硬锁速度方向，无 yaw 自由度）`)
console.log(`头段朝向与 vel 反向偏差：p50 ${pctl(allHeadOff, 0.5).toFixed(2)}°，p95 ${pctl(allHeadOff, 0.95).toFixed(2)}°`)

// 4) 转弯事件：找 dθ 的剧烈变化（不是恒定盘旋的中间）
const ts2 = series[turning.fi]
const d2 = dThetaAll[turning.fi]
let evAt = -1, evScore = -1
for (let i = 2; i < d2.length - 2; i++) {
  const score = Math.abs(d2[i] - d2[i - 1]) + Math.abs(d2[i + 1] - d2[i])
  if (score > evScore) { evScore = score; evAt = i }
}
console.log(`\n-- 4) 最剧烈转向变化（鱼#${turning.fi} 帧 ${ts2[evAt]?.f}）: 帧 / 航向dθ° / 头段dθ° / 头尾弯曲° / 尾偏px / bend脉冲 / 速度 --`)
for (let i = Math.max(1, evAt - 10); i <= Math.min(ts2.length - 1, evAt + 16); i++) {
  const r = ts2[i]
  const hd = i ? norm(r.spine0 - ts2[i - 1].spine0) * D : 0
  console.log(`${String(r.f).padStart(4)}  dθ=${d2[i].toFixed(1).padStart(6)}  head=${hd.toFixed(1).padStart(6)}  bend=${r.bodyBend.toFixed(1).padStart(6)}  tail=${r.tailOff.toFixed(1).padStart(6)}  pulse=${r.bendSum.toFixed(2).padStart(6)}  v=${r.sp.toFixed(1)}`)
}

// 5) 因果时序：dθ 与 bodyBend(AC) 的互相关
const dBend = detrend(ts2.map((r) => r.bodyBend))
const lag = lagOf(d2, dBend, 30)
console.log(`\n-- 5) 因果时序（互相关，正 = 航向领先弯曲）--`)
console.log(`dθ → 身体弯曲 AC 的 lag = ${lag} 帧（约 ${(lag / 30 * 1000).toFixed(0)}ms）`)
console.log('真实鱼 C-start：身体先弯、航向后变（lag 应为负）；此处为正 = 先转后弯 = 体态只是路径历史的装饰。')

// 6) 相位锁定平均：按 swimPhase 分箱，不依赖「直游段」长度，全鱼全段统计
function phaseAvg(keyFn, bins = 16) {
  const sum = new Array(bins).fill(0)
  const cnt = new Array(bins).fill(0)
  for (const s of series) {
    const raw = s.map(keyFn)
    const ac = detrend(raw, 14)
    for (let i = 0; i < s.length; i++) {
      const b = Math.floor((((s[i].ph % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * bins) % bins
      sum[b] += ac[i]; cnt[b]++
    }
  }
  return sum.map((v, i) => v / (cnt[i] || 1))
}
function pp(a) { return Math.max(...a) - Math.min(...a) }
const plTail = phaseAvg((r) => r.tailOff)
const plFin = phaseAvg((r) => r.finAng)
const plBend = phaseAvg((r) => r.bodyBend)
const arcAll = mean(series.flatMap((s) => s.map((r) => r.bodyArc)))
console.log('\n-- 6) 相位锁定平均（全鱼全段，按 swimPhase 分 16 箱）--')
console.log(`尾端法向摆幅 峰峰 = ${pp(plTail).toFixed(2)}px = 体长 ${(pp(plTail) / arcAll * 100).toFixed(1)}%｜头尾朝向差 峰峰 = ${pp(plBend).toFixed(2)}°｜尾鳍绘制角度 峰峰 = ${(pp(plFin) * D).toFixed(2)}°`)
console.log(`尾端波形（16 箱，px）= [${plTail.map((v) => v.toFixed(1)).join(', ')}]`)
console.log(`（真实鲤科巡航尾端摆幅约 10~20% 体长；尾鳍应有独立于尾柄的 power stroke 相位滞后）\n`)
