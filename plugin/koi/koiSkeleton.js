/**
 * koi-skeleton · 轻量鱼骨骼系统（共享作用域片段）
 * 依赖：koiMath（lerp）、koiPond 的状态（frameCount，运行时解析）。
 *
 * 架构：路径层与体态层分离（CPG 体态层，学术依据见 updateSpine 上方注释）。
 *   - 路径层（koiFish 运动学+轨迹）：只决定头部位置/朝向，并经 resampleBody 提供
 *     「目标朝向场」（轨迹弧长重采样点列的段方向）—— 它不是身体形状，只是体态的参考
 *   - 体态层（本文件）：脊柱是**持久状态**（sk.rel[] 关节角 + sk.spine[] 绝对朝向），
 *     在相对角域逐帧向目标场收敛：跟随层带角速度上限（惯性——弯曲沿脊柱传播，
 *     尾梢滞后约 0.5s），形态层钳关节角（关节活动范围），行波倾斜场 spineTilt
 *     几何化进脊柱（中线 = 转弯弯曲 + 推进行波，同一套几何），然后保长重建 k.body
 *     （段长 = nodeT 三段密度分布的解析值，体长与速度严格无关）
 *   - 渲染层行波位移停用（sk.wave 恒 0）—— 摆动已在脊柱几何里，叠加会双重摆动
 *   - 鳍动效相位（sk.flap / sk.spread）随 k.swimPhase / k.beat / k.panic 调制：
 *     逃跑大摆幅高频甩尾，怠速几乎不摆
 *   - 部位绑定 = BIND 表（name → 弧长位置 t），updateSkeleton 写入 sk.bind[name]
 *
 * 渲染层用法：
 *   - 身体段：直接用 body[i]（已含行波几何），wave 偏移为 0
 *   - 胸鳍：sk.bind.pec（位置/切线/半宽）+ sk.flap
 *   - 背鳍：sk.bind.dorsal0 ~ sk.bind.dorsal1 的节点区间
 *   - 尾鳍：sk.bind.tail + sk.spread
 */
// ---- 体型轮廓 ----
// 锦鲤俯视轮廓：吻部圆钝 → 头冠 → 鳃盖后最宽 → 中段微收 → 尾柄收窄。
// 关键点：[归一化位置 t, 直径系数]（相对 baseSize），smoothstep 插值。
// 替代原先「头部只占 1/6、鳃盖后即最宽、随后线性缩到 0」的蝌蚪形：
// 头部现在占满前 1/4，最宽处移到体长 1/4 处（鳃盖后），尾端保留 0.35 不再尖。
// 关键：所有 t 坐标都以「弧长归一化位置」（0=吻部、1=尾段末端）为基准，
// 节点分布不均匀后，索引 i 的「弧长 t」由 nodeT(i, n) 计算，不再等价于 i/(n-1)。
const BODY_PROFILE = [
  [0, 0.75], // 吻部（圆钝）
  [0.1, 0.95], // 头冠
  [0.25, 1.15], // 鳃盖后（最宽）
  [0.5, 1.0], // 中段
  [0.8, 0.45], // 尾柄
  [1, 0.28], // 尾柄末（不尖，保留尾鳍根厚度）
]
function bodyProfile(t) {
  for (let i = 0; i < BODY_PROFILE.length - 1; i++) {
    const [t0, v0] = BODY_PROFILE[i]
    const [t1, v1] = BODY_PROFILE[i + 1]
    if (t <= t1) {
      const u = (t - t0) / (t1 - t0)
      const s = u * u * (3 - 2 * u) // smoothstep
      return v0 + (v1 - v0) * s
    }
  }
  return BODY_PROFILE[BODY_PROFILE.length - 1][1]
}

function bodySize(index, k) {
  // 体型轮廓按「弧长 t」取值 —— 节点不均匀分布后，索引 i 的弧长位置由 sk.nodeTs[i] 给出
  const t = k.sk && k.sk.nodeTs ? k.sk.nodeTs[index] : index / (k.bodyLength - 1)
  return k.baseSize * bodyProfile(t)
}
function shadowBodySize(index, k) {
  return bodySize(index, k) * 0.92 // 影子略小于本体
}
function tailSize(index, k) {
  return bodySize(index, k) * 0.95 // 尾腹色底层略收，避免边缘露出
}

