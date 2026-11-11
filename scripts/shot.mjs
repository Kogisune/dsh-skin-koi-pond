#!/usr/bin/env node
/**
 * koi-pond · 真实渲染截图（Chrome headless）
 *
 * 用途：fishshape/jointdiag 只能量数字，量不出「姿态好不好看」。本项目纪律是
 * 观感判断必须看实际输出，所以这个工具跑真实产物出 PNG。
 *
 * 三个已踩过的坑（都别改回去）：
 *   1. headless 下 rAF 几乎不推进（只跑到第 1 帧）。改成 rAF 只入队，页面脚本
 *      同步 drain N 轮、时间戳每轮 +16.7ms（池塘本身 30fps 有 33ms 门限 → 轮数 ×2）。
 *   2. 不能靠 --screenshot 的隐式时机：它抓在 load 前后，可能早于 drain。
 *      因此 drain 放在**内联脚本**里（解析期完成），再配 --virtual-time-budget
 *      让 Chrome 等一拍再拍 —— 两者缺一都会截到空白。
 *   3. #koi-pond-dsh 是 z-index:-1，会把画布压到页面背景之下。drain 完把画布
 *      drawImage 到一块 z-index:9999 的克隆画布上，截图才看得见。
 *
 * 用法：
 *   node scripts/shot.mjs --w=700 --h=450 --frames=200 --q=koitest --out=.tmp/pose.png
 *   node scripts/shot.mjs --q=koitest --zoom=3 --cx=0.5 --cy=0.5 --out=.tmp/close.png
 *
 * 前提：先 npm run build。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : dflt
}
const W = Number(arg('w', 900))
const H = Number(arg('h', 600))
const FRAMES = Number(arg('frames', 200))
const SCALE = Number(arg('scale', 1))
const ZOOM = Number(arg('zoom', 0)) // >0 时按 --cx/--cy 为中心裁一块放大
const CX = arg('cx', 'center')
const CY = arg('cy', 'center')
const QUERY = arg('q', '')
const NOLEAF = process.argv.includes('--noleaf')
const SCHEME = arg('scheme', 'kohaku')
const SEED = Number(arg('seed', 7))
const OUT = resolve(ROOT, arg('out', '.tmp/shot.png'))

if (!existsSync(join(ROOT, 'lib', 'client.js'))) {
  console.error('缺少 lib/client.js —— 先跑 npm run build')
  process.exit(1)
}
const chrome = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p))
if (!chrome) {
  console.error('未找到 Chrome / Edge')
  process.exit(1)
}

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;height:100%;overflow:hidden;background:transparent}
#shot-bg{position:fixed;inset:0;z-index:-5;background:#cfe0d4}</style>
</head><body>
<div id="shot-bg"></div>
<script>
var __q = [];
// 固定随机种子 + 固定配色：同一条命令每次都截到同一个姿态，才能做 before/after 对比。
(function () { var s = ${SEED}; Math.random = function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 } })()
try { localStorage.setItem('koi-scheme', ${JSON.stringify(SCHEME)}) } catch (e) {}
window.requestAnimationFrame = function (cb) { __q.push(cb); return __q.length };
// --noleaf：荷叶是整块离屏画布 drawImage 上来的，会盖住鱼。按「源画布很大」识别并跳过，
// 鳍素材是小画布，不受影响。只用于姿态特写，不是产品行为。
${NOLEAF ? `window.__skipLeaf = true
var __di = CanvasRenderingContext2D.prototype.drawImage
CanvasRenderingContext2D.prototype.drawImage = function (src) {
  if (window.__skipLeaf && src && src.width > 120 && src.height > 120) return
  return __di.apply(this, arguments)
}` : ''}
window.__ModuleLoader__ = { load: function (s) { window.__m = s.factory(function () {}) } };
</script>
<script src="../lib/client.js"></script>
<script type="module">
// 用「module + 顶层 await」把整段流程挂在 load 之前：
//   · 鳍素材是 data:SVG 异步解码（img.onload → getImageData → 染色）。同步 drain
//     期间永远不会 bake，截出来就是「无鳍鱼」；定时器等多久都没用 —— 虚拟时间会把
//     120ms 压缩成不到 1ms 墙钟，解码线程根本来不及跑。
//   · module 的顶层 await 会推迟 load 事件，而 Chrome 正是在 load 之后截图。
//     所以这里 await 一次真实延时，鳍就一定能烘上。
function drain(n) {
  for (let i = 0; i < n * 2 + 10; i++) {
    ts += 16.7
    const b = __q; __q = []
    for (let j = 0; j < b.length; j++) b[j](ts)
  }
}
let ts = 0
try {
  window.__m.apply()
  drain(${FRAMES})
  await new Promise((r) => setTimeout(r, 80))
  drain(Math.round(${FRAMES} / 3))
  const cv = document.querySelector('#koi-pond-dsh canvas')
  window.__skipLeaf = false
  const out = document.createElement('canvas')
  const zoom = ${ZOOM}
  if (zoom > 0) {
    const sw = cv.width / zoom, sh = cv.height / zoom
    // cx/cy 一律用 0~1 的画布归一化坐标（用像素非常容易错位）
    const cx = ('${CX}' === 'center' ? 0.5 : parseFloat('${CX}')) * cv.width
    const cy = ('${CY}' === 'center' ? 0.5 : parseFloat('${CY}')) * cv.height
    const sx = Math.max(0, Math.min(cv.width - sw, cx - sw / 2))
    const sy = Math.max(0, Math.min(cv.height - sh, cy - sh / 2))
    out.width = cv.width * 2; out.height = cv.height * 2
    out.getContext('2d').drawImage(cv, sx, sy, sw, sh, 0, 0, out.width, out.height)
  } else {
    out.width = cv.width; out.height = cv.height
    out.getContext('2d').drawImage(cv, 0, 0)
  }
  out.style.cssText = 'position:fixed;left:0;top:0;z-index:9999;width:100vw;height:auto'
  document.body.appendChild(out)
  document.title = 'cv ' + cv.width + 'x' + cv.height
} catch (e) { document.title = 'ERR ' + e.message }
</script>
</body></html>`

mkdirSync(join(ROOT, '.tmp'), { recursive: true })
const page = join(ROOT, '.tmp', 'shot.html')
writeFileSync(page, html)
mkdirSync(dirname(OUT), { recursive: true })

const url = `file:///${page.replace(/\\/g, '/')}${QUERY ? `?${QUERY}` : ''}`
try {
  execFileSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--allow-file-access-from-files',
      `--force-device-scale-factor=${SCALE}`,
      `--window-size=${W},${H}`,
      '--virtual-time-budget=2500',
      `--screenshot=${OUT}`,
      url,
    ],
    { stdio: 'ignore', timeout: 180000 }
  )
} catch (e) {
  if (!existsSync(OUT)) {
    console.error(`截图失败：${e.message}`)
    process.exitCode = 1
  }
}
console.log(`${OUT}  (${W}x${H} @${SCALE}x, ${FRAMES} 帧${ZOOM ? `, 放大 ${ZOOM}×` : ''})`)
