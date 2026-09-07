/**
 * koi-fish · 鱼对象装配（组件化）与向量寻游运动学（共享作用域片段）
 * 依赖：koiMath（rnd/mag/setMag/limit/dist）、koiSkeleton（makeSkeleton/updateSkeleton/
 * bodyArc）、koiState（FISH_STATE/mkFishState/updateFishState/koiStartle/FLEE_R）、
 * koiComponent（attachComponent/detachComponent/updateComponents）、koiSchemes（scheme）、
 * koiPond 的状态（flock/W/H/leaves/PERC/frameCount/FPS，运行时解析）。
 *
 * 鱼 = 一个「抽象对象」：数据字段 + 一组可拔插组件（见 koiComponent）：
 *   - state    状态机（普通/躲避/逃跑，koiState）—— 决定行为意图
 *   - motion   向量寻游：算下一步目标向量 k.wish（方向=去向、模长=期望速度 px/帧），
 *              用 seek 加速度 (wish−vel)×GAIN 让速度平滑收敛 —— 起步/转向/逃跑
 *              都是自然的加速-减速过渡；游速同时平滑映射到尾巴摆频/摆幅
 *   - body     原始轨迹入队 + 等弧长重采样（体长与速度无关，见下）
 *   - skeleton 骨骼刷新（切线/行波/部位绑定/鳍相位，koiSkeleton）
 * 渲染层只读 k.body / k.sk / k.panic，与组件实现解耦。
 */
// ---- 鱼身轨迹 ----
// 身体不能直接用「每帧头部的原始轨迹」，否则体长 = 段数 × 每帧位移：
// 躲闪时速度涨到约 2 倍，整条鱼被拉长近一倍（实测 82px → 最差帧 177px），
// 同时点距从 2.8px 涨到 4.7px，相邻椭圆的重叠层数掉四成，圆心逐个显形，
// 就是肉眼看到的「间隔纹路」。
// 改为：先按帧记录一段原始轨迹，再按固定弧长重采样出身体点列，
// 体长与段间距都与瞬时速度无关。
const TRAIL_MAX = 288 // 轨迹容量（帧）需满足 TRAIL_MAX × 最低速度 ≥ 体长上界
// 体型随机后 baseSize ≤ 21 × 1.35 + 1 ≈ 29 → 体长 ≤ 5.75 × 29 ≈ 167px，
// 288 帧可覆盖持续 0.58px/帧 的极端低速
const BODY_ARC_RATIO = 5.75 // 体长 = baseSize × 该系数
// 段间距恒为 5.75 / 2 ≈ 2.9px，与修复前巡航时的实测点距（2.84px）一致 ——
// 保留原有观感，只去掉随速度漂移的那部分

// ---- 向量寻游（wish）参数 ----
// k.wish = 「下一步目标向量」：方向 = 下一步想去的方向，模长 = 期望速度。
// 加速度 = (wish − vel) × SEEK_GAIN（再按状态钳制力上限），速度朝目标平滑收敛：
// 速度差大 → 持续加速到目标；接近目标 → 差变小 → 自然减速 —— 加减速过度由此而来。
// 模长（期望速度）直接驱动游速→摆频/摆幅映射：想让鱼游快一点/尾巴甩快一点，
// 只改 wish 的模长即可（见 updateMotion 的 k.speedNorm/k.beat 推导）。
const SEEK_GAIN = 0.3 // (wish−vel) 收敛系数
// 力上限按状态分级（px/帧²，钳制加速）：普通巡航轻推、躲避略强、逃跑爆发
// 关键：力上限才是转向速率的真正节流阀，不是 MAX_TURN。每帧航向变化 dθ ≈ a⊥/v，
// 旧值 NORMAL 0.14/2.6 ≈ 0.054 rad/帧（≈3°/帧，180° 要 58 帧 ≈1 秒）—— 远低于
// MAX_TURN 0.28 的钳制线，所以 MAX_TURN 从未生效、只是安全网。抬力才能真正转快。
// 新值按「目标转向角速度 × 典型速度」反推：
//   NORMAL 0.55 → dθ≈0.21 rad/帧（90° 约 7.5 帧，180° 约 15 帧 ≈250ms）从容巡航
//   AVOID  2.40 → dθ≈0.40 rad/帧 @v≈6（90° 闪避约 4 帧 ≈67ms）受惊侧闪
const FORCE_NORMAL = 0.55
const FORCE_AVOID = 2.40
// 躲避爆发倍率：躲避期望速度 = maxSpeed×(0.85~1.7)×该值（见 avoidWish 注释）。
// 峰值 ≈ 5.1×maxSpeed ≈ 逃跑爆发（18.2）；velocity 上限 capV 同步用（见 updateMotion）。
const AVOID_BURST = 3
// 逃跑加速度上限：爆发速度翻倍后，加速度需同步放大才能在「快启动」的时间尺度内
// 真的冲到那个速度（ω 不变、v 翻倍 → 同样帧数内 Δv 翻倍，力必须翻倍）。
const FORCE_ESCAPE = 1.7
// 逃跑爆发速度 = maxSpeed × 该倍率。5.2 ≈ 巡航 7×（18px/帧 ≈ 9.5 体长/秒），
// 对齐真实鱼 fast-start 的 5~10× 巡航倍率 —— 受惊是「弹射出去」不是「加速游走」。
const ESCAPE_SPEED = 5.2
// 游速平滑系数（speedNorm/beat 的帧间 lerp）。原 0.12 → 90% 收敛约 19 帧 ≈317ms，
// 尾巴摆频严重滞后于实际位移，是「运动和移动速度不匹配」的主因；0.30 → 约 7.6 帧
// ≈127ms，仍在肉眼可辨的「有惯性」范围内，但不至于甩尾了还按巡航频率摆。
const SPEED_EASE = 0.30
// 摆频随游速的映射：speedNorm 上限（相对巡航速度的倍数）与压缩指数。
// 上限不再卡在 1.0（旧值在巡航速度处就饱和，超过巡航后摆频完全不涨 ——
// 逃跑时尾巴还在按巡航频率摆，观感即「速度与动作不匹配」）。
// 指数 <1 做亚线性压缩：高速时摆频继续涨但不至于爆到视觉发抖（见下推导值）。
const BEAT_SPEED_CAP = 3.0
const BEAT_SPEED_EXP = 0.55

