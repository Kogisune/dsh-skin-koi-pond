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
const FORCE_NORMAL = 0.14
const FORCE_AVOID = 0.34
const FORCE_ESCAPE = 0.85 // 逃跑加速度上限：更快达到更高的爆发速度
// 逃跑爆发速度 = maxSpeed × 该倍率（普通巡航≈0.8×maxSpeed，逃跑约为巡航 3 倍以上）
const ESCAPE_SPEED = 2.6
// 游速平滑系数（speedNorm/beat 的帧间 lerp，让摆频加减速不过冲）
const SPEED_EASE = 0.12

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
//  - 转向角速度上限：速度方向每帧最多转 MAX_TURN，掉头变成有限半径的平滑弧线
//    （真实锦鲤转向也是弧线而非原地折返）。躲避/逃跑状态放宽上限，反应更敏捷，
//    但仍是弧线 —— 逃跑离弦而出也不是瞬间折返。
//  - 速度下限：鱼永不真正停下（巡航/逃逸都有最小前冲），轨迹始终有空间延展。
const MAX_TURN = 0.28 // 速度方向最大转向（弧度/帧 ≈ 16°/帧，180° 掉头约 11 帧）
const SPEED_FLOOR = 0.6 // 速度下限（px/帧）
const FREE_TURN_SPEED = 0.4 // 旧速低于此值视为「从静止起步」：可直接对准合加速度方向（无转向限制）
function clampHeading(k) {
  // 在 k.vel += k.acc 之后调用：若新航向相对旧航向超过状态上限则钳回（幅值保留，
  // 加速度的纵向/横向效果仍并入大小）；幅值低于 SPEED_FLOOR 时抬到下限。
  const vx = k.vel.x
  const vy = k.vel.y
  const sp = Math.hypot(vx, vy)
  const oa = Math.atan2(vy - k.acc.y, vx - k.acc.x) // 旧航向（acc 已并入，先减回）
  const os = Math.hypot(vx - k.acc.x, vy - k.acc.y) // 旧速
  const st = k.fs ? k.fs.name : FISH_STATE.NORMAL
  const turnCap = st === FISH_STATE.ESCAPE ? 0.44 : st === FISH_STATE.AVOID ? 0.36 : MAX_TURN
  const cap = os < FREE_TURN_SPEED ? Math.PI : turnCap // 静止起步不设转向限制
  let nd = Math.atan2(vy, vx)
  let diff = nd - oa
  while (diff > Math.PI) diff -= 2 * Math.PI
  while (diff < -Math.PI) diff += 2 * Math.PI
  if (diff > cap) nd = oa + cap
  else if (diff < -cap) nd = oa - cap
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
function updateWander(k) {
  const a = k.anchor
  if (a.x < 0 || a.x > W || a.y < 0 || a.y > H) rollAnchor(k)
  if (dist(k.pos, a) < a.r || ++a.t > a.life) rollAnchor(k)
}

// ---- 躲避（AVOID）期望速度 ----
// 沿用历史「预测落点 + 切向绕行」几何：朝指针预测位置的远端逃，
// 叠加一条垂直方向的切向速度让鱼绕开而不是直挺挺后退；
// panic 由逼近程度二次方给出（越近越慌）。返回期望方向(单位向量)+期望速度。
function avoidWish(k) {
  const dir = { x: 0, y: 0 }
  let speed = 0
  let panic = 0
  if (mouse.x < -999) return dir
  const px = mouse.x + mouse.vx * 4
  const py = mouse.y + mouse.vy * 4
  const d1 = dist(k.pos, mouse)
  const d2 = Math.hypot(k.pos.x - px, k.pos.y - py)
  const dd = Math.min(d1, d2)
  if (dd >= FLEE_R || dd < 0.001) return dir
  const tx = d2 < d1 ? px : mouse.x
  const ty = d2 < d1 ? py : mouse.y
  const dd2 = Math.max(0.001, Math.hypot(k.pos.x - tx, k.pos.y - ty))
  const dx = (k.pos.x - tx) / dd2
  const dy = (k.pos.y - ty) / dd2
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
  const closeness = 1 - dd / FLEE_R
  panic = closeness * closeness
  // 径向逃（rx,ry）为主、切向绕行为辅，合成方向
  const ax = rx * 2.2 + tanX * 0.9
  const ay = ry * 2.2 + tanY * 0.9
  const al = Math.hypot(ax, ay) || 1
  dir.x = ax / al
  dir.y = ay / al
  // 期望速度：越近越快（巡航 ~1.5 倍 → 接近上限 ~1.7×maxSpeed），保证「躲得开」
  speed = k.maxSpeed * (0.85 + closeness * 0.85)
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
    // 期望方向 = 合力方向；轻幅正弦偏摆让游迹更活
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
    const sw = Math.sin(k.swimPhase * 0.5 + k.jitter) * 0.35
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
  if (st === FISH_STATE.ESCAPE) k.panic = Math.min(1, k.panic + 0.05)
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
  const capV = st === FISH_STATE.ESCAPE ? k.maxSpeed * ESCAPE_SPEED : k.maxSpeed * (1 + k.panic * 1.1)
  k.vel = limit(k.vel, capV)
  // 游速 → 摆频/摆幅（平滑，避免加速瞬间尾巴突变）
  const sp = Math.hypot(k.vel.x, k.vel.y)
  const spN = Math.min(1.5, sp / Math.max(0.1, k.cruise))
  k.speedNorm += (spN - k.speedNorm) * SPEED_EASE
  const beatT = (0.35 + 0.65 * Math.min(1, k.speedNorm)) * (1 + 0.6 * k.panic)
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
