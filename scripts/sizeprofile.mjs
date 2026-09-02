#!/usr/bin/env node
/**
 * 体型分布 + 轮廓检查：hook 主画布 ellipse 调用流，
 * 按 alpha 方向切段取身体层，输出每条鱼的轮廓直径序列（验证锦鲤比例与大小差异）。
 * 用法：node .tmp/sizeprofile.mjs <client.js 路径> [KOI_DARK=1]
 */
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const target = process.argv[2] || 'lib/client.js'

// ---- DOM mock ----
let recording = false
let pts = []
let mainCtx = null
const ctxSeq = []
const S = { canvases: 0 }

function alphaOf(fill) {
  const m = /^rgba\([^)]*,\s*([\d.]+)\)$/.exec(String(fill))
  return m ? parseFloat(m[1]) : 1
}

function makeCtx(owner) {
  const noop = () => {}
  const c = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'low',
    filter: 'none',
    setTransform: noop,
    clearRect: noop,
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
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
    ellipse: (x, y, rx) => {
      if (recording && c === mainCtx) pts.push({ x, y, r: rx, a: alphaOf(c.fillStyle) })
    },
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
    S.canvases++
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
sandbox.addEventListener = () => {}
sandbox.removeEventListener = () => {}
sandbox.window.innerWidth = 1920
sandbox.window.innerHeight = 1080
sandbox.window.devicePixelRatio = 2
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

// ---- 帧驱动，采样后 3 帧的身体层轮廓 ----
function sample() {
  const bodies = []
  for (let f = 0; f < 240; f++) {
    pts = []
    recording = true
    for (const cb of rafQ.splice(0)) cb(f * 16)
    recording = false
    if (f < 237) continue
    let cur = []
    let prevDir = 0
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]
      if (cur.length) {
        const d = p.a - cur[cur.length - 1].a
        const dir = Math.abs(d) < 1e-6 ? prevDir : Math.sign(d)
        if (dir !== prevDir) {
          if (cur[0].a > cur[cur.length - 1].a && cur.length > 4) bodies.push(cur)
          cur = []
        }
        prevDir = dir
      } else {
        prevDir = 0
      }
      cur.push(p)
    }
    if (cur[0] && cur[0].a > cur[cur.length - 1].a && cur.length > 4) bodies.push(cur)
  }
  return bodies
}

const bodies = sample()
console.log(`捕获身体层段数: ${bodies.length}`)
if (!bodies.length) {
  console.log('⚠ 未捕获到身体层')
} else {
  // 去重：同一条鱼跨帧会重复，按首点位置粗聚
  const uniq = []
  for (const b of bodies) {
    const dup = uniq.find(
      (u) => Math.hypot(u[0].x - b[0].x, u[0].y - b[0].y) < 5 && Math.abs(u[0].r - b[0].r) < 0.5
    )
    if (!dup) uniq.push(b)
  }
  const seen = uniq.slice(0, 12)
  console.log(`去重后鱼数: ${seen.length}（样本上限 12）`)
  // 各鱼轮廓（直径 = 2r）@ 吻部/头冠/鳃盖/中段/尾柄/尾端
  const t = [0, 0.1, 0.25, 0.5, 0.8, 1.0]
  const table = seen.map((b) => {
    const prof = t.map((tt) => b[Math.round(tt * (b.length - 1))].r * 2)
    return `吻${prof[0].toFixed(1)} 头${prof[1].toFixed(1)} 鳃${prof[2].toFixed(1)} 中${prof[3].toFixed(1)} 柄${prof[4].toFixed(1)} 尾${prof[5].toFixed(1)}`
  })
  console.log('轮廓直径@吻部/头冠/鳃盖/中段/尾柄/尾端：')
  table.forEach((row, i) => console.log(`  [${i}] ${row}`))
  // 大小差异：吻部直径 最小/最大/中位
  const kbd = seen.map((b) => b[0].r * 2)
  kbd.sort((a, b) => a - b)
  console.log(`\n吻部直径（最小→最大）: ${kbd.map((v) => v.toFixed(1)).join(', ')}`)
  console.log(`大小比 = ${(kbd[kbd.length - 1] / kbd[0]).toFixed(2)}×`)
  // 鳃盖/尾柄比（锦鲤比例验证：尾柄 ≈ 鳃盖 30-35%）
  const gill = seen.map((b) => b[Math.round(0.25 * (b.length - 1))].r * 2)
  const tailStem = seen.map((b) => b[Math.round(0.8 * (b.length - 1))].r * 2)
  const ratios = gill.map((g, i) => (tailStem[i] / g).toFixed(2))
  console.log(`尾柄/鳃盖比: ${ratios.join(', ')}（锦鲤约 0.30-0.35）`)
}

dispose()