// ---- 鱼 ----
function makeKoi(idx) {
  // 体型随机：sizeVar 是独立体型参数，直接放大/缩小体宽（baseSize）与体长，
  // 让池塘里有大有小（约 0.72× ~ 1.35×，成体约 57px ~ 161px）
  const sizeVar = rnd(0.72, 1.35)
  const baseSize = Math.max(10, Math.round(rnd(12, 20) * sizeVar)) + scheme.mods.size
  const bodyLength = baseSize * 2
  const lf = leaves[idx % leaves.length]
  const ang = rnd(0, Math.PI * 2)
  const rr = rnd(12, 80)
  const px = lf.x + Math.cos(ang) * rr
  const py = lf.y + Math.sin(ang) * rr
  const out = Math.atan2(py - lf.y, px - lf.x) + rnd(-0.7, 0.7)
  const spd = rnd(2.5, 4.5)
  const k = {
    pos: { x: px, y: py },
    vel: { x: Math.cos(out) * spd, y: Math.sin(out) * spd },
    acc: { x: 0, y: 0 },
    maxSpeed: 3.5 + scheme.mods.speed,
    // 巡游期望速度：随配色 speed 修饰微调（快慢配色真的快慢起来）
    cruise: rnd(2.2, 3.0) + Math.max(-2, Math.min(2, scheme.mods.speed)) * 0.4,
    sizeVar,
    baseSize,
    baseSize0: baseSize,
    bodyLength,
    color: scheme.c,
    color2: scheme.c2,
    body: [],
    trail: [],
    active: false,
    bornFrame: 8 + idx * 7,
    panic: 0,
    turnCum: 0, // 近期累计转向角（rad，带衰减）—— 持续盘旋检测，clampHeading 用
    jitter: rnd(-0.6, 0.6),
    sk: null, // 骨骼，下方 makeSkeleton 填充
    // ---- 状态机与向量寻游字段（组件共享状态） ----
    comps: [], // 组件注册表（attachComponent 填充）
    comp: null, // name → 组件索引
    fs: mkFishState(), // 状态机（koiState）
    anchor: { x: px, y: py, r: 0, t: 0, life: 0 }, // 普通态漫游锚点
    wish: { x: 0, y: 0 }, // 下一步目标向量
    swimPhase: rnd(0, Math.PI * 2), // 游动相位（逐帧按 beat 推进，行波/鳍相位用）
    beat: 1, // 摆频系数（速度→摆频/摆幅的平滑映射，0.3≈怠速 ~ 1.7≈爆发）
    speedNorm: 0.6, // 当前游速 / 巡游速度 的平滑值（0~1+）
  }
  // 骨骼（部位绑定 / 行波动效 / 鳍相位）
  k.sk = makeSkeleton(k)
  // 身体点复用（每帧就地改写，不再重新分配）
  for (let i = 0; i < bodyLength; i++) k.body.push({ x: px, y: py })
  // 轨迹预填为一条笔直的尾迹，鱼一出生就是完整体长，
  // 不会出现「从一个点长出来」的过程
  const pre = bodyArc(k) / (TRAIL_MAX - 1)
  const back = setMag({ x: k.vel.x, y: k.vel.y }, 1)
  for (let i = 0; i < TRAIL_MAX; i++) {
    k.trail.push({ x: px - back.x * pre * i, y: py - back.y * pre * i })
  }
  resampleBody(k)
  // ---- 组件装配（依赖顺序：state → motion → body → skeleton）----
  attachComponent(k, { name: 'state', update() { updateFishState(k) } })
  attachComponent(k, { name: 'motion', update() { updateMotion(k) } })
  attachComponent(k, { name: 'body', update() { updateBody(k) } })
  attachComponent(k, { name: 'skeleton', update() { updateSkeleton(k.sk, k, frameCount) } })
  return k
}

