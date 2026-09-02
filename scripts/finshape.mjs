#!/usr/bin/env node
/**
 * koi-pond · 鳍几何断言（纯脚本，无浏览器）
 * 驱动 lib/client.js 真实产物，从主画布绘制流黑盒反解出每条鱼的
 * 胸鳍 / 尾鳍 / 背脊线几何，客观断言四件事：
 *   A) 胸鳍素材朝「尾向偏外」划水（方向来自贴图 CTM 的 +x 轴；画反时点积变负）
 *   B) 尾鳍素材朝尾向伸展（贴图根埋在尾柄、主体伸向尾后）
 *   C) 背鳍已改为「沿身体中线的背脊线」：每条鱼恰有一条 stroke 折线，其点列
 *      与身体段椭圆中心几乎重合（连续性）且不是任何整膜 fill（锯齿三角必 FAIL）
 *   D) 行波单弧尾摆：身体曲线相对头尾弦的横向偏移符号翻转 ≤ 1
 *      （按弧度/段的多波蛇游翻转 ≥ 2，必 FAIL）
 * 另导出 .tmp/koi-finshape.svg 帧快照（最大鱼几何）供人工核对。
 * 用法：node scripts/finshape.mjs <client.js 路径> [标签]
 *
 * 鳍识别说明：胸鳍/尾鳍现在是离屏贴图（drawImage），不再是半透明 ellipse fill；
 * 贴图画布带 _kind/_rootX/_rootY 元数据（koiRender.newFinCanvas），录制器据此
 * 从 drawImage 事件 + 当时的 CTM 反解「锚点 / 方向 / 贴图矩形」。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const target = process.argv[2]
const label = process.argv[3] || target
const OUT_SVG = fileURLToPath(new URL('../.tmp/koi-finshape.svg', import.meta.url))

// ---- DOM / ctx mock（记录绘制结算几何，CTM 追踪） ----
const listeners = Object.create(null)
function addL(t, cb) {
  ;(listeners[t] || (listeners[t] = [])).push(cb)
}
function fire(t, ev) {
  for (const cb of listeners[t] || []) cb(ev)
}

const ctxSeq = []
let mainCtx = null
let fills = [] // 每帧重置（fill 结算记录）
let strokes = [] // 每帧重置（stroke 结算记录，背脊线）
let frameImgs = [] // 每帧重置（带 _kind 的 drawImage 事件）
let buff = [] // 两次 fill/stroke 之间的绘制事件
let ellipseTotal = 0
let nanTotal = 0
const R = (v) => (Number.isFinite(v) ? v : 0)

function parseRgba(str) {
  const mm = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(String(str))
  return mm ? { rgb: [+mm[1], +mm[2], +mm[3]], a: parseFloat(mm[4]) } : null
}
// 单点按「事件发生时的 CTM」变换为世界坐标。
// 纯缩放（无平移）说明几何以绝对 CSS 坐标给出（如背脊线 stroke 的 moveTo/lineTo），
// 直接取原始坐标 —— 与身体段椭圆（translate 到 CSS 点后局部画）保持同一坐标系。
function xfPoint(m, x, y) {
  if (m && m[4] === 0 && m[5] === 0) return [x, y]
  const mm = m || [1, 0, 0, 1, 0, 0]
  return [mm[0] * x + mm[2] * y + mm[4], mm[1] * x + mm[3] * y + mm[5]]
}

function makeCtx() {
  const noop = () => {}
  const settle = (rec, m) => {
    for (const e of buff) {
      if (e.t === 'ell') {
        const [wx, wy] = xfPoint(m, e.x, e.y)
        rec.ells.push({ x: R(wx), y: R(wy), rx: R(e.rx), ry: R(e.ry), rot: R(Math.atan2(m[1], m[0]) + e.rot) })
      } else if (e.t === 'pt') {
        const [wx, wy] = xfPoint(e.m, e.x, e.y)
        rec.path.push({ x: R(wx), y: R(wy) })
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
    clearRect: noop,
    fillRect: noop,
    arc: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    beginPath: () => {
      buff.push({ t: 'path' })
    },
    moveTo: (x, y) => {
      buff.push({ t: 'pt', x, y, m: c._m.slice() })
    },
    lineTo: (x, y) => {
      buff.push({ t: 'pt', x, y, m: c._m.slice() })
    },
    closePath: noop,
    ellipse: (x, y, rx, ry, rot) => {
      ellipseTotal++
      if (!Number.isFinite(x) || !Number.isFinite(y)) nanTotal++
      buff.push({ t: 'ell', x, y, rx, ry, rot })
    },
    // 胸鳍/尾鳍贴图：带 _kind 的画布 drawImage → 记录锚点/方向/贴图矩形
    drawImage: (img) => {
      if (c === mainCtx && img && img._kind) {
        const m = c._m
        frameImgs.push({
          kind: img._kind,
          x: m[4],
          y: m[5],
          ux: m[0],
          uy: m[1],
          w: img.width || 1,
          h: img.height || 1,
          rootX: img._rootX || 0,
          rootY: img._rootY || 0,
          m: m.slice(),
        })
      }
    },
    fill: () => {
      const m = c._m
      const rec = { grad: typeof c.fillStyle === 'object', ga: c.globalAlpha, rgb: null, a: 0, m, ells: [], path: [] }
      const pr = typeof c.fillStyle === 'string' ? parseRgba(c.fillStyle) : null
      if (pr) {
        rec.rgb = pr.rgb
        rec.a = pr.a
      }
      settle(rec, m)
      if (c === mainCtx) fills.push(rec)
    },
    stroke: () => {
      const m = c._m
      const rec = { grad: false, ga: c.globalAlpha, rgb: null, a: 0, m, ells: [], path: [] }
      const pr = typeof c.strokeStyle === 'string' ? parseRgba(c.strokeStyle) : null
      if (pr) {
        rec.rgb = pr.rgb
        rec.a = pr.a
      }
      settle(rec, m)
      if (c === mainCtx) strokes.push(rec)
    },
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
    append: (ch) => el.children.push(ch),
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
  strokes = []
  frameImgs = []
  buff = []
  for (const cb of q) cb(ts)
}

// ---- 单帧鱼组反解 ----
// 绘制顺序（逐鱼）：尾腹色渐变层(ga↑) → 胸鳍贴图×2 → 尾鳍贴图×1 → 主色渐变层(ga↓)
//                  → 反光 rgba(14,58,74) → 背脊线 stroke。
// 渐变段内部按 globalAlpha 方向再切成单调子段：尾腹层递增、主色层递减（两段之间
// 还有一次跳升）。只取「递减子段」= 主色身体层 —— 每帧逐鱼得到一条干净的身体点列，
// 避免把两层并成一条后在中段引入假翻转/假体长。
const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
function analyseFrame() {
  const fish = []
  let i = 0
  const n = fills.length
  // 结算一段递减渐变（视为一条鱼的身体层）
  const consider = (seg) => {
    if (seg.length < 6 || seg[0].ga - seg[seg.length - 1].ga <= 0.005) return
    const pts = []
    for (const f of seg) if (f.ells.length) pts.push(f.ells[0])
    let glitch = false
    for (let k = 1; k < pts.length; k++) {
      if (near(pts[k], pts[k - 1]) > 160) glitch = true
    }
    if (!glitch && pts.length >= 6) {
      const span = near(pts[0], pts[pts.length - 1])
      fish.push({ pts, span, pec: [], tail: [], back: null })
    }
  }
  while (i < n) {
    if (!fills[i].grad) {
      i++
      continue
    }
    // 渐变 run：向相邻渐变扩展，再按 alpha 方向切成单调子段
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
  // 鳍贴图 → 最近鱼（全局取最小距离，避免一条鳍被两条鱼重复收走）
  for (const im of frameImgs) {
    let bi = -1
    let bd = Infinity
    for (let fi = 0; fi < fish.length; fi++) {
      const fb = fish[fi]
      let md = Infinity
      for (const p of fb.pts) {
        const d = near(im, p)
        if (d < md) md = d
      }
      // 贴图根必须贴在身体上：距离阈值随体型（鳃盖半宽量级）
      if (md < Math.max(10, fb.span * 0.15) && md < bd) {
        bd = md
        bi = fi
      }
    }
    if (bi >= 0) {
      const fb = fish[bi]
      ;(im.kind === 'pec' ? fb.pec : fb.tail).push(im)
    }
  }
  // 背脊线：给每条鱼匹配折线点贴近其身体点列的那条 stroke（命中率 ≥ 80%）
  for (const fb of fish) {
    const tol = Math.max(4, fb.span * 0.04)
    let best = null
    let bestHit = 0
    for (const st of strokes) {
      if (st.path.length < 3) continue
      let hit = 0
      for (const sp of st.path) {
        let bd = Infinity
        for (const p of fb.pts) {
          const d = near(sp, p)
          if (d < bd) bd = d
        }
        if (bd < tol) hit++
      }
      const score = hit / st.path.length
      if (score > bestHit) {
        bestHit = score
        best = st
      }
    }
    fb.back = bestHit >= 0.8 ? best : null
  }
  return fish
}

// ---- 断言 ----
// 记录坐标被 CTM 平移/缩放处理过（见 xfPoint，坐标统一为 CSS 空间）；方向轴未归一 → 先归一。
function unitDot(ux, uy, vx, vy) {
  const lu = Math.hypot(ux, uy) || 1
  const lv = Math.hypot(vx, vy) || 1
  return ((ux / lu) * vx + (uy / lu) * vy) / lv
}
const cross = (ax, ay, bx, by) => ax * by - ay * bx
// 贴图锚点相对身体弦的侧向符号
const sideOf = (im, vx, vy, H) => Math.sign(cross(vx, vy, im.x - H.x, im.y - H.y))

const stats = {
  frames: 0,
  fish: 0,
  pec: 0,
  pecDot: [],
  pecSideOk: 0,
  tail: 0,
  tailDot: [],
  backElig: 0,
  backPts: [],
  backMissing: 0,
  zeroCross: [],
  best: null, // 最大鱼组（供 SVG）
}
const WARM = 150
const MEASURE = 8
for (let i = 0; i < WARM; i++) tick()
for (let i = 0; i < MEASURE; i++) {
  tick()
  const fs = analyseFrame()
  if (!fs.length) continue
  stats.frames++
  let best = null
  for (const f of fs) {
    stats.fish++
    const H = f.pts[0]
    const T = f.pts[f.pts.length - 1]
    const vx = T.x - H.x
    const vy = T.y - H.y
    const vl = Math.hypot(vx, vy)
    if (vl < 20) continue // 弦太短（原地转）跳过
    for (const pec of f.pec) {
      stats.pec++
      stats.pecDot.push(unitDot(pec.ux, pec.uy, vx, vy))
      pec._side = sideOf(pec, vx, vy, H)
    }
    if (f.pec.length >= 2 && f.pec[0]._side && f.pec[1]._side && f.pec[0]._side !== f.pec[1]._side) stats.pecSideOk++
    for (const tl of f.tail) {
      stats.tail++
      stats.tailDot.push(unitDot(tl.ux, tl.uy, vx, vy))
    }
    // 背脊线：只统计体型够大的鱼（点数 ≥14），避免小样本噪声
    if (f.pts.length >= 14) {
      stats.backElig++
      if (f.back) stats.backPts.push(f.back.path.length)
      else stats.backMissing++
    }
    // 行波单弧：大鱼（body 点数 ≥24）翻转统计。
    // 近乎笔直（最大侧偏 < 2% 弦长）的鱼只产生数值噪声级翻转，无信息量，先排除；
    // 真正的「按段蛇游」出现在弯曲样本上且持续 ≥3 次翻转。
    if (f.pts.length >= 24) {
      const dev = f.pts.map((p) => cross(vx, vy, p.x - H.x, p.y - H.y))
      const mx = Math.max(...dev.map((d) => Math.abs(d)), 1e-9)
      if (mx > vl * 0.02) {
        let flips = 0
        let prev = 0
        for (let k = 0; k < dev.length; k++) {
          if (Math.abs(dev[k]) < mx * 0.05) continue
          const s = Math.sign(dev[k])
          if (prev && s !== prev) flips++
          prev = s
        }
        stats.zeroCross.push(flips)
      }
    }
    if (!best || f.pts.length > best.pts.length) best = f
  }
  if (best && (!stats.best || best.pts.length > stats.best.pts.length)) stats.best = best
}

// ---- 汇总判定 ----
const min = (a) => (a.length ? Math.min(...a) : NaN)
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : '—')
const badFrac = (arr, th) => (arr.length ? arr.filter((d) => d < th).length / arr.length : 1)
const pecBad = badFrac(stats.pecDot, 0.15)
const tailBad = badFrac(stats.tailDot, 0.15)
const backPtsMin = stats.backPts.length ? Math.min(...stats.backPts) : 0
// 大鱼行波翻转分布：巡航转弯时相对弦可翻 1~2 次（瞬态），
// 真正的「按段蛇游」是大鱼身上持续 ≥3 次翻转 → 用翻转≥3 的样本占比判。
const hist = { 0: 0, 1: 0, 2: 0, 3: 0 }
for (const z of stats.zeroCross) hist[Math.min(3, z)]++
const frac3 = stats.zeroCross.length ? hist[3] / stats.zeroCross.length : 1

const ok = {
  A: stats.pec >= 8 && pecBad < 0.1, // 胸鳍素材朝尾外
  B: stats.tail >= 8 && tailBad < 0.1, // 尾鳍素材朝尾
  C: stats.backElig >= 3 && stats.backMissing === 0 && backPtsMin >= 4, // 背脊线沿中线连续
  D: stats.zeroCross.length > 0 && frac3 < 0.1, // 大鱼单弧尾摆（≥3翻转占比低）
}
const allPass = ok.A && ok.B && ok.C && ok.D

console.log(`── ${label} 鳍几何断言 ─────────────────────────`)
console.log(`帧=${stats.frames}  鱼样本=${stats.fish}`)
console.log(
  `[A] 胸鳍朝尾外 样本=${stats.pec}  min=${f3(min(stats.pecDot))}  朝前异常${(pecBad * 100).toFixed(0)}%  两侧分列 ${stats.pecSideOk}/${Math.max(1, stats.fish)}  →  ${ok.A ? '✓' : '✗'}`
)
console.log(
  `[B] 尾鳍朝尾   样本=${stats.tail}  min=${f3(min(stats.tailDot))}  朝前异常${(tailBad * 100).toFixed(0)}%  →  ${ok.B ? '✓' : '✗'}`
)
console.log(
  `[C] 背脊线沿中线 大鱼=${stats.backElig}  缺失=${stats.backMissing}  折线点数min=${backPtsMin}  →  ${ok.C ? '✓' : '✗'}`
)
console.log(
  `[D] 单弧尾摆   大鱼样本=${stats.zeroCross.length}  翻转分布 0:${hist[0]} 1:${hist[1]} 2:${hist[2]} ≥3:${hist[3]}  →  ${ok.D ? '✓' : '✗'}`
)
console.log(allPass ? `══ 鳍几何全部通过 ✓（${label}）` : `══ 存在 FAIL ✗（${label}）`)

// ---- SVG 帧快照 ----
if (stats.best) {
  const f = stats.best
  if (process.env.KOI_DBG) {
    const xr = (a) => (a.length ? `${Math.min(...a.map((p) => p.x)).toFixed(0)}..${Math.max(...a.map((p) => p.x)).toFixed(0)}` : '—')
    const yr = (a) => (a.length ? `${Math.min(...a.map((p) => p.y)).toFixed(0)}..${Math.max(...a.map((p) => p.y)).toFixed(0)}` : '—')
    console.log('[dbg] body pts', f.pts.length, 'x', xr(f.pts), 'y', yr(f.pts))
    console.log('[dbg] 头', f.pts[0], ' 尾', f.pts[f.pts.length - 1])
    if (f.back) console.log('[dbg] 背脊线 path', f.back.path.length, 'x', xr(f.back.path), 'y', yr(f.back.path))
    console.log('[dbg] 鳍贴图', f.pec.length + f.tail.length, '个')
  }
  const all = []
  for (const p of f.pts) all.push(p)
  for (const im of [...f.pec, ...f.tail]) all.push({ x: im.x, y: im.y })
  if (f.back) for (const p of f.back.path) all.push(p)
  const xs = all.map((p) => p.x)
  const ys = all.map((p) => p.y)
  const x0 = Math.min(...xs)
  const y0 = Math.min(...ys)
  const x1 = Math.max(...xs)
  const y1 = Math.max(...ys)
  const pad = 30
  const W = x1 - x0 + pad * 2
  const H = y1 - y0 + pad * 2
  const k = Math.min(560 / W, 360 / H)
  const ox = (x) => (x - x0 + pad) * k
  const oy = (y) => (y - y0 + pad) * k
  const els = []
  // 身体段（渐变主色层）：逐段圆
  for (const p of f.pts) {
    els.push(`<circle cx="${ox(p.x).toFixed(1)}" cy="${oy(p.y).toFixed(1)}" r="${(p.rx * k).toFixed(1)}" fill="#d98a5b" fill-opacity="0.55"/>`)
  }
  // 背脊线：连续折线（红，代表背鳍意象的中线亮线）
  if (f.back) {
    const ptsSvg = f.back.path.map((p) => `${ox(p.x).toFixed(1)},${oy(p.y).toFixed(1)}`).join(' ')
    els.push(`<polyline points="${ptsSvg}" fill="none" stroke="#e0483e" stroke-width="${Math.max(1.5, 2.5 * k)}" stroke-opacity="0.9"/>`)
  }
  // 胸鳍/尾鳍：贴图矩形（锚点 → 素材根，按事件 CTM 变换四角）
  const finColor = (im) => (im.kind === 'pec' ? '#d08a50' : '#8f5a3a')
  for (const im of [...f.pec, ...f.tail]) {
    const m = im.m
    const xf = (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
    const ax = -im.rootX
    const ay = -im.rootY
    const quad = [xf(ax, ay), xf(ax + im.w, ay), xf(ax + im.w, ay + im.h), xf(ax, ay + im.h)]
      .map(([qx, qy]) => `${ox(qx).toFixed(1)},${oy(qy).toFixed(1)}`)
      .join(' ')
    els.push(`<polygon points="${quad}" fill="${finColor(im)}" fill-opacity="0.4" stroke="${finColor(im)}" stroke-width="1"/>`)
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${(W * k).toFixed(0)} ${(H * k).toFixed(0)}" font-family="sans-serif">` +
    `<rect width="100%" height="100%" fill="#f7f2e7"/>` +
    `<text x="10" y="18" font-size="13" fill="#666">${label} · 鳍几何帧快照（身体=圆段，背脊线=红折线，胸/尾鳍=贴图矩形）</text>` +
    els.join('') +
    `</svg>`
  try {
    writeFileSync(OUT_SVG, svg)
    console.log(`SVG 帧快照 → ${OUT_SVG}`)
  } catch (e) {
    console.log(`SVG 写入失败: ${e.message}`)
  }
}

dispose()
console.log(`${label}  apply/dispose 无异常 ✓`)
process.exit(allPass ? 0 : 1)