// ---- 鱼骨骼 ----
// 部位绑定表：name → 归一化位置 t（弧长坐标，0=吻部 1=尾段末端）。
// 改部位位置只改这张表；节点查找走 sk.nodeTs 的「最近索引」。
const BIND = {
  head: 0.05, // 头部锚点（吻部后，供眼睛/头部装饰）
  pec: 0.15, // 胸鳍根（鳃盖后）
  dorsal0: 0.32, // 背鳍起点
  dorsal1: 0.55, // 背鳍终点
  tail: 1.0, // 尾鳍根
}

// ---- 节点分布（按真实鱼骨骼）：头稀疏 + 上腩中 + 下腹密 ----
// 头部刚性段：节点少 + 关节转角上限 = 0°（鱼头没法弯折）
// 上腩大刺段：节点中等 + 关节转角上限小（活动幅度小、大刺粗硬）
// 下腹/尾柄段：节点密集 + 关节转角上限大（小刺细密、灵活甩尾）
const HEAD_FRAC = 0.10 // 头部刚性段占体长比例
const DORSAL_FRAC = 0.40 // 上腩段占体长比例
// 尾部段占 1 - HEAD_FRAC - DORSAL_FRAC = 0.50

// 节点 i（i ∈ [0, n)）的弧长归一化位置 t
// 关键：相邻区段不共端点，否则上腩首节点会与头部末节点 t 重合，resampleBody
// 给出两个重叠位置 → 绘制两 ellipse 重叠 → 段长 0 → atan2 无意义（jointdiag 假阳性）。
// 头段末点 = HEAD_FRAC（i=headNodes-1）；上腩首点 = HEAD_FRAC + (1/dorsalNodes)*DORSAL_FRAC，
// 起点偏移 (1/dorsalNodes)*DORSAL_FRAC 防与头段末点重叠；下腹同理。
function nodeT(i, n) {
  const headNodes = Math.max(2, Math.round(n * HEAD_FRAC))
  const dorsalNodes = Math.max(2, Math.round(n * DORSAL_FRAC))
  const tailStart = headNodes + dorsalNodes
  if (i < headNodes) {
    // 头段：均匀铺在 [0, HEAD_FRAC]
    return (i / (headNodes - 1)) * HEAD_FRAC
  } else if (i < tailStart) {
    // 上腩段：均匀铺在 [HEAD_FRAC + Δ, HEAD_FRAC + DORSAL_FRAC]，Δ 防与头段重叠
    const j = i - headNodes // 0..dorsalNodes-1
    return HEAD_FRAC + ((j + 1) / dorsalNodes) * DORSAL_FRAC
  } else {
    // 下腹/尾柄段：均匀铺在 [HEAD_FRAC + DORSAL_FRAC + Δ, 1]
    const j = i - tailStart
    const tailNodes = n - tailStart
    return HEAD_FRAC + DORSAL_FRAC + ((j + 1) / tailNodes) * (1 - HEAD_FRAC - DORSAL_FRAC)
  }
}

// 按弧长 t（0~1）算关节转角上限（弧度）：
//   t < HEAD_FRAC                          → 0°     头部刚性（不能弯折）
//   HEAD_FRAC ≤ t < HEAD_FRAC + DORSAL_FRAC → 5°→10° 上腩大刺（活动幅度小）
//   HEAD_FRAC + DORSAL_FRAC ≤ t ≤ 1         → 10°→24° 下腹/尾柄（灵活甩尾）
function jointCapRad(t) {
  if (t < HEAD_FRAC) return 0
  if (t < HEAD_FRAC + DORSAL_FRAC) {
    const u = (t - HEAD_FRAC) / DORSAL_FRAC
    return ((5 + (10 - 5) * u) * Math.PI) / 180
  }
  const u = (t - HEAD_FRAC - DORSAL_FRAC) / (1 - HEAD_FRAC - DORSAL_FRAC)
  return ((10 + (24 - 10) * u) * Math.PI) / 180
}