function bodyArc(k) {
  return k.baseSize * BODY_ARC_RATIO
}

/**
 * 把原始轨迹（按帧采样，点距 = 瞬时速度）重采样为「按真实鱼骨骼密度分布」的
 * 身体点列。结果：体长恒定（躲闪不再拉长），段间距按节点密度梯度
 * （头部稀疏 + 上腩中 + 下腹密集）从大到小递减，任意两节点间的弧长
 * 由 sk.nodeTs[i] 给出。轨迹不够长时（刚出生/极慢速）尾部收敛到最老的那个轨迹点。
 */
function resampleBody(k) {
  const totalArc = bodyArc(k)
  const tr = k.trail
  const last = tr.length - 1
  const n = k.bodyLength
  const nodeTs = k.sk ? k.sk.nodeTs : null
  let seg = 0
  let walked = 0 // 已走过的弧长（到 tr[seg] 为止）
  for (let i = 0; i < n; i++) {
    // 弧长目标 = nodeT(i, n) × totalArc（按新分布：头稀疏+上腩中+下腹密）
    const t = nodeTs ? nodeTs[i] : i / (n - 1)
    const target = t * totalArc
    let px = tr[last].x
    let py = tr[last].y
    while (seg < last) {
      const ax = tr[seg].x
      const ay = tr[seg].y
      const bx = tr[seg + 1].x
      const by = tr[seg + 1].y
      const d = Math.hypot(bx - ax, by - ay)
      if (walked + d >= target) {
        const tt = d < 1e-6 ? 0 : (target - walked) / d
        px = ax + (bx - ax) * tt
        py = ay + (by - ay) * tt
        break
      }
      walked += d
      seg++
    }
    k.body[i].x = px
    k.body[i].y = py
  }
}

// 指针
let mouse = { x: -9999, y: -9999, vx: 0, vy: 0, last: 0 }
let drawing = false
let lastRX = 0
let lastRY = 0

