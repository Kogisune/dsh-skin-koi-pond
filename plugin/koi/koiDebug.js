/**
 * koi-pond · 调试层模块（临时，TEST-SPECIMEN）
 * ⚠️⚠️ 调试专用模块：正式发布或提交版本更新前必须整体删除本文件，并删除
 *    koiPond.js 中所有标「TEST-SPECIMEN」的分支（全局搜索定位，含 build.mjs
 *    KOI_MODULES 里的本模块条目）。
 *
 * 开关（URL query，可同时开）：
 *   ?koitest  —— 钉点测试鱼：位置固定在「水平居中、top 200px」，其余行为
 *                （AI/状态机/骨骼/摆尾）完全不受约束；钉定方式是每帧整体平移回
 *                钉点（pos+trail+body 同步，保留路径弯曲形状 → 原地游泳观感），
 *                不能清空坐标（轨迹重采样会塌缩成一个点，身体消失）。
 *   ?koidebug —— 全鱼调试层：为每条鱼画状态色环 / vel·wish 向量 / 锚点 / 标签，
 *                顶部有汇总条。钉点鱼额外获得详情叠加层（drawSpecimenDebug）。
 *
 * 本模块提供（koiPond.js 等共享作用域引用）：
 *   TEST_SPECIMEN  钉点鱼开关          DEBUG_ALL   全鱼调试层开关
 *   specimenRef    钉点鱼引用          drawFishDebugAll()  全鱼调试层（frame 末尾调用）
 *   drawSpecimenDebug(k)               钉点鱼详情层
 *   dbgArrow(x1,y1,x2,y2,color,w)      箭头绘制工具
 */

// ---- 开关（读 URL，默认关闭 → 正式页面与回归探针 VM 环境零影响）----
const TEST_SPECIMEN =
  typeof location !== 'undefined' && /(?:^|[?&])koitest/.test(location.search || '')
const DEBUG_ALL =
  typeof location !== 'undefined' && /(?:^|[?&])koidebug/.test(location.search || '')

// 钉点鱼引用（mount 时赋值、cleanup 时置空；frame 末尾画详情层用）
let specimenRef = null

// ---- 箭头工具 ----
function dbgArrow(x1, y1, x2, y2, color, w) {
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = w
  const a = Math.atan2(y2 - y1, x2 - x1)
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - Math.cos(a - 0.4) * 7, y2 - Math.sin(a - 0.4) * 7)
  ctx.lineTo(x2 - Math.cos(a + 0.4) * 7, y2 - Math.sin(a + 0.4) * 7)
  ctx.closePath()
  ctx.fill()
}

// ---- 全鱼调试层（?koidebug）----
// 每条鱼画：① 状态色环 N=白 / A=黄 / E=红（半径 9，套在鱼头）
//           ② vel（绿）与 wish（青）向量 ×4 放大
//           ③ 漫游锚点（灰十字）—— 观察「躲避后返回旧路径」的关键
//           ④ 标签：状态缩写 + 速度（+ panic，>0.05 时显示）
// 顶部汇总条：鱼数 / 状态分布 / 平均速度。
function drawFishDebugAll() {
  if (!ctx || !DEBUG_ALL) return
  ctx.save()
  ctx.font = '10px ui-monospace, Consolas, monospace'
  let n = 0
  let nA = 0
  let nE = 0
  let sumV = 0
  for (let i = 0; i < flock.length; i++) {
    const k = flock[i]
    if (!k.active) continue
    n++
    const hx = k.pos.x
    const hy = k.pos.y
    const st = k.fs ? k.fs.name : FISH_STATE.NORMAL
    if (st === FISH_STATE.AVOID) nA++
    else if (st === FISH_STATE.ESCAPE) nE++
    const v = Math.hypot(k.vel.x, k.vel.y)
    sumV += v

    // ① 状态色环
    ctx.strokeStyle =
      st === FISH_STATE.ESCAPE
        ? 'rgba(248,113,113,0.9)'
        : st === FISH_STATE.AVOID
          ? 'rgba(250,204,21,0.9)'
          : 'rgba(255,255,255,0.45)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(hx, hy, 9, 0, 6.2832)
    ctx.stroke()

    // ② 运动向量化（×4）
    dbgArrow(hx, hy, hx + k.wish.x * 4, hy + k.wish.y * 4, 'rgba(34,211,238,0.8)', 1.5)
    dbgArrow(hx, hy, hx + k.vel.x * 4, hy + k.vel.y * 4, 'rgba(74,222,128,0.8)', 1.5)

    // ③ 漫游锚点（灰十字）
    if (k.anchor) {
      const ax = k.anchor.x
      const ay = k.anchor.y
      ctx.strokeStyle = 'rgba(156,163,175,0.7)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(ax - 4, ay)
      ctx.lineTo(ax + 4, ay)
      ctx.moveTo(ax, ay - 4)
      ctx.lineTo(ax, ay + 4)
      ctx.stroke()
    }

    // ④ 标签（深底 chip，保证任何主题下可读）
    const label =
      (st === FISH_STATE.ESCAPE ? 'E' : st === FISH_STATE.AVOID ? 'A' : 'N') +
      ' v' + v.toFixed(1) +
      (k.panic > 0.05 ? ' p' + k.panic.toFixed(1) : '')
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(hx + 11, hy - 18, label.length * 6 + 6, 14)
    ctx.fillStyle = '#e5e7eb'
    ctx.fillText(label, hx + 14, hy - 7)
  }
  // 汇总条（左上角）
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(10, 10, 250, 22)
  ctx.fillStyle = '#e5e7eb'
  ctx.fillText(
    'fish=' + n + '  N:' + (n - nA - nE) + ' A:' + nA + ' E:' + nE +
    '  avg|v|=' + (n ? (sumV / n).toFixed(2) : '0') + ' px/f',
    18,
    25
  )
  ctx.restore()
}