// 找最接近给定弧长 t 的节点索引（BIND 部位定位）
function nearestIndex(t, nodeTs) {
  const n = nodeTs.length
  if (t <= 0) return 0
  if (t >= 1) return n - 1
  let lo = 0
  let hi = n - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (nodeTs[mid] < t) lo = mid + 1
    else hi = mid
  }
  if (lo > 0 && Math.abs(nodeTs[lo - 1] - t) < Math.abs(nodeTs[lo] - t)) return lo - 1
  return lo
}

// 行波 undulation：沿身体传播的横向摆动。t 越大摆幅越大（尾摆最明显），
// 头部稳定 —— 这是锦鲤游动「头稳尾摆」的关键姿态。
// 相位用「归一化位置 × WAVE_SPAN」而非「弧度/段 × 段号」：
// 鱼的段数 ∝ 体长，若按弧度/段，大鱼身上会挤进 2+ 个完整波（S 形蛇游），
// 小鱼却不足一个波——观感随体型漂移。归一化后任何体长的鱼都只弯约半个波长，
// 尾部是平滑的单一弧度（鲤科 subcarangiform 姿态）。
const WAVE_SPAN = 2.8 // 整条鱼的头→尾相位跨度（弧度，≈ 0.45 波长）
const WAVE_SPEED = 0.22 // 时间频率（弧度/帧）→ 约 0.48s/拍 @60fps，巡航摆频 ~2Hz
// （原 WAVE_AMP 渲染摆幅常量已随行波几何化停用，等效倾斜幅值见 WAVE_TILT_AMP）

// ---- 脊柱状态（CPG 体态层，与路径层分离）----
// 架构（学术依据：Ijspeert CPG 振子链 + Lighthill 体波；锦鲤属 carangiform——
// 前体刚性、波动集中后 1/3、行波相速度 c ≈ 1.1~1.7× 游速）：
//
//   路径层（运动学+轨迹）  ──提供轨迹方向场 r[i]──▶  体态层（脊柱状态）
//   头部位置锚定（body[0]=轨迹头点）                跟随层：关节角 rel 域低通（惯性）
//                                                  形态层：相邻差分钳制（关节cap）
//                                                  行波：spineTilt 几何化（摆动进脊柱）
//                                                  重建层：由 spine 保长重建 body
//
// 关键设计（本轮 CPG 化）：
//   - 行波从「渲染层位移叠加」改为**脊柱几何本身**：中线 = 低频转弯弯曲（轨迹曲率）
//     + 高频推进行波（spineTilt 倾斜场，相位沿弧长向后传播）—— 真实鱼的身体摆动
//     就是推进本身，转弯/摆动是同一套几何。渲染层 wave 恒 0（无双重摆动）。
//   - 跟随在**相对角域**进行：rel[i] = spine[i] − spine[i−1]（关节角，状态量）。
//     rel 是被 cap 钳住的小量 → 无 atan2 wrap 跳变；目标差分 relT 由连续的
//     r/tilt 场给出 → 消除「rate>cap 拉锯」「目标场 wrap 突变」两大抖动源。
//   - 段长用解析值（nodeTs 差分 × 体长），重采样边界误差不再进入重建层。

// 跟随层参数：
const FOLLOW_GAIN = 0.3 // 比例跟随增益：每帧消除 diff 的 30%（小弯几乎无滞后感）
// 每段角速度上限（rad/帧）：头段锁定（刚性棍）、上腩 0.10→0.14、下腹 0.14→0.20。
function followRate(t) {
  if (t < HEAD_FRAC) return Infinity // 头段锁定路径朝向（刚性棍）
  if (t < HEAD_FRAC + DORSAL_FRAC) {
    const u = (t - HEAD_FRAC) / DORSAL_FRAC
    return 0.1 + (0.14 - 0.1) * u
  }
  const u = (t - HEAD_FRAC - DORSAL_FRAC) / (1 - HEAD_FRAC - DORSAL_FRAC)
  return 0.14 + (0.2 - 0.14) * u
}