// 掉头运动学约束（与骨骼关节限幅配套）：
// 速度若可穿过 0，指针刚越过鱼身时鱼会在原地停一拍再反向 —— 头部轨迹在近零
// 位移里折 180°，弧长重采样把整段转角压进亚像素段（身体打结、单关节 180°）。
//  - 最小转弯半径（本轮新增，治「原地卷成螺旋」）：身体形状 = 头部轨迹历史的
//    重采样，只要头部路径的转弯半径塌到远小于体长，轨迹历史就卷成环，
//    身体跟着卷成螺旋（实测截图：近整圈）。所以**任何状态**下都强制
//    dθ ≤ v / R_MIN，R_MIN 按体长的比例给：普通 0.5L（巡航缓弯）、
//    躲避/逃跑 0.16L（C 形急转，路径弧长 ≈ 半个圆周 ≈ 半条体长，
//    身体折成 U 形 —— 正是真实鱼 C-turn 的俯视轮廓）。旧的「低速自由转向
//    （cap=π）」整条删除：它就是螺旋卷的直接来源。
//  - 转向角速度上限（turnCap）：半径约束之外的兜底（防高速小半径抖动）。
//  - 速度下限：鱼永不真正停下（巡航/逃逸都有最小前冲），轨迹始终有空间延展。
const MAX_TURN = 0.45 // 速度方向最大转向（弧度/帧 ≈ 26°/帧）
const SPEED_FLOOR = 0.6 // 速度下限（px/帧）
// 最小转弯半径（× 体长，px）：普通巡航宽弧、躲避/逃跑 C 形急转。
// 0.16 → 单次 90~180° 掉头的路径 ≈ 半个圆周 ≈ 0.5L，身体折成 U 形 —— 正是
// 真实鱼 C-turn 的俯视轮廓。
const TURN_R_FRAC_NORMAL = 0.5
const TURN_R_FRAC_FAST = 0.16
// 持续同向转弯的半径放宽：turnCum 记录近期累计转向角（带衰减），|turnCum| 越大
// rMin 放得越宽。**必须**有它：rMin=0.16L 盘旋时圆周 = 2π×0.16L ≈ 1.0×体长，
// 路径恰好卷出与身体等长的环 —— 持续躲避的鱼会沿最小半径无限盘旋，身体沿
// 环重采样后卷成整圈（实测截图病灶）。身体沿环不打结要求 L/R ≤ π，即持续盘旋时
// R ≥ 0.32L；累积半圈(π)后 widen≈2.3 → R≈0.37L ✓。单次 180° 掉头只在本征段
// 轻微加宽（尾部 flare out），观感自然。真实鱼同样无法持续最小半径盘旋。
const TURN_CUM_DECAY = 0.97 // 累计转向衰减/帧（30fps 下半衰约 23 帧 ≈0.8s）
function clampHeading(k) {
  // 在 k.vel += k.acc 之后调用：若新航向相对旧航向超过状态上限则钳回（幅值保留，
  // 加速度的纵向/横向效果仍并入大小）；幅值低于 SPEED_FLOOR 时抬到下限。
  const vx = k.vel.x
  const vy = k.vel.y
  const sp = Math.hypot(vx, vy)
  const oa = Math.atan2(vy - k.acc.y, vx - k.acc.x) // 旧航向（acc 已并入，先减回）
  const os = Math.hypot(vx - k.acc.x, vy - k.acc.y) // 旧速
  const st = k.fs ? k.fs.name : FISH_STATE.NORMAL
  const turnCap = st === FISH_STATE.ESCAPE ? 0.80 : st === FISH_STATE.AVOID ? 0.70 : MAX_TURN
  // 最小转弯半径：dθ ≤ v / R_MIN（v 用旧速，与位移一致性最高）。
  // 低速时半径约束自然压低可转角 —— 低速急转必卷轨迹，这正是要禁止的。
  // 持续同向转弯按累计量放宽（见 TURN_CUM_DECAY 注释），防止沿 rMin 无限盘旋卷环。
  k.turnCum = (k.turnCum || 0) * TURN_CUM_DECAY
  const widen = 1 + 2 * Math.min(1, Math.abs(k.turnCum) / (1.5 * Math.PI))
  const rMin = (st === FISH_STATE.NORMAL ? TURN_R_FRAC_NORMAL : TURN_R_FRAC_FAST) * widen * bodyArc(k)
  const rCap = Math.max(os, 0.3) / rMin
  const cap = Math.min(turnCap, rCap)
  let nd = Math.atan2(vy, vx)
  let diff = nd - oa
  while (diff > Math.PI) diff -= 2 * Math.PI
  while (diff < -Math.PI) diff += 2 * Math.PI
  if (diff > cap) nd = oa + cap
  else if (diff < -cap) nd = oa - cap
  k.turnCum += nd - oa // 记录实际转向（带符号），供持续盘旋检测放宽半径
  const cs = Math.cos(nd)
  const sn = Math.sin(nd)
  k.vel.x = cs * Math.max(SPEED_FLOOR, sp)
  k.vel.y = sn * Math.max(SPEED_FLOOR, sp)
}

// 环绕时整条轨迹同步平移，否则身体会在屏幕两侧被拉成断开的两截。
// 逃跑态越界（游出画面）在此收尾：环绕回对侧并回到普通态（panic 由 enterState 压档）。
function edges(k) {
  let dx = 0
  let dy = 0
  if (k.pos.x > W + 50) {
    k.pos.x = -50
    dx = -(W + 100)
  } else if (k.pos.x < -50) {
    k.pos.x = W + 50
    dx = W + 100
  }
  if (k.pos.y > H + 50) {
    k.pos.y = -50
    dy = -(H + 100)
  } else if (k.pos.y < -50) {
    k.pos.y = H + 50
    dy = H + 100
  }
  if (dx || dy) {
    for (let i = 0; i < k.trail.length; i++) {
      k.trail[i].x += dx
      k.trail[i].y += dy
    }
    if (k.fs && k.fs.name === FISH_STATE.ESCAPE) enterState(k, FISH_STATE.NORMAL)
  }
}

