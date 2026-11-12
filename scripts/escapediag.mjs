#!/usr/bin/env node
/**
 * koi-pond · 逃跑 / 躲避形态诊断探针（只读观测，不设断言）
 *
 * 目的：把用户目测的「鼠标驱赶时身体弯曲不自然 + 明显整体旋转」落成可测的逐帧曲线，
 *       对照真实鱼 C-start / fast-start 的时序（先 C-bend → 反向甩尾 → 航向改变）。
 *
 * 手段：对 lib/client.js 文本做一次内存插桩（不改磁盘源码、不改产物），在 frame()
 *       末尾导出 flock 快照；Node vm 沙箱固定 LCG 种子，按 30fps 驱动 rAF，
 *       在指定帧注入真实的 pointermove / pointerdown 事件。
 *
 * 场景（KOI_SCENE）：
 *   avoid  鼠标横扫靠近目标鱼头部 → AVOID（默认）
 *   click  在目标鱼头部按下 → ESCAPE（点击惊吓）
 *   chase  鼠标每帧贴身跟随 → 连续躲避 2s 后自动 ESCAPE
 *
 * 关键量化：
 *   - 整体旋转：航向/头段/弦角/尾段四者变化是否同步；身体形状(rel[])变化是否远小于朝向变化
 *   - C-start 时序：身体弯曲峰值帧 vs 航向变化峰值帧（真实鱼应「先弯后转」）
 *   - 弯曲波：bend[] 峰值、关节 cap 饱和率、累计关节角（卷环检测）
 *   - 几何突变：速度倍率、trail 覆盖帧数（体长 / 每帧位移）、弦长/体长
 *   - 摆尾放大：panic/beat → spineTilt 角场幅值倍数、摆频变化
 *
 * 用法：node scripts/escapediag.mjs [client.js 路径] [标签]
 * 环境变量：KOI_SEED（默认 20260902）、KOI_T0（触发帧，默认 180）、KOI_SCENE、KOI_AFTER（默认 110）
 */
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const target = process.argv[2] || 'lib/client.js'
const label = process.argv[3] || target
const T0 = Number(process.env.KOI_T0 || 180)
const AFTER = Number(process.env.KOI_AFTER || 110)
const SCENE = process.env.KOI_SCENE || 'avoid'

// ---- 可复现随机 ----
let seed = Number(process.env.KOI_SEED || 20260902) >>> 0
function lcg() {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}
const sandboxMath = Object.create(Math)
sandboxMath.random = lcg

// ---- DOM / canvas mock（与 motiondiag / stateprobe 同一套最小语义）----
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
    scale: (sx, sy) => { const m = c._m; c._m = [m[0] * sx, m[1] * sy, m[2] * sy, m[3] * sy, m[4], m[5]] },
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
function fire(t, ev) { for (const cb of listeners[t] || []) cb(ev) }
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

// ---- 插桩：frame() 末尾导出快照 ----
let src = readFileSync(target, 'utf8')
const ANCHOR = '  if (specimenRef && specimenRef.active) drawSpecimenDebug(specimenRef)\n  drawFishDebugAll()\n}'
if (!src.includes(ANCHOR)) throw new Error('未找到 frame() 末尾插桩锚点（产物结构变了）')
src = src.replace(
  ANCHOR,
  '  if (specimenRef && specimenRef.active) drawSpecimenDebug(specimenRef)\n  drawFishDebugAll()\n  if (window.__escapeDiag) window.__escapeDiag(flock, frameCount)\n}'
)