// ---- CPG 弯曲驱动（bend 链，阶段 2：与游速解耦的恒定波速）----
// 掉头弯曲不再让轨迹场差分「全身同时生效」（轨迹滑窗会让弯曲扭结以头部前进速度
// 扫过全身，逃跑 ≈3.4 段/帧 → 6 帧扫完 → 尾巴同步甩到位 =「直愣愣」，实测尾滞后仅 4 帧）。
// CPG 语义：**轨迹头端曲率 × 段长**（每段应弯角度，= turnRate×段长/游速，速度无关的
// 正确稳态量）作为 drive 注入第一活动关节的弯曲偏置 bend[headSegs]，偏置沿链以
// **固定速率**向后传播 —— 弯曲波以恒定速度扫过全身，尾巴最后划弧跟上、再最后回直，
// 即真实鱼 C-turn / bend-and-coast 的波形。稳态时 bend 全身均匀 = 轨迹每段曲率，
// 巡航缓弯身体自动贴合轨迹（无需轨迹场兜底）。
const BEND_INJECT_GAIN = 0.4 // 弯曲偏置向 drive 信号（头端轨迹曲率）的收敛增益
const BEND_MAX = 0.42 // 弯曲偏置单关节上限（rad ≈ 24°，与尾端 cap 同量级）
const BEND_PROP_RATE = 0.18 // 偏置沿脊柱传播速率（rad/帧，恒定 —— 波速与游速无关）

// ---- CPG 行波（几何化）----
// 真实鱼中线横向位移 y(x,t) = A(x)·sin(kx − ωt)，A(x) = c1·x + c2·x²（头稳尾增）。
// 用「中线相对轨迹方向的倾斜角」等效驱动脊柱：tilt(t) = A_ang·t²·sin(φ0 − t·WAVE_SPAN)。
// A_ang 由原渲染位移 A = 0.32·baseSize 反推：位移斜率 A·k = A·WAVE_SPAN/L_body
// = 0.32·baseSize × 2.8 / (5.75·baseSize) ≈ 0.156 rad —— 视觉摆幅与几何化前等价。
// 幅值随 beat/panic 调制（保留原渲染层的调制公式）：怠速近停不摆、爆发大摆高频。
const WAVE_TILT_AMP = 0.156
function spineTilt(t, ph0, k) {
  const amp = WAVE_TILT_AMP * (0.45 + 0.55 * Math.min(1.35, k.beat || 1)) * (1 + 0.4 * (k.panic || 0))
  return Math.sin(ph0 - t * WAVE_SPAN + k.jitter) * amp * t * t
}

/** 创建骨骼（每条鱼一份；bind 对象复用，update 只改写字段，避免每帧分配）
 *  同时预算（全部按弧长 t，只算一次）：
 *   - nodeTs[i]       节点 i 的弧长归一化位置 t（0=吻部、1=尾段末端）
 *   - spine[i]        每段持久绝对朝向（由 rel 链式累加重建）
 *   - rel[i]          每关节持久相对角（CPG 关节状态：转弯弯曲 + 行波倾斜的载体）
 *   - followRates[i]  跟随层角速度上限（头锁定 / 上腩 0.10-0.14 / 下腹 0.14-0.20 rad/帧）
 *   - jointCaps[i]    形态层相邻差分上限（弧度）：头 0° / 上腩 5-10° / 下腹 10-24°
 *   - headSegs        头段段数（这些段 rel=0，整根锁定为轨迹方向）
 */