// ---- 漫游锚点（普通态）----
// 每条鱼在心里有个「想去的地方」；到达附近或超时后换一个新锚点。
// 锚点始终落在池塘内边距内（resize 后越界的锚点在 updateWander 里重摇）。
function rollAnchor(k) {
  const a = k.anchor
  const m = 80
  a.x = rnd(m, Math.max(m + 1, W - m))
  a.y = rnd(m, Math.max(m + 1, H - m))
  a.r = rnd(40, 90) // 到达判定半径（进入即视为到点）
  a.life = Math.round(rnd(240, 560)) // 最长盯一个锚点的时间（帧）
  a.t = 0
}
/**
 * 重新摇锚点，并主动避开指定威胁点。
 * 用途：躲避/逃跑结束回到普通态时调用。旧锚点是「被吓跑之前想去的地方」，躲完之后
 * 弹簧力 (anchor−pos)×0.05 会立刻把鱼往回拉 —— 而那个位置往往还在指针附近，
 * 于是再次触发躲避，形成「躲开→掉头回来→再躲」的震荡（用户实测）。
 *
 * 方向策略（用户实测「躲避结束后整体旋转」的修复）：新锚点**不再全塘随机**，
 * 而是落在鱼当前前进方向 ±55° 的前方扇形内（距离 1.2~2.2×FLEE_R）——真实鱼逃避后
 * 沿逃逸方向滑行减速，不会掉头。旧实现随机重摇的锚点常在侧后方，回 NORMAL 瞬间
 * wish 跳变：大小从爆发速掉到巡航速（主导项 = 强刹车）+ 指向侧后方的横向力，
 * 速度刹下来后 dθ=a⊥/v 暴涨，鱼带着接近直的身体原地转（C 形波只在转向发起瞬间
 * 注入一次，转向中段无弯曲）——即「整体旋转」。
 */
function rollAnchorAway(k, tx, ty) {
  const sp = Math.hypot(k.vel.x, k.vel.y)
  const heading = sp > 0.01 ? Math.atan2(k.vel.y, k.vel.x) : rnd(0, Math.PI * 2)
  const ang = heading + rnd(-0.96, 0.96) // 前方 ±55° 扇形
  const dist = rnd(FLEE_R * 1.2, FLEE_R * 2.2)
  const m = 80
  const maxX = Math.max(m + 1, W - m)
  const maxY = Math.max(m + 1, H - m)
  k.anchor.x = Math.min(maxX, Math.max(m, k.pos.x + Math.cos(ang) * dist))
  k.anchor.y = Math.min(maxY, Math.max(m, k.pos.y + Math.sin(ang) * dist))
  k.anchor.r = rnd(40, 90)
  k.anchor.life = Math.round(rnd(240, 560))
  k.anchor.t = 0
  if (!(tx > -999)) return // 无有效威胁点，前方扇形锚点已足够
  const safe = FLEE_R * 1.6 // 锚点要离威胁点多远才算安全
  for (let n = 0; n < 3; n++) {
    const dx = k.anchor.x - tx
    const dy = k.anchor.y - ty
    const d = Math.hypot(dx, dy)
    if (d > safe) break
    // 前方扇形一般已离开威胁半径；兜底：沿远离威胁方向再推
    const ux = d < 0.001 ? 1 : dx / d
    const uy = d < 0.001 ? 0 : dy / d
    k.anchor.x = Math.min(maxX, Math.max(m, k.anchor.x + ux * FLEE_R * 0.8))
    k.anchor.y = Math.min(maxY, Math.max(m, k.anchor.y + uy * FLEE_R * 0.8))
  }
}

function updateWander(k) {
  const a = k.anchor
  if (a.x < 0 || a.x > W || a.y < 0 || a.y > H) rollAnchor(k)
  if (dist(k.pos, a) < a.r || ++a.t > a.life) rollAnchor(k)
}

// ---- 躲避（AVOID）期望速度 ----
// C-start 语义（用户 ?koitest 目测定稿）：真实鱼被惊吓时**一次性选定方向 → 全力
// 爆发远离**，中途不逐帧改判。旧实现每帧按指针当前位置重算方向 —— 指针一动 wish
// 就实时甩、预测路径和鱼头跟着实时旋转，观感「摇头」，不真实。
// 现在：enterState(AVOID) 时锁定方向存 fs.avoidDir，其后逐帧沿用；改判仅在
//   ① 低频计时器 AVOID_REPATH 到点（≈0.67s，兜底追上指针大幅移动）
//   ② 紧急：离指针很近（< 0.35×FLEE_R）且锁定方向朝向威胁（dot>0.2，正面撞上）
// 速度/panic 仍逐帧随距离更新 —— 爆发快、尾摆快由速度与 panic 驱动，与方向解耦。
const AVOID_REPATH = 20 // 方向重判间隔（帧，≈0.67s @30fps）