const D = 180 / Math.PI
const frames = []
sandbox.__escapeDiag = (flock, f) => {
  const snap = []
  for (const k of flock || []) {
    if (!k || !k.sk || !k.sk.spine) continue
    const sk = k.sk
    const m = sk.spine.length
    const body = k.body
    const n = body.length
    const a0 = sk.spine[0]
    const aT = sk.spine[m - 1]
    const dx = body[n - 1].x - body[0].x
    const dy = body[n - 1].y - body[0].y
    const chord = Math.atan2(dy, dx)
    const chordLen = Math.hypot(dx, dy)
    const arc = k.baseSize * 5.75
    let sumRel = 0, capSat = 0, bendSum = 0, bendMax = 0
    const rel = []
    for (let i = 0; i < m; i++) {
      const r = sk.rel[i] || 0
      rel.push(r * D)
      sumRel += r * D
      if (Math.abs(r) > sk.jointCaps[i] * 0.98 && sk.jointCaps[i] > 0) capSat++
      bendSum += sk.bend[i]
      if (Math.abs(sk.bend[i]) > bendMax) bendMax = Math.abs(sk.bend[i])
    }
    // 头部轨迹覆盖帧数：从最新点往回走，累计弧长够一个体长需要多少帧
    const tr = k.trail
    let walked = 0, span = 0
    for (let i = 0; i < tr.length - 1; i++) {
      walked += Math.hypot(tr[i + 1].x - tr[i].x, tr[i + 1].y - tr[i].y)
      span++
      if (walked >= arc) break
    }
    // 身体自交：非相邻节点距离小于 1/4 体长（卷环指标）
    let minSelf = Infinity
    for (let i = 0; i < n; i += 2) {
      for (let j = i + 8; j < n; j += 2) {
        const dd = Math.hypot(body[j].x - body[i].x, body[j].y - body[i].y)
        if (dd < minSelf) minSelf = dd
      }
    }
    snap.push({
      f, x: k.pos.x, y: k.pos.y,
      state: k.fs ? k.fs.name : '?', ft: k.fs ? k.fs.t : 0,
      hdg: Math.atan2(k.vel.y, k.vel.x),
      sp: Math.hypot(k.vel.x, k.vel.y),
      panic: k.panic, beat: k.beat, speedNorm: k.speedNorm, ph: k.swimPhase,
      cruise: k.cruise, arc,
      spine0: a0, spineTail: aT, chord, chordLen,
      bodyBend: (aT - a0) * D,
      tailOff: -Math.sin(a0) * dx + Math.cos(a0) * dy,
      sumRel, capSat, capN: m, bendSum, bendMax,
      rel,
      span, minSelf,
      // 按产物自动选 spineTilt 幅值公式：A3-1 前 beat 帽 2.2 / panic +0.4；
      // A3-1 后 1.6 / +0.15。否则 A/B 会把旧版幅值低估约 35%。
      hasCstart: !!sk.cstartPulse,
      tiltAmp: sk.cstartPulse
        ? 0.36 * (0.45 + 0.55 * Math.min(1.6, k.beat || 1)) * (1 + 0.15 * (k.panic || 0))
        : 0.36 * (0.45 + 0.55 * Math.min(2.2, k.beat || 1)) * (1 + 0.4 * (k.panic || 0)),
      cstartT: sk.cstartT === undefined ? -1 : sk.cstartT,
      cstartBend: sk.cstartPulse ? sk.cstartPulse.reduce((s, v) => s + v, 0) * D : 0,
      turnCum: k.turnCum || 0,
    })
  }
  frames.push({ f, fish: snap })
}

let mod = null
sandbox.window.__ModuleLoader__ = {
  load: (spec) => { mod = spec.factory(() => { throw new Error('require unsupported') }) },
}
vm.createContext(sandbox)
vm.runInContext(src, sandbox, { filename: target })
mod.apply()

// ---- 帧驱动 + 事件注入 ----
let ts = 0
function tick() {
  const q = rafQ; rafQ = []
  ts += 1000 / 30 + 1e-6
  for (const cb of q) cb(ts)
}
const TOTAL = T0 + AFTER
let targetFi = -1
let t0Fish = null
let t0Stamp = -1
for (let i = 0; i < TOTAL; i++) {
  // 触发前一帧选目标：画布中心附近、速度正常、状态正常的鱼
  if (i === T0 - 1 && frames.length) {
    const cand = frames[frames.length - 1].fish
      .map((r, fi) => ({ r, fi, d: Math.hypot(r.x - W / 2, r.y - H / 2) }))
      .filter((o) => o.r.state === 'normal' && o.r.sp > 1.2 && o.r.minSelf > o.r.arc * 0.25)
      .sort((a, b) => a.d - b.d)
    if (!cand.length) throw new Error('找不到合适的目标鱼')
    targetFi = cand[0].fi
    t0Fish = cand[0].r
  }
  if (i === T0 && t0Fish) {
    t0Stamp = t0Fish.f
    if (SCENE === 'click') {
      fire('pointermove', { clientX: t0Fish.x + 10, clientY: t0Fish.y + 10 })
      fire('pointerdown', { clientX: t0Fish.x + 10, clientY: t0Fish.y + 10 })
      fire('pointerup', {})
    } else {
      // 先落远点再横扫到鱼头前方 35px，制造 mouse.vx/vy（切向 banking 会用到）
      fire('pointermove', { clientX: t0Fish.x - 160, clientY: t0Fish.y - 120 })
      fire('pointermove', {
        clientX: t0Fish.x + Math.cos(t0Fish.hdg) * 35,
        clientY: t0Fish.y + Math.sin(t0Fish.hdg) * 35,
      })
    }
  }
  if (i > T0 && i < T0 + 90 && SCENE === 'chase' && frames.length) {
    const cur = frames[frames.length - 1].fish[targetFi]
    if (cur) fire('pointermove', { clientX: cur.x + 12, clientY: cur.y + 12 })
  }
  tick()
}
if (frames.length < TOTAL - 5) throw new Error(`有效帧不足：${frames.length} / ${TOTAL}（检查 rAF 与补步）`)