function makeSkeleton(k) {
  const bind = {}
  for (const name in BIND) {
    bind[name] = { t: BIND[name], i: 0, x: 0, y: 0, dx: 1, dy: 0, nx: 0, ny: 1, half: 0 }
  }
  const n = k.bodyLength
  const nodeTs = new Float32Array(n)
  for (let i = 0; i < n; i++) nodeTs[i] = nodeT(i, n)
  const m = Math.max(0, n - 1)
  const spine = new Float32Array(m)
  const rel = new Float32Array(m) // 关节相对角（CPG 关节状态：弯曲/摆动的载体）
  const followRates = new Float32Array(m)
  const jointCaps = new Float32Array(m)
  for (let i = 0; i < m; i++) {
    followRates[i] = followRate(nodeTs[i + 1])
    jointCaps[i] = jointCapRad(nodeTs[i + 1])
  }
  // 头段段数 = 头段节点数 - 1（头段内所有段同向 → 刚性棍）
  const headNodes = Math.max(2, Math.round(n * HEAD_FRAC))
  const headSegs = headNodes - 1
  // 出生体态 = 沿初速方向的直线鱼（避免出生第一帧身体从 0 角甩到位）
  const a0 = Math.atan2(k.vel.y, k.vel.x)
  for (let i = 0; i < m; i++) spine[i] = a0
  return { bind, tan: [], wave: [], flap: 0, spread: 0, nodeTs, spine, rel, followRates, jointCaps, headSegs }
}

// 归一化角度到 [-π, π]
function angNorm(a) {
  while (a > Math.PI) a -= 2 * Math.PI
  while (a < -Math.PI) a += 2 * Math.PI
  return a
}

// 复用缓冲（每帧避免分配；单线程逐鱼更新，安全）
const spineLenBuf = []
const spineDirBuf = []

function updateSpine(k) {
  const sk = k.sk
  const pts = k.body // body[0] = 路径锚定头点；目标场读完后被重建结果覆写
  const n = pts.length
  if (n < 6 || !sk) return
  const m = n - 1
  const spine = sk.spine
  const rel = sk.rel
  const rates = sk.followRates
  const caps = sk.jointCaps
  const headSegs = sk.headSegs
  const nodeTs = sk.nodeTs
  const len = spineLenBuf
  const r = spineDirBuf
  // 1) 目标场：轨迹段方向 + 解析段长。
  //    - 段长用 nodeTs 差分 × 体长（恒定）：重采样边界误差不进入重建层，严格保长
  //    - 近零段（重采样重叠）方向继承上一段，不产生 atan2(0,0) 假折角目标
  const totalArc = bodyArc(k)
  let prevR = spine[0]
  for (let i = 0; i < m; i++) {
    const dx = pts[i + 1].x - pts[i].x
    const dy = pts[i + 1].y - pts[i].y
    len[i] = (nodeTs[i + 1] - nodeTs[i]) * totalArc
    const d = Math.hypot(dx, dy)
    if (d > 1e-4) prevR = Math.atan2(dy, dx)
    r[i] = prevR
  }
  // 2) CPG 行波几何化：目标朝向 = 轨迹方向 + 倾斜场（相位沿弧长向后传播）。
  //    中线 = 低频转弯弯曲（轨迹曲率）+ 高频推进行波（tilt），同一套几何。
  const ph0 = k.swimPhase || frameCount
  for (let i = 0; i < m; i++) r[i] += spineTilt(nodeTs[i], ph0, k)
  // 3) 跟随层（相对角域）：关节角 rel[i] 向目标差分 relT = angNorm(r[i]−r[i−1]) 低通收敛。
  //    rel 被 cap 钳为小量 → 无 wrap 跳变；r/tilt 连续 → relT 连续 → 无拉锯抖动。
  //    头段（i < headSegs）rel=0：刚性棍沿轨迹方向（tilt 头部 t²≈0，天然对齐）。
  spine[0] = r[0]
  for (let i = 1; i < m; i++) {
    if (i < headSegs) {
      rel[i] = 0
      spine[i] = spine[i - 1]
      continue
    }
    const relT = angNorm(r[i] - r[i - 1])
    const step = Math.max(-rates[i], Math.min(rates[i], angNorm(relT - rel[i]) * FOLLOW_GAIN))
    rel[i] += step
    // 4) 形态层：关节角上限。被钳量不需残差后推 —— rel 是状态，下一帧继续追目标
    //    （多级弹簧语义，与「对整形量二次加工会放出折角」的旧坑无关：这里只动角度本身）
    if (rel[i] > caps[i]) rel[i] = caps[i]
    else if (rel[i] < -caps[i]) rel[i] = -caps[i]
    spine[i] = spine[i - 1] + rel[i]
  }
  // 5) 重建（保长）：body[0] = 路径头点，body[i+1] = body[i] + len[i]·dir(spine[i])
  let px = pts[0].x
  let py = pts[0].y
  for (let i = 0; i < m; i++) {
    const cs = Math.cos(spine[i])
    const sn = Math.sin(spine[i])
    pts[i + 1].x = px + cs * len[i]
    pts[i + 1].y = py + sn * len[i]
    px = pts[i + 1].x
    py = pts[i + 1].y
  }
}