// 计算当前几何下的逃离方向（单位向量）：朝指针预测落点的远端，径向为主 + 切向 banking
function calcAvoidDir(k) {
  const px = mouse.x + mouse.vx * 4
  const py = mouse.y + mouse.vy * 4
  const d1 = dist(k.pos, mouse)
  const d2 = Math.hypot(k.pos.x - px, k.pos.y - py)
  const tx = d2 < d1 ? px : mouse.x
  const ty = d2 < d1 ? py : mouse.y
  const dd = Math.max(0.001, Math.hypot(k.pos.x - tx, k.pos.y - ty))
  const dx = (k.pos.x - tx) / dd
  const dy = (k.pos.y - ty) / dd
  // 轻微随机偏转（jitter），让群体逃开时不至于全挤到同一角度
  const cj = Math.cos(k.jitter)
  const sj = Math.sin(k.jitter)
  const rx = dx * cj - dy * sj
  const ry = dx * sj + dy * cj
  // 依指针横扫方向选一侧切向绕行（cross 符号），像鱼侧身躲开而不是刹车
  const cross = mouse.vx * dy - mouse.vy * dx
  const sign = cross >= 0 ? 1 : -1
  const tanX = -dy * sign
  const tanY = dx * sign
  // 径向逃（rx,ry）为主、切向绕行为辅：合成方向偏径向 atan(1.5/2.2) ≈ 34°，
  // 是「侧身 banking 闪开」而非「刹车倒车」—— 避开减速到 SPEED_FLOOR 后原地打转
  const ax = rx * 2.2 + tanX * 1.5
  const ay = ry * 2.2 + tanY * 1.5
  const al = Math.hypot(ax, ay) || 1
  return { x: ax / al, y: ay / al }
}

// 锁定逃跑方向（enterState(AVOID) 首次调用；此后仅低频/紧急改判时调用）
function lockAvoidDir(k) {
  if (mouse.x < -999) return
  k.fs.avoidDir = calcAvoidDir(k)
  k.fs.avoidRepath = AVOID_REPATH
}

function avoidWish(k) {
  const dir = { x: 0, y: 0 }
  let speed = 0
  let panic = 0
  if (mouse.x < -999) return dir
  const dd = dist(k.pos, mouse)
  // 作用范围跟退出半径一致（FLEE_R_EXIT=240）：状态在躲避期间（未跑出 240px）
  // 都持续提供逃离 wish —— 否则 150~240px 之间 wish 归零，鱼会在半途刹车
  if (dd >= FLEE_R_EXIT || dd < 0.001) return dir
  const closeness = Math.min(1, 1 - dd / FLEE_R_EXIT)
  panic = closeness * closeness
  // panic 下限：退出半径拉大到 240px 后，飞行中段 closeness 已很低，panic 若随之
  // 衰减会出现「逃到一半摆频和速度上限先掉下来」的泄气感。躲避全程保底 0.45，
  // 维持摆频加成（beat ×1.27）与速度上限（capV ×1.5），直到跑出半径自然退出。
  panic = Math.max(panic, 0.45)
  const fs = k.fs
  // 改判判定（低频，见文件头注释）：计时器到点，或紧急正面相撞
  let relock = !fs.avoidDir || fs.avoidRepath-- <= 0
  if (!relock && dd < FLEE_R * 0.35) {
    const tox = (mouse.x - k.pos.x) / dd
    const toy = (mouse.y - k.pos.y) / dd
    if (fs.avoidDir.x * tox + fs.avoidDir.y * toy > 0.2) relock = true
  }
  if (relock) lockAvoidDir(k)
  dir.x = fs.avoidDir.x
  dir.y = fs.avoidDir.y
  // 期望速度：越近越快 ×AVOID_BURST(3) —— 优先远离、爆发速度快；
  // 尾摆频率随速度与 panic 自动加快（speedNorm/beat 映射），方向锁定不影响摆尾
  speed = k.maxSpeed * (0.85 + closeness * 0.85) * AVOID_BURST
  return { ...dir, speed, panic }
}