// ---- 工具 ----
const norm = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a }
const pctl = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * p)))] }
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1)
const deg = (r) => r * D

// 目标鱼时间序列（按帧号对齐，用 t0Stamp 定位触发帧）
const all = frames.map((fr) => fr.fish[targetFi]).filter(Boolean)
const i0 = all.findIndex((r) => r.f >= t0Stamp)
const pre = all.slice(Math.max(0, i0 - 25), i0)
const post = all.slice(i0, Math.min(all.length, i0 + AFTER))
const win = all.slice(Math.max(0, i0 - 12), Math.min(all.length, i0 + 28))

// 逐帧差分（角度用 norm 防 wrap）
const dHdg = (s) => s.map((r, i) => i ? deg(norm(r.hdg - s[i - 1].hdg)) : 0)
const dHead = (s) => s.map((r, i) => i ? deg(norm(r.spine0 - s[i - 1].spine0)) : 0)
const dChord = (s) => s.map((r, i) => i ? deg(norm(r.chord - s[i - 1].chord)) : 0)
const dTail = (s) => s.map((r, i) => i ? deg(norm(r.spineTail - s[i - 1].spineTail)) : 0)
const pH = dHdg(post), pHead = dHead(post), pChord = dChord(post), pTail = dTail(post)

// 形状变化：rel[] 相对触发帧的 L1 变化（度/关节）
const shapeChange = post.map((r) => mean(r.rel.map((v, j) => Math.abs(v - post[0].rel[j]))))

console.log(`\n===== ${label} · 逃跑形态诊断（scene=${SCENE} seed=${process.env.KOI_SEED || 20260902}，触发帧 ${t0Stamp}，目标鱼 #${targetFi}）=====`)
console.log(`触发前：state=${pre[pre.length - 1]?.state} v=${pre[pre.length - 1]?.sp.toFixed(2)} panic=${pre[pre.length - 1]?.panic.toFixed(2)} beat=${pre[pre.length - 1]?.beat.toFixed(2)} 体长=${pre[pre.length - 1]?.arc.toFixed(0)}px trail覆盖=${pre[pre.length - 1]?.span}帧 tiltAmp=${deg(pre[pre.length - 1]?.tiltAmp || 0).toFixed(1)}°`)

// 1) 事件时序表
console.log('\n-- 1) 驱赶事件逐帧时序（f / 状态 / 航向dθ / 头段dθ / 弦角dθ / 尾段dθ / 头尾弯° / 弯曲脉冲° / C-start° / cap饱和 / v / panic / beat / trail帧 / 弦长%）--')
const wH = dHdg(win), wHead = dHead(win), wChord = dChord(win), wTail = dTail(win)
for (let i = 0; i < win.length; i++) {
  const r = win[i]
  const mark = r.f === t0Stamp ? ' <<< 触发' : ''
  console.log(`${String(r.f).padStart(4)} ${r.state.padEnd(7)} ${wH[i].toFixed(1).padStart(7)} ${wHead[i].toFixed(1).padStart(8)} ${wChord[i].toFixed(1).padStart(8)} ${wTail[i].toFixed(1).padStart(8)} ${r.bodyBend.toFixed(1).padStart(9)} ${deg(r.bendSum).toFixed(1).padStart(10)} ${r.cstartBend.toFixed(1).padStart(9)} ${(r.capSat / r.capN * 100).toFixed(0).padStart(5)}% ${r.sp.toFixed(1).padStart(6)} ${r.panic.toFixed(2).padStart(6)} ${r.beat.toFixed(2).padStart(6)} ${String(r.span).padStart(6)} ${(r.chordLen / r.arc * 100).toFixed(0).padStart(5)}%${mark}`)
}

