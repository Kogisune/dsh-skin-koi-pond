#!/usr/bin/env node
/**
 * koi-pond · bench — 用 Canvas 2D mock 驱动 lib/client.js 真实产物，
 * 统计每帧的绘制调用次数（不依赖浏览器，纯 Node）。
 * 用法：node .tmp/bench.mjs <client.js 路径> <标签>
 */
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const target = process.argv[2]
const label = process.argv[3] || target

const S = { ellipse: 0, drawImage: 0, lineTo: 0, arc: 0, fill: 0, stroke: 0, gradient: 0, canvases: 0, fills: new Set() }
const reset = () => {
  S.ellipse = 0; S.drawImage = 0; S.lineTo = 0; S.arc = 0; S.fill = 0; S.stroke = 0
  S.fills.clear()
}

function makeCtx() {
  const noop = () => {}
  let _fill = ''
  const c = {
    strokeStyle: '', lineWidth: 1, globalAlpha: 1,
    imageSmoothingEnabled: true, imageSmoothingQuality: 'low', filter: 'none',
    setTransform: noop, clearRect: noop, save: noop, restore: noop,
    translate: noop, rotate: noop, scale: noop,
    beginPath: noop, closePath: noop, moveTo: noop, fillRect: noop,
    lineTo: () => { S.lineTo++ },
    arc: () => { S.arc++ },
    ellipse: () => { S.ellipse++ },
    fill: () => { S.fill++ },
    stroke: () => { S.stroke++ },
    drawImage: () => { S.drawImage++ },
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => { S.gradient++; return { addColorStop: noop } },
  }
  Object.defineProperty(c, 'fillStyle', {
    get: () => _fill,
    set: (v) => { _fill = v; S.fills.add(v) },
  })
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
    remove: () => {}, addEventListener: () => {}, removeEventListener: () => {},
  }
  if (tag === 'canvas') {
    S.canvases++
    el.width = 0
    el.height = 0
    let c = null
    el.getContext = () => (c ||= makeCtx())
  }
  return el
}

const body = makeEl('body')
if (process.env.KOI_DARK) body.setAttribute('data-ds-dark-theme', '')

let rafQ = []
const sandbox = {
  console,
  Math,
  Date,
  document: {
    body,
    head: makeEl('head'),
    hidden: false,
    createElement: makeEl,
    addEventListener: () => {}, removeEventListener: () => {},
  },
  localStorage: { getItem: () => null, setItem: () => {} },
  MutationObserver: class { constructor(cb) { this._cb = cb } observe() {} disconnect() {} },
  requestAnimationFrame: (cb) => { rafQ.push(cb); return rafQ.length },
  cancelAnimationFrame: () => {},
}
sandbox.window = sandbox
sandbox.addEventListener = () => {}
sandbox.removeEventListener = () => {}
sandbox.window.innerWidth = 1920
sandbox.window.innerHeight = 1080
sandbox.window.devicePixelRatio = 2
sandbox.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })

let mod = null
sandbox.window.__ModuleLoader__ = {
  load: (spec) => { mod = spec.factory(() => { throw new Error('require unsupported') }) },
}

vm.createContext(sandbox)
vm.runInContext(readFileSync(target, 'utf8'), sandbox, { filename: target })

// apply() 挂载主题；任何异常在这里就会抛出
const dispose = mod.apply()

// 烘焙期快照：荷叶影/叶面在 mount 时烘进位图，之后不再产生 fillStyle 赋值
const bakeShadow = [...S.fills].filter((v) => /^rgba\((2,8,14|30,46,38|8,8,8)/.test(v))
const bakeLeaf = [...S.fills].filter((v) => /^rgba\((47,130,105|71,184,151)/.test(v))
console.log(`${label.padEnd(12)} 烘焙期 · 荷叶影=${bakeShadow.join(' , ') || '(无)'}  荷叶面=${bakeLeaf.join(' , ') || '(无)'}`)

// 驱动帧循环：bornFrame 最大约 8 + 11*7 = 85，先跑 120 帧让鱼群全部激活
const WARM = 120
const MEASURE = 20
let ts = 0
const tick = () => {
  const q = rafQ
  rafQ = []
  ts += 34 // 30fps
  for (const cb of q) cb(ts)
}
for (let i = 0; i < WARM; i++) tick()

reset()
for (let i = 0; i < MEASURE; i++) tick()
const per = (n) => (n / MEASURE).toFixed(1)

console.log(
  `${label.padEnd(12)} ` +
    `ellipse/帧=${per(S.ellipse).padStart(7)}  ` +
    `fill/帧=${per(S.fill).padStart(7)}  ` +
    `gradient/帧=${per(S.gradient).padStart(6)}  ` +
    `lineTo/帧=${per(S.lineTo).padStart(7)}  ` +
    `drawImage/帧=${per(S.drawImage).padStart(5)}  ` +
    `arc/帧=${per(S.arc).padStart(5)}  ` +
    `canvas总数=${S.canvases}`
)

// 阴影配色是否随主题切换（P0 核心项之一）
const shadowFills = [...S.fills].filter((v) => /^rgba\((2,8,14|30,46,38|8,8,8)/.test(v))
console.log(`${' '.repeat(12)} 阴影色=${shadowFills.join(' , ') || '(无)'}  荷叶色=${[...S.fills].filter((v) => /^rgba\((47,130,105|71,184,151)/.test(v)).join(',') || '(无)'}`)

// 卸载不应抛异常
dispose()
console.log(`${' '.repeat(12)} apply/dispose 无异常 ✓`)
