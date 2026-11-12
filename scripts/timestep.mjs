#!/usr/bin/env node
/**
 * koi-pond · timestep — 时间基回归探针（S1，2026-11-12）
 *
 * 验证「人为注入掉帧后，相位与位置不漂移」：
 *   A 组：每帧 34ms 稳定推进 N 帧；
 *   B 组：同样总时长，但把中间一帧合并掉（该帧 gap = 68ms），帧数少 1。
 * 若时间基正确（固定步长 + 累加器 + 补步），B 组会在那一帧补 2 个模拟步，
 * 两组在**同一物理时刻**的鱼群状态应几乎一致；旧实现 `last = ts` 丢帧不补，
 * B 组会整整少走一步，鱼群位置明显落后。
 *
 * 观测量：最后一次绘制的所有 ellipse 世界坐标质心（ellLit 用 translate(x,y)
 * + ellipse(0,0)，所以 mock 必须追踪 translate/save/restore 才能拿到世界坐标）。
 * 每组用同一个 LCG 种子重新建沙箱，随机数消耗只取决于模拟步数——步数一旦
 * 不一致，随机序列错位会进一步放大差异，所以这个量对「丢步」很敏感。
 *
 * 用法：node scripts/timestep.mjs <client.js 路径> [标签]
 * 环境变量：KOI_SEED（默认 20260902）。退出码即断言结果。
 */
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const target = process.argv[2] || 'lib/client.js'
const label = process.argv[3] || 'timestep'
const SEED0 = Number(process.env.KOI_SEED || 20260902) >>> 0
const STEP_MS = 34 // 名义 30fps 的探针步长（与其余探针一致）
const WARM = 120 // 预热：bornFrame 最大约 85，让鱼群全部激活
const N = 60 // 观测段帧数
const DROP_EVERY = 10 // 观测段每 10 帧注入一次 2× 掉帧（共 6 次，放大旧版丢步）
const TOL_PX = 2 // 末帧「第一条鱼头部点」允许漂移（px）

let seed = SEED0
const sandboxMath = Object.create(Math)
sandboxMath.random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}

function run(seq) {
  seed = SEED0
  let mainPts = []
  let canvasNo = 0
  const noop = () => {}

  function makeCtx(isMain) {
    let _fill = ''
    let tx = 0
    let ty = 0
    const stack = []
    const c = {
      strokeStyle: '', lineWidth: 1, globalAlpha: 1,
      imageSmoothingEnabled: true, imageSmoothingQuality: 'low', filter: 'none',
      setTransform: () => { tx = 0; ty = 0 },
      clearRect: () => { if (isMain) mainPts = [] },
      save: () => { stack.push([tx, ty]) },
      restore: () => { const s = stack.pop(); if (s) { tx = s[0]; ty = s[1] } },
      translate: (dx, dy) => { tx += dx; ty += dy },
      rotate: noop, scale: noop,
      beginPath: noop, closePath: noop, moveTo: noop, fillRect: noop,
      lineTo: noop, arc: noop, fill: noop, stroke: noop, drawImage: noop,
      ellipse: (x, y) => {
        if (isMain && Number.isFinite(x) && Number.isFinite(y)) mainPts.push([tx + x, ty + y])
      },
      createLinearGradient: () => ({ addColorStop: noop }),
      createRadialGradient: () => ({ addColorStop: noop }),
    }
    Object.defineProperty(c, 'fillStyle', { get: () => _fill, set: (v) => { _fill = v } })
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
      append: (c) => { el.children.push(c) },
      remove: noop, addEventListener: noop, removeEventListener: noop,
    }
    if (tag === 'canvas') {
      const isMain = ++canvasNo === 1
      el.width = 0
      el.height = 0
      let c = null
      el.getContext = () => (c ||= makeCtx(isMain))
    }
    return el
  }

  let rafQ = []
  const sandbox = {
    console,
    Math: sandboxMath,
    Date,
    document: {
      body: makeEl('body'), head: makeEl('head'), hidden: false,
      createElement: makeEl, addEventListener: noop, removeEventListener: noop,
    },
    localStorage: { getItem: () => null, setItem: noop },
    MutationObserver: class { constructor(cb) { this._cb = cb } observe() {} disconnect() {} },
    requestAnimationFrame: (cb) => { rafQ.push(cb); return rafQ.length },
    cancelAnimationFrame: noop,
  }
  sandbox.window = sandbox
  sandbox.addEventListener = noop
  sandbox.removeEventListener = noop
  sandbox.innerWidth = 1920
  sandbox.innerHeight = 1080
  sandbox.devicePixelRatio = 2
  sandbox.matchMedia = () => ({ matches: false, addEventListener: noop, removeEventListener: noop })
  let mod = null
  sandbox.__ModuleLoader__ = {
    load: (spec) => { mod = spec.factory(() => { throw new Error('require unsupported') }) },
  }

  vm.createContext(sandbox)
  vm.runInContext(readFileSync(target, 'utf8'), sandbox, { filename: target })
  mod.apply()

  let renders = 0
  for (const t of seq) {
    const q = rafQ
    rafQ = []
    for (const cb of q) cb(t)
    if (mainPts.length) renders++
  }
  // 最后一帧绘制的质心
  let sx = 0
  let sy = 0
  for (const p of mainPts) { sx += p[0]; sy += p[1] }
  const n = mainPts.length || 1
  // 第一条鱼的第一个身体点：比全群质心敏感得多（质心会把单步位移按鱼数/层数稀释）
  const h = mainPts[0] || [0, 0]
  return { cx: sx / n, cy: sy / n, hx: h[0], hy: h[1], pts: mainPts.length, renders }
}

const total = WARM + N
const seqA = []
const seqB = []
let drops = 0
for (let i = 0; i < total; i++) {
  const t = STEP_MS * (i + 1)
  seqA.push(t)
  const inObs = i >= WARM && (i - WARM) % DROP_EVERY === 0
  if (inObs && i < total - 1) { drops++; continue } // 去掉该时间戳 → 下一帧 gap 变成 68ms
  seqB.push(t)
}

const a = run(seqA)
const b = run(seqB)
// 主判据：第一条鱼头部点漂移（完整反映累计丢步）；质心只作参考输出
const drift = Math.hypot(a.hx - b.hx, a.hy - b.hy)
const centroidDrift = Math.hypot(a.cx - b.cx, a.cy - b.cy)
const ok = Number.isFinite(drift) && drift <= TOL_PX && a.pts > 0 && b.pts > 0

console.log(`${label.padEnd(12)} 稳定组 head=(${a.hx.toFixed(2)}, ${a.hy.toFixed(2)}) 质心=(${a.cx.toFixed(2)}, ${a.cy.toFixed(2)}) pts=${a.pts} renders=${a.renders}`)
console.log(`${''.padEnd(12)} 掉帧组 head=(${b.hx.toFixed(2)}, ${b.hy.toFixed(2)}) 质心=(${b.cx.toFixed(2)}, ${b.cy.toFixed(2)}) pts=${b.pts} renders=${b.renders}（注入 ${drops} 次 2× 掉帧）`)
console.log(`[S] 掉帧后末帧头部漂移 ${drift.toFixed(3)}px（≤${TOL_PX}）  →  ${ok ? '✓' : '✗'}   [参考] 质心漂移 ${centroidDrift.toFixed(3)}px`)
console.log(ok ? `══ 时间基断言通过 ✓（${label}）` : `══ 存在 FAIL ✗（${label}）`)
process.exit(ok ? 0 : 1)