// 2) 整体旋转判定
const N = Math.min(15, post.length)
const orient = post.slice(0, N)
const sumHdg = Math.abs(orient.slice(1).reduce((s, r, i) => s + deg(norm(r.hdg - orient[i].hdg)), 0))
const sumChord = Math.abs(orient.slice(1).reduce((s, r, i) => s + deg(norm(r.chord - orient[i].chord)), 0))
const sumTail = Math.abs(orient.slice(1).reduce((s, r, i) => s + deg(norm(r.spineTail - orient[i].spineTail)), 0))
const shapeAt = (k) => mean(orient[k].rel.map((v, j) => Math.abs(v - orient[0].rel[j])))
const peakShape = Math.max(...shapeChange.slice(0, N))
// 头/弦/尾三者变化的一致性：差异越小越像整体旋转
const sync = pctl(pH.slice(1, N).map((v, i) => Math.abs(v - pChord[i + 1])), 0.5)
console.log('\n-- 2) 「整体旋转」量化（触发后 15 帧）--')
console.log(`累计航向变化 ${sumHdg.toFixed(1)}°｜累计弦角变化 ${sumChord.toFixed(1)}°｜累计尾段变化 ${sumTail.toFixed(1)}°（三者越接近 = 整条鱼刚性一起转）`)
console.log(`头段 dθ 与弦角 dθ 的逐帧差 p50 = ${sync.toFixed(2)}°（越小越同步）｜头段方向/航向回归斜率 = ${(pH.reduce((s, v, i) => s + v * pHead[i], 0) / (pH.reduce((s, v) => s + v * v, 0) || 1)).toFixed(3)}`)
console.log(`形状变化（rel[] 相对触发帧 L1）峰值 = ${peakShape.toFixed(2)}°/关节；同时整体朝向变了 ${sumChord.toFixed(1)}° → 形状/朝向比 ${(peakShape * orient[0].rel.length / (sumChord || 1)).toFixed(2)}`)
console.log(`真实 C-start：头尾相对角应先冲到 60~100°（C-bend），此期间头几乎不位移；整体刚性旋转的表现是 rel[] 几乎不变而弦角剧变。`)
console.log(`头尾弯 bodyBend 峰 ${Math.max(...orient.map((r) => Math.abs(r.bodyBend))).toFixed(1)}°（p50 ${pctl(orient.map((r) => Math.abs(r.bodyBend)), 0.5).toFixed(1)}°）｜累计关节角 Σrel 峰 ${Math.max(...orient.map((r) => Math.abs(r.sumRel))).toFixed(0)}° (>180° 即卷成螺旋)`)

// 3) C-start 时序
const bendPeakAt = orient.reduce((b, r, i) => Math.abs(r.bodyBend) > Math.abs(orient[b].bodyBend) ? i : b, 0)
const dThetaPeakAt = pH.reduce((b, v, i) => Math.abs(v) > Math.abs(pH[b]) ? i : b, 0)
const pulsePeakAt = orient.reduce((b, r, i) => Math.abs(r.bendSum) > Math.abs(orient[b].bendSum) ? i : b, 0)
console.log('\n-- 3) C-start 因果时序（触发后帧偏移）--')
console.log(`身体弯曲峰值 @ +${bendPeakAt} 帧（${(bendPeakAt / 30 * 1000).toFixed(0)}ms）｜航向变化峰值 @ +${dThetaPeakAt} 帧｜bend 脉冲峰值 @ +${pulsePeakAt} 帧`)
console.log(`真实 C-start：Stage1 C-bend 约 15~25ms（0.5~0.8 帧 @30fps 难以分辨，但至少应先于或同帧于航向变化），Stage2 反向甩尾 20~40ms 后航向才大幅改变。`)
console.log(`本实现：弯曲${bendPeakAt <= dThetaPeakAt ? '先于/同帧于' : '滞后于'}航向（差 ${bendPeakAt - dThetaPeakAt} 帧 = ${((bendPeakAt - dThetaPeakAt) / 30 * 1000).toFixed(0)}ms）`)
// 全窗口「弯曲峰值」会被后期 trail 拖尾的大弯抢走（转向幅度大的种子尤其明显），
// 不适合单独衡量 Stage 1。补一个只看入场 +0~3 帧的直接指标，两者都报。
const early = post.slice(0, 4)
console.log(`入场 C-bend（+0~3 帧）：|bodyBend| 峰 ${Math.max(...early.map((r) => Math.abs(r.bodyBend))).toFixed(1)}°，其中主动脉冲贡献 ${Math.max(...early.map((r) => Math.abs(r.cstartBend))).toFixed(1)}°（A3-1 前恒 0）｜触发前基线 |bodyBend| ${Math.abs(pre[pre.length - 1]?.bodyBend || 0).toFixed(1)}°`)