/**
 * 每帧刷新骨骼（在 motion 之后调用）：
 *   0. 脊柱状态推进（体态层）：跟随目标场收敛 + 关节 cap 钳制 + 由状态重建 body
 *   1. 全节点切线/法线（tan[]）
 *   2. 行波偏移（wave[]）—— 频率/振幅由 k.swimPhase/k.beat/k.panic 驱动
 *   3. 部位世界定位（bind[name]，含行波偏移）
 *   4. 鳍动效相位（flap 胸鳍扇动 / spread 尾鳍张合，随游速与恐慌变化）
 */
function updateSkeleton(sk, k, frameCount) {
  // 0) 体态层：脊柱状态收敛（有惯性、有记忆），掉头的弯曲沿脊柱向后传播
  updateSpine(k)
  const n = k.body.length
  const body = k.body
  // 1) 节点切线/法线（对象复用，避免每帧分配）
  sk.tan.length = n
  for (let i = 0; i < n; i++) {
    const a = body[Math.max(0, i - 1)]
    const b = body[Math.min(n - 1, i + 1)]
    let dx = a.x - b.x // 指向吻部
    let dy = a.y - b.y
    const l = Math.hypot(dx, dy) || 1
    dx /= l
    dy /= l
    let tn = sk.tan[i]
    if (!tn) {
      tn = { dx: 0, dy: 0, nx: 0, ny: 0 }
      sk.tan[i] = tn
    }
    tn.dx = dx
    tn.dy = dy
    tn.nx = -dy
    tn.ny = dx
  }
  // 2) 行波 undulation —— CPG 几何化后摆动由脊柱本身承担（updateSpine 里的
  //    spineTilt：中线 = 低频转弯弯曲 + 高频推进行波，同一套几何）。
  //    渲染层位移叠加停用（恒 0）：再叠加会双重摆动。wave[] 保留结构，
  //    bind 定位与渲染层 bodyPoint 继续读它（读到的偏移为 0）。
  sk.wave.length = n
  for (let i = 0; i < n; i++) sk.wave[i] = 0
  // 3) 部位世界定位（行波偏移已几何化进脊柱，bind 直接落在身体点上）
  //    —— BIND 给的是弧长 t，用最近节点索引定位
  const nodeTs = sk.nodeTs
  const ph0 = k.swimPhase || frameCount // 鳍动效相位（无 motion 组件时退回全局相位）
  for (const name in BIND) {
    const bd = sk.bind[name]
    const i = nearestIndex(bd.t, nodeTs)
    bd.i = i
    const bn = body[i]
    const tn = sk.tan[i]
    bd.x = bn.x + tn.nx * sk.wave[i]
    bd.y = bn.y + tn.ny * sk.wave[i]
    bd.dx = tn.dx
    bd.dy = tn.dy
    bd.nx = tn.nx
    bd.ny = tn.ny
    bd.half = bodySize(i, k) * 0.5
  }
  // 4) 鳍动效相位：随 k.swimPhase 摆动，游速高（beat 大）摆得快，恐慌时更用力。
  //    频率基准对齐旧观感（巡航 ≈ 0.16~0.2 rad/帧），幅度随 beat 略涨。
  const fl = 0.5 + 0.5 * Math.min(1, k.beat || 1)
  sk.flap = Math.sin(ph0 * 0.8 + k.jitter) * 0.3 * fl + (k.panic || 0) * 0.18
  sk.spread = 0.5 + Math.sin(ph0 * 0.5 + k.jitter) * 0.12 * fl + (k.panic || 0) * 0.12
}