// ---- 期望速度合成：k.wish = 状态行为 → 目标向量 ----
function computeWish(k) {
  const st = k.fs.name
  let dx = 0
  let dy = 0
  let spd = 0
  if (st === FISH_STATE.NORMAL) {
    // 普通：期望方向 = 归一化(锚点吸引力 + 邻鱼群游修正)，期望速度 = 巡航 × 到点减速。
    // 锚点吸引力 ∝ 距离（弹性力），离得越远越想往锚点走；
    // 邻鱼修正：太近就「分离」推开、大致同向则「对齐」顺游 —— 二者都只改方向不改速度。
    updateWander(k)
    const a = k.anchor
    let vx = (a.x - k.pos.x) * 0.05
    let vy = (a.y - k.pos.y) * 0.05
    let na = 0
    let axv = 0
    let ayv = 0
    for (let j = 0; j < flock.length; j++) {
      const o = flock[j]
      if (o === k || !o.active) continue
      const d = dist(k.pos, o.pos)
      if (d < PERC) {
        // 对齐（学邻居游向，权重小）
        axv += o.vel.x
        ayv += o.vel.y
        na++
        // 分离（近距离推开：距离越近权重越高）
        if (d > 0.001 && d < PERC * 0.45) {
          const w = (PERC * 0.45 - d) / (PERC * 0.45)
          vx += ((k.pos.x - o.pos.x) / d) * 0.9 * w
          vy += ((k.pos.y - o.pos.y) / d) * 0.9 * w
        }
      }
    }
    if (na > 0) {
      vx += (axv / na) * 0.012
      vy += (ayv / na) * 0.012
    }
    // 期望方向 = 合力方向
    const dl = Math.hypot(vx, vy)
    if (dl < 1e-6) {
      dx = k.vel.x
      dy = k.vel.y
      const dl0 = Math.hypot(dx, dy) || 1
      dx /= dl0
      dy /= dl0
    } else {
      dx = vx / dl
      dy = vy / dl
    }
    // 轻幅正弦偏摆让游迹更活。幅度 0.35 → 0.12：真实锦鲤巡航「头很稳」——路径近直，
    // 摆动只发生在身体上（头稳尾摆）。旧值 ±0.35rad(±20°) 让 wish 方向以半个摆尾频率
    // 摇摆 → 速度方向跟着摇 → 头部轨迹本身成蛇形线（头是路径锚点，整条鱼跟着摆）；
    // 且航向摇摆使头端曲率持续变化 → C 形波 drive 在巡航时也不断注入脉冲 →
    // 身体在非转弯状态下频繁变形（违反「转弯以外变化幅度很小」）。±0.12(±7°) 保微活性。
    const sw = Math.sin(k.swimPhase * 0.5 + k.jitter) * 0.12
    const cs = Math.cos(sw)
    const sn = Math.sin(sw)
    const rx = dx * cs - dy * sn
    const ry = dx * sn + dy * cs
    dx = rx
    dy = ry
    // 到锚点前的减速（进入 2×r 后按距离线性收期望速度）—— 起步/到点的
    // 加减速过度都来自 (wish−vel) seek，这里只决定「想多快」
    spd = k.cruise * Math.max(0.22, Math.min(1, Math.hypot(a.x - k.pos.x, a.y - k.pos.y) / (a.r * 2)))
  } else if (st === FISH_STATE.AVOID) {
    const w = avoidWish(k)
    if (w.speed > 0) {
      dx = w.x
      dy = w.y
      spd = w.speed
      if (w.panic > k.panic) k.panic = w.panic // 越近越慌（motion 里自然衰减）
    }
  } else {
    // 逃跑：直奔「最近的边缘」外的目标点爆发。全程无视指针 —— 方向只由
    // 逃跑目标决定，指针再近也不改向、不叠加远离分量（逃命时鱼不会回头看）。
    const e = k.fs.esc || nearestEdgeTarget(k)
    let ex = e.x - k.pos.x
    let ey = e.y - k.pos.y
    const el = Math.hypot(ex, ey) || 1
    ex /= el
    ey /= el
    // 刚进入 ESCAPE 的前 9 帧保留前冲惯性（鱼先冲刺一段再大幅转弯，更真实）：
    // wish = 50% 当前 vel 方向 + 50% 朝边缘方向，随 fs.t 线性衰减前冲权重。
    // 真实鱼逃跑「离弦而出」也是先弹射再转向，不会原地折返；旧版立即让 vel 朝
    // 边缘方向 = 让 vel 在小弧长内 180° 掉头 → body 在头部附近被打成蚂蟥环。
    if (k.fs.t < 9) {
      const csp = Math.hypot(k.vel.x, k.vel.y)
      if (csp > 0.5) {
        const cur = 1 - k.fs.t / 9 // 1 → 0，前冲惯性线性衰减
        ex = ex * (1 - cur * 0.5) + (k.vel.x / csp) * (cur * 0.5)
        ey = ey * (1 - cur * 0.5) + (k.vel.y / csp) * (cur * 0.5)
        const nl = Math.hypot(ex, ey) || 1
        ex /= nl
        ey /= nl
      }
    }
    dx = ex
    dy = ey
    spd = k.maxSpeed * ESCAPE_SPEED
  }
  // 不倒车 carving（NORMAL/AVOID）：wish 与当前航向夹角超过 ~112° 时把 wish
  // 转到限角。正对鱼头的威胁/身后新锚点会让径向 wish 与 vel 反向 → seek 刹车
  // 到 SPEED_FLOOR → 原地 pivot（半径塌缩 → 轨迹卷环 → 身体卷成螺旋）。
  // 真实鱼也不会「倒着游」：向后目标一律用侧身大弧线绕过去（carving turn）。
  // 逃跑不受此限 —— 逃跑目标在远处边缘且前 9 帧有前冲偏置，几乎不会反向。
  if (st !== FISH_STATE.ESCAPE && spd > 0) {
    const vlen = Math.hypot(k.vel.x, k.vel.y)
    if (vlen > 0.4) {
      const vxu = k.vel.x / vlen
      const vyu = k.vel.y / vlen
      const dot = Math.max(-1, Math.min(1, dx * vxu + dy * vyu))
      const COS_MAX = Math.cos(1.95) // ≈112°
      if (dot < COS_MAX) {
        const ang = Math.acos(dot)
        const sgn = vxu * dy - vyu * dx >= 0 ? 1 : -1 // 绕哪侧绕（短弧）
        const rot = sgn * (1.95 - ang)
        const cs2 = Math.cos(rot)
        const sn2 = Math.sin(rot)
        const nx2 = dx * cs2 - dy * sn2
        const ny2 = dx * sn2 + dy * cs2
        dx = nx2
        dy = ny2
      }
    }
  }
  k.wish.x = dx * spd
  k.wish.y = dy * spd
}