// 4) 弯曲波与关节限幅
console.log('\n-- 4) 弯曲波与关节限幅（触发后 30 帧）--')
const w30 = post.slice(0, 30)
console.log(`bendSum 峰值 ${deg(Math.max(...w30.map((r) => Math.abs(r.bendSum)))).toFixed(1)}°｜bend 单关节峰值 ${deg(Math.max(...w30.map((r) => r.bendMax))).toFixed(1)}°`)
console.log(`关节 cap 饱和率 p50 ${pctl(w30.map((r) => r.capSat / r.capN * 100), 0.5).toFixed(0)}%，峰 ${Math.max(...w30.map((r) => r.capSat / r.capN * 100)).toFixed(0)}%（高饱和 = 身体想弯但被形态层削平）`)
console.log(`头段 rel[0..${Math.max(0, Math.round(orient[0].rel.length * 0.1) - 1)}] 恒 0（HEAD_FRAC=0.10 刚性棍）→ 头段无 yaw 自由度`)
console.log(`C-start 主动脉冲：触发后 30 帧内激活 ${w30.filter((r) => r.cstartT >= 0).length} 帧，峰值头尾弯贡献 ${Math.max(...w30.map((r) => Math.abs(r.cstartBend))).toFixed(1)}°（A3-1 前恒 0；真实 Stage1 目标 30~100°）`)

// 5) 速度 / 几何 / 摆尾放大
const vPre = pctl(pre.slice(-20).map((r) => r.sp), 0.5)
const vPeak = Math.max(...w30.map((r) => r.sp))
const tiltPre = pre[pre.length - 1]?.tiltAmp || 1
const tiltPeak = Math.max(...w30.map((r) => r.tiltAmp))
const dPhPre = mean(pre.slice(-20).slice(1).map((r, i) => r.ph - pre.slice(-20)[i].ph))
const dPhPost = mean(w30.slice(1).map((r, i) => r.ph - w30[i].ph))
console.log('\n-- 5) 速度 / 几何 / 摆尾放大 --')
console.log(`实速 p50 触发前 ${vPre.toFixed(2)} → 触发后峰 ${vPeak.toFixed(2)} px/帧（${(vPeak / vPre).toFixed(1)}×）；trail 覆盖体长的帧数 ${pre[pre.length - 1]?.span} → ${pctl(w30.map((r) => r.span), 0.5).toFixed(0)} 帧（身体几何只由这么几帧头部位置决定）`)
console.log(`spineTilt 角场幅值 ${deg(tiltPre).toFixed(1)}° → 峰 ${deg(tiltPeak).toFixed(1)}°（${(tiltPeak / tiltPre).toFixed(2)}×）；体波 dφ/帧 ${dPhPre.toFixed(4)} → ${dPhPost.toFixed(4)}（${(dPhPost / dPhPre).toFixed(2)}×）`)
console.log(`弦长/体长 触发前 ${(pre[pre.length - 1]?.chordLen / pre[pre.length - 1]?.arc * 100).toFixed(0)}% → 触发后 min ${Math.min(...w30.map((r) => r.chordLen / r.arc * 100)).toFixed(0)}%（越低越卷）｜自交最小距 min ${Math.min(...w30.map((r) => r.minSelf / r.arc * 100)).toFixed(0)}% 体长`)

// 6) 状态覆盖
const stateCnt = {}
for (const r of all) stateCnt[r.state] = (stateCnt[r.state] || 0) + 1
console.log('\n-- 6) 状态覆盖（全段）--')
console.log(Object.entries(stateCnt).map(([k, v]) => `${k}=${v}帧`).join('  '))
const firstEsc = all.findIndex((r) => r.state === 'escape')
const firstAvoid = all.findIndex((r) => r.state === 'avoid')
console.log(`首次 AVOID @ 帧 ${all[firstAvoid]?.f ?? '-'}｜首次 ESCAPE @ 帧 ${all[firstEsc]?.f ?? '-'}（相对触发 ${all[firstEsc] && firstEsc >= 0 ? all[firstEsc].f - t0Stamp : '-'}）\n`)
