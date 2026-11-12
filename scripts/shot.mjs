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
 *   4. 驱赶注入（--mouse-at）模式下同参数两次截图的 IDAT 可能不同（鳍素材
 *      异步 bake / 涟漪时机）；title 里的 frame 与触发坐标是稳定的。该模式只用于
 *      **形态目视**，不要用 SHA256 做逐像素 A/B；确定性数值对照一律走 Node 沙箱
 *      探针（scripts/escapediag.mjs，固定 LCG 种子）。
 *
 * 用法：
 *   node scripts/shot.mjs --w=700 --h=450 --frames=200 --q=koitest --out=.tmp/pose.png
 *   node scripts/shot.mjs --q=koitest --zoom=3 --cx=0.5 --cy=0.5 --out=.tmp/close.png
 *   # 驱赶连拍：在第 N 个模拟帧注入鼠标，用不同 --frames 出触发后各时刻
 *   node scripts/shot.mjs --q=koitest\&koione --noleaf --mouse-at=178 --mouse=avoid \
 *        --frames=186 --zoom=2 --out=.tmp/esc-186.png
 *
 * --mouse-at>0 时改用 .tmp/shot-client.js（内存插桩副本，不改 lib/），
 * 默认 0 时脚本 src 与行为完全不变（历史 A/B 截图逐像素可比）。
 * 注入模式会跳过末尾额外 drain(FRAMES/3)，使最终帧号 ≈ --frames，便于精确连拍。
 *
 * 前提：先 npm run build。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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
const MOUSE_AT = Number(arg('mouse-at', 0)) // 0 = 不注入（默认，保持历史行为）
const MOUSE_MODE = arg('mouse', 'avoid') // avoid | click
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

// ---- 驱赶注入：生成插桩副本（只在 MOUSE_AT>0 时）----
// 两处插桩都只作用于 .tmp 副本：①frame 末尾导出 flock/frameCount 供页面选目标鱼；
// ②frame 开头刷新 mouse.last，避免 Chrome 虚拟时间把指针判为「超时消失」。
let clientSrc = '../lib/client.js'
if (MOUSE_AT > 0) {
  let s = readFileSync(join(ROOT, 'lib', 'client.js'), 'utf8')
  const A = 'function frame(render = true) {\n  if (!ctx) return\n  frameCount++'
  const B = '  if (specimenRef && specimenRef.active) drawSpecimenDebug(specimenRef)\n  drawFishDebugAll()\n}'
  if (!s.includes(A) || !s.includes(B)) throw new Error('shot.mjs 驱赶插桩锚点失效（产物结构变了）')
  s = s.replace(A, 'function frame(render = true) {\n  if (!ctx) return\n  frameCount++\n  if (window.__shotHoldMouse) mouse.last = Date.now()')
  s = s.replace(B, '  if (specimenRef && specimenRef.active) drawSpecimenDebug(specimenRef)\n  drawFishDebugAll()\n  window.__shotDiag = { flock, frameCount }\n}')
  mkdirSync(join(ROOT, '.tmp'), { recursive: true })
  writeFileSync(join(ROOT, '.tmp', 'shot-client.js'), s)
  clientSrc = '../.tmp/shot-client.js'
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
<script src="${clientSrc}"></script>
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
    if (${MOUSE_AT} > 0 && !window.__mouseFired && window.__shotDiag && window.__shotDiag.frameCount >= ${MOUSE_AT}) {
      window.__mouseFired = true
      window.__shotHoldMouse = true
      const flock = window.__shotDiag.flock || []
      const cand = flock
        .filter((k) => k && k.active && k.fs && k.fs.name === 'normal' && Math.hypot(k.vel.x, k.vel.y) > 1.2)
        .map((k) => ({ k, d: Math.hypot(k.pos.x - innerWidth / 2, k.pos.y - innerHeight / 2) }))
        .sort((a, b) => a.d - b.d)
      const k = cand[0] && cand[0].k
      if (k) {
        const pe = (type, x, y) => window.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y }))
        window.__shotTarget = { x: k.pos.x, y: k.pos.y, fi: flock.indexOf(k) }
        if (${JSON.stringify(MOUSE_MODE)} === 'click') {
          pe('pointermove', k.pos.x + 10, k.pos.y + 10)
          pe('pointerdown', k.pos.x + 10, k.pos.y + 10)
          pe('pointerup', k.pos.x + 10, k.pos.y + 10)
        } else {
          pe('pointermove', k.pos.x - 160, k.pos.y - 120)
          const h = Math.atan2(k.vel.y, k.vel.x)
          pe('pointermove', k.pos.x + Math.cos(h) * 35, k.pos.y + Math.sin(h) * 35)
        }
      }
    }
    const b = __q; __q = []
    for (let j = 0; j < b.length; j++) b[j](ts)
  }
}
let ts = 0
try {
  window.__m.apply()
  drain(${FRAMES})
  await new Promise((r) => setTimeout(r, 80))
  if (${MOUSE_AT} === 0) drain(Math.round(${FRAMES} / 3))
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
  document.title = 'cv ' + cv.width + 'x' + cv.height + (window.__shotTarget ? ' | mouse@' + ${MOUSE_AT} + ' fi=' + window.__shotTarget.fi + ' fired=' + !!window.__mouseFired + ' frame=' + (window.__shotDiag ? window.__shotDiag.frameCount : -1) + ' tgt=' + Math.round(window.__shotTarget.x) + ',' + Math.round(window.__shotTarget.y) : '')
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
console.log(`${OUT}  (${W}x${H} @${SCALE}x, ${FRAMES} 帧${ZOOM ? `, 放大 ${ZOOM}×` : ''}${MOUSE_AT ? `, 鼠标注入 @${MOUSE_AT} (${MOUSE_MODE})` : ''})`)