// ---- 钉点鱼详情层（?koitest；全鱼层之外的深度观测）----
// 画四类信息（屏幕空间，最后绘制保证不被荷叶遮挡）：
//   ① 运动向量化：wish vs vel，×6 放大（比全鱼层更大尺度、更清晰）
//   ② 未来 12 步预测路径：简化 seek 收敛模型 v ← v + (wish−v)×0.3，黄点渐隐
//   ③ 骨骼动态条形图：rel（黄，关节相对角）与 bend（青，C 形弯曲波）沿脊柱分布
//     —— 能直接看到 C 形波「从头注入 → 向尾传播」的全过程
//   ④ 文本面板：状态机状态 / panic / turnCum / 速度 / 摆频参数
function drawSpecimenDebug(k) {
  if (!ctx) return
  const hx = k.pos.x
  const hy = k.pos.y
  ctx.save()
  ctx.font = '11px ui-monospace, Consolas, monospace'

  // ① 运动向量化（×6 放大；wish 本身是「方向×期望速度」向量，与 vel 同尺度可比）
  dbgArrow(hx, hy, hx + k.wish.x * 6, hy + k.wish.y * 6, 'rgba(34,211,238,0.9)', 2)
  dbgArrow(hx, hy, hx + k.vel.x * 6, hy + k.vel.y * 6, 'rgba(74,222,128,0.9)', 2)

  // ② 未来 12 步预测路径：每步 v 向 wish 收敛 30%（与 seek 的 SEEK_GAIN 同量级），
  //    位置按 v 整步推进 —— 黄点串就是「若状态与指针不再变化，鱼头接下来会走的路」
  let px = hx
  let py = hy
  let vx = k.vel.x
  let vy = k.vel.y
  const capV = k.maxSpeed * 3
  ctx.fillStyle = 'rgba(250,204,21,0.9)'
  for (let s = 0; s < 12; s++) {
    vx += (k.wish.x - vx) * 0.3
    vy += (k.wish.y - vy) * 0.3
    const sp = Math.hypot(vx, vy)
    if (sp > capV) {
      vx *= capV / sp
      vy *= capV / sp
    }
    px += vx
    py += vy
    ctx.globalAlpha = Math.max(0.15, 0.9 - s * 0.065)
    ctx.beginPath()
    ctx.arc(px, py, 2, 0, 6.2832)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // ③ 骨骼动态条形图（基线 = 鱼下方 130px，宽 360，覆盖 m 个关节）：
  //    黄 = rel[i]（关节相对角，×75 缩放，±45px 封顶）
  //    青 = bend[i]（C 形弯曲波偏置，×107 缩放 = ±BEND_MAX 映射满量程）
  const sk = k.sk
  const m = sk.rel.length
  const bx0 = hx - 180
  const by0 = hy + 130
  const bw = 360
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(bx0, by0)
  ctx.lineTo(bx0 + bw, by0)
  ctx.stroke()
  for (let i = 0; i < m; i++) {
    const x = bx0 + (bw * i) / (m - 1)
    const hR = Math.max(-45, Math.min(45, sk.rel[i] * 75))
    if (Math.abs(hR) > 0.5) {
      ctx.strokeStyle = 'rgba(250,204,21,0.95)'
      ctx.beginPath()
      ctx.moveTo(x, by0)
      ctx.lineTo(x, by0 - hR)
      ctx.stroke()
    }
    const hB = Math.max(-45, Math.min(45, sk.bend[i] * 107))
    if (Math.abs(hB) > 0.5) {
      ctx.strokeStyle = 'rgba(34,211,238,0.95)'
      ctx.beginPath()
      ctx.moveTo(x + 3, by0)
      ctx.lineTo(x + 3, by0 - hB)
      ctx.stroke()
    }
  }

  // ④ 文本面板（鱼上方）+ 图例 + 条形图标注
  const st = k.fs ? k.fs.name : '-'
  const lines = [
    'state=' + st + '  panic=' + k.panic.toFixed(2) + '  turnCum=' + ((k.turnCum * 180) / Math.PI).toFixed(0) + 'deg',
    '|vel|=' + Math.hypot(k.vel.x, k.vel.y).toFixed(2) + '  |wish|=' + Math.hypot(k.wish.x, k.wish.y).toFixed(2) + ' px/f',
    'beat=' + k.beat.toFixed(2) + '  speedNorm=' + k.speedNorm.toFixed(2) + '  phase=' + (k.swimPhase % 6.2832).toFixed(2),
  ]
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(hx - 180, hy - 164, 372, 54)
  ctx.fillStyle = '#e5e7eb'
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], hx - 172, hy - 146 + i * 16)

  const ly = hy - 100
  ctx.fillStyle = 'rgba(34,211,238,0.9)'
  ctx.fillRect(hx - 180, ly - 6, 12, 3)
  ctx.fillStyle = '#e5e7eb'
  ctx.fillText('wish 想去', hx - 164, ly)
  ctx.fillStyle = 'rgba(74,222,128,0.9)'
  ctx.fillRect(hx - 100, ly - 6, 12, 3)
  ctx.fillStyle = '#e5e7eb'
  ctx.fillText('vel 实际', hx - 84, ly)
  ctx.fillStyle = 'rgba(250,204,21,0.9)'
  ctx.fillRect(hx - 20, ly - 6, 12, 3)
  ctx.fillStyle = '#e5e7eb'
  ctx.fillText('预测路径', hx - 4, ly)

  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.fillText('rel 关节角(黄) / bend 弯曲波(青) ← 头', bx0, by0 + 14)
  ctx.restore()
}