/**
 * motion 组件逐帧更新：状态已由 state 组件推进。
 *   1. 逃跑帧保持高压（panic 顶住），否则自然衰减 —— panic 同时驱动渲染层摆幅
 *   2. 合成 wish（下一步目标向量）
 *   3. seek 加速度 = (wish − vel) × SEEK_GAIN，按状态钳制力上限
 *   4. 积分 + 掉头限幅 + 速度上限
 *   5. 游速 → 摆频/摆幅的平滑映射（speedNorm/beat），推进 swimPhase
 */
function updateMotion(k) {
  const st = k.fs.name
  // 受惊要「立刻」受惊：原 0.05/帧需 20 帧 ≈333ms 才满档，爆发速度翻倍后
  // 尾巴还在慢慢升档，观感就是「冲出去了但没在慌」。0.15 → 约 7 帧 ≈117ms。
  if (st === FISH_STATE.ESCAPE) k.panic = Math.min(1, k.panic + 0.15)
  else {
    k.panic *= 0.93
    if (k.panic < 0.01) k.panic = 0
  }
  computeWish(k)
  const cap = st === FISH_STATE.ESCAPE ? FORCE_ESCAPE : st === FISH_STATE.AVOID ? FORCE_AVOID : FORCE_NORMAL
  let ax = (k.wish.x - k.vel.x) * SEEK_GAIN
  let ay = (k.wish.y - k.vel.y) * SEEK_GAIN
  const am = Math.hypot(ax, ay)
  if (am > cap) {
    ax = (ax / am) * cap
    ay = (ay / am) * cap
  }
  k.acc.x = ax + rnd(-0.03, 0.03)
  k.acc.y = ay + rnd(-0.03, 0.03)
  // 积分（顺序与旧版一致：先位移后加速，再由 clampHeading 兜底航向）
  k.pos.x += k.vel.x
  k.pos.y += k.vel.y
  k.vel.x += k.acc.x
  k.vel.y += k.acc.y
  clampHeading(k)
  // AVOID 上限同步到爆发倍率（否则 wish×3 会被 1+panic 档的 capV 压在 ~7，弹不出去）
  const capV =
    st === FISH_STATE.ESCAPE
      ? k.maxSpeed * ESCAPE_SPEED
      : st === FISH_STATE.AVOID
        ? k.maxSpeed * 1.7 * AVOID_BURST
        : k.maxSpeed * (1 + k.panic * 1.1)
  k.vel = limit(k.vel, capV)
  // 游速 → 摆频/摆幅（平滑，避免加速瞬间尾巴突变）
  const sp = Math.hypot(k.vel.x, k.vel.y)
  // 摆频驱动不再在巡航速度处饱和：旧式 Math.min(1, speedNorm) 让超过巡航后
  // 摆频完全不涨（逃跑 7× 巡航却还按巡航频率摆 = 「速度与动作不匹配」）。
  // 改用亚线性幂律，高速继续涨但不爆到发抖。
  const spN = Math.min(BEAT_SPEED_CAP, sp / Math.max(0.1, k.cruise))
  k.speedNorm += (spN - k.speedNorm) * SPEED_EASE
  const beatT = (0.35 + 0.65 * Math.pow(Math.max(0, k.speedNorm), BEAT_SPEED_EXP)) * (1 + 0.6 * k.panic)
  k.beat += (beatT - k.beat) * SPEED_EASE
  k.swimPhase += WAVE_SPEED * k.beat * (1 + 0.5 * k.panic)
}

/** body 组件：头部轨迹入队（复用最老点）+ 等弧长重采样 */
function updateBody(k) {
  const recycled = k.trail.pop()
  recycled.x = k.pos.x
  recycled.y = k.pos.y
  k.trail.unshift(recycled)
  // 身体点由轨迹按固定弧长重采样而来，不再直接取每帧位置
  resampleBody(k)
}

// 逐帧驱动整条鱼：按组件注册顺序（state → motion → body → skeleton）更新。
// 单独拔掉某个组件即去掉对应子系统（见 koiComponent），渲染层不感知。
function updateKoi(k) {
  updateComponents(k)
}
