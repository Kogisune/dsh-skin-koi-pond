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
 *   - 鳍动效相位（sk.flap / sk.spread）与体波同频、随 k.beat / k.panic 调幅：
 *     胸鳍同拍划水，尾鳍相对尾柄滞后一个 power stroke 相位，怠速几乎不摆
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
//   HEAD_FRAC + DORSAL_FRAC ≤ t ≤ 1         → 10°→34° 下腹/尾柄（灵活甩尾）
// 尾端 24°→34°：24° 是「常态游动」的解剖合理值，但它同时把 C 形弯曲波的脉冲**削平**
// 了（A/B 实测：加弯曲波前后 max 都卡在 24.0°，急转帧内单关节 p50 反而从 14.2° 掉到
// 12.2° —— 多出来的弯曲帧是浅的，深不下去）。C-start 时尾柄相对头部的偏折远超
// 常态，故放开尾段上限让 C 形能真的弯出来。巡航时 bend≈0、关节角 p50 仅 3°，
// 该上限基本不参与，不会把常态游动变软。
function jointCapRad(t) {
  if (t < HEAD_FRAC) return 0
  if (t < HEAD_FRAC + DORSAL_FRAC) {
    const u = (t - HEAD_FRAC) / DORSAL_FRAC
    return ((5 + (10 - 5) * u) * Math.PI) / 180
  }
  const u = (t - HEAD_FRAC - DORSAL_FRAC) / (1 - HEAD_FRAC - DORSAL_FRAC)
  return ((10 + (34 - 10) * u) * Math.PI) / 180
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
const WAVE_SPAN = 4.5 // 整条鱼的头→尾相位跨度（弧度；λ = 2π/4.5 ≈ 1.4 体长 → 身上承载 ~0.7 波长）
// WAVE_SPAN 2.8 → 4.5（用户目测「尾巴摆动不自然」排查定稿）：
//   旧值身上只有 0.45 个波长 → 身体是「刚性半弧左右摆」（船桨感）而非「波在身上跑」，
//   这是尾巴僵硬的直接来源；同时相速度 c = (0.22/2.8)×L ≈ 2.4 体长/秒，
//   c/U ≈ 2.7（2.1~4.9），波一闪而过看不见传播。
//   4.5 后：身上 0.7 波长（subcarangiform 的 S 形可见）、c ≈ 1.47 体长/秒，
//   c/U ≈ 1.7（目标区间 1.1~1.7 上沿）；频率不变（0.22 rad/帧 ≈ 1.05Hz，真实锦鲤巡航 1~2Hz）。
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

// ---- CPG 弯曲驱动（bend 链，阶段 2：C 形弯曲波，与游速解耦）----
// 为什么必须主动注入弯曲：身体形状此前**完全**来自头部轨迹历史，而体长 ≈ 44 帧的
// 行程（115px / 2.6px每帧）。头部一开始转向，要游满一整个身位身体才整体呈现弧度 ——
// 在这 44 帧里身体大部分仍是转向前的直段。这就是「整条鱼以头部为中心缓慢旋转」的
// 真正机制：**不是转得慢，是身体在等轨迹填充**。所以单靠提高转向速率（B）只会让头
// 甩得更快、身体更跟不上，必须让身体主动弯。
//
// drive 取「头端曲率的**变化量**」而非曲率本身：稳态巡航转弯时曲率恒定 → drive=0 →
// bend 衰减到 0，身体弧度仍由轨迹场提供（与改前一致，无回归、不重复计入同一份曲率）；
// 只有**转向发起**的瞬间才有脉冲。这正是 C-turn / bend-and-coast 的波形。
//
// 传播用「固定关节数/帧」而非原脚手架的 rad/帧：速率受限扩散（bend[i] 追 bend[i−1]）
// 的波前速度恒为 1 关节/帧、与 BEND_PROP_RATE 无关 —— 35 个关节要 35 帧 ≈0.58s 才
// 传到尾，对 67ms 的闪避来说波还没到尾、动作就结束了，且该参数完全不可调。
// 改成沿链取值位移（joints/帧）后，传播时间 = 关节数 / 速度，直接可控。
const BEND_INJECT_GAIN = 0.4 // 弯曲偏置向 drive 信号（头端曲率变化量）的收敛增益
const BEND_MAX = 0.42 // 弯曲偏置单关节上限（rad ≈ 24°，与尾端 cap 同量级）
const BEND_PROP_SPEED = 3.0 // 传播速度（关节/帧，恒定 —— 波速与游速无关）
// 总弯曲量 ≈ 脉宽(关节数) × 幅值 = 驱动持续帧数 × BEND_PROP_SPEED × BEND_MAX。
// 当前组合：2 帧驱动 × 3 关节/帧 × 0.42 ≈ 2.5 rad ≈ 145° —— 一个明显的 C。
// 想更夸张就调大 BEND_MAX 或 BEND_PROP_SPEED；想让波扫得更慢就调小后者。

// ---- CPG 行波（几何化）----
// 真实鱼中线横向位移 y(x,t) = A(x)·sin(kx − ωt)，A(x) = c1·x + c2·x²（头稳尾增）。
// 用「中线相对轨迹方向的倾斜角」等效驱动脊柱：tilt(t) = A_ang·t²·sin(φ0 − t·WAVE_SPAN)。
// 幅值随 beat/panic 调制（保留原渲染层的调制公式）：怠速近停不摆、爆发大摆高频。
//
// A1（2026-11-12）：0.156 → 0.36。原值由「旧渲染层位移 A=0.32·baseSize」反推，但那是
// *位移幅值*，几何化后 tilt 是 *角度场*，沿体积分会被 0.7 波长的正负相位大幅抵消 ——
// scripts/motiondiag.mjs 相位锁定实测尾端法向摆幅峰峰仅 4.00px = **4.4% 体长**
// （真实鲤科巡航 10~20%），同 seed 相隔半个摆尾周期的两帧几乎看不出差别。
// 内存变体 A/B（路径层完全不变）：0.156→4.4%、0.22→6.1%、0.30→8.3%、0.45→12.3%，线性。
// 取 0.36 ≈ 10% 体长，落在真实区间下沿，不取 0.45 以免 30fps 下大摆幅走样。
const WAVE_TILT_AMP = 0.36
// 尾鳍 power stroke：与尾柄同频（尾端体波相位 = ph0 − WAVE_SPAN + jitter），
// 再滞后约 11% 周期。原实现把 spread 定义成 0.5 基准的「张合系数」但渲染层从未读取，
// 且频率是体波的 0.5×；胸鳍 flap 又是 0.8× —— 各部位各摆各的，没有统一相位链。
const TAIL_FIN_LAG = 0.7 // rad ≈ 3 帧 @0.22rad/帧
const TAIL_FIN_AMP = 0.16 // rad ≈ ±9°（随 beat/panic 调制）

// ---- A3-1：事件驱动的 C-start 弯曲脉冲（2026-11-12）----
// 用户目测「鼠标驱赶时身体弯曲不自然 + 明显整体旋转」。escapediag.mjs 实测：
// 旧 bend 链 drive=κ−prevκ 在稳态转弯恒 ≈0，逃跑时单关节脉冲仅 2.9~7.5°、cap 饱和
// 0~17%；身体的大弯曲全来自 trail 路径 + 被 panic 放大 1.9~2.3× 的正弦行波，画面是
// 「问号/钩形」而非 C 形，且弯曲**滞后航向 100~233ms**（真实鱼先弯后转）。
// 这里改为：状态边沿 NORMAL→AVOID/ESCAPE 时注入一次主动 C-bend，1 帧到位、维持、
// 回弹并带反向过冲（Stage 2 甩尾），之后交回常规行波。脉冲独立叠加到 spine 绝对朝向，
// **不写进 rel**（rel 保持纯跟随状态，不累积、不需撤销、不影响无鼠标的常态场景）。
// 外部基准：Eaton et al. 1988 / PMID 3411353，金鱼 C-start Stage1 15–40ms 绕质心转
// 30–100°、Stage2 轴向加速；30fps 单帧 33ms 表达不了渐变，只能「1 帧到位 + 数帧回弹」。
const CSTART_TOTAL = 1.35 // rad ≈ 77° 头尾相对角峰值（真实 Stage1 区间 30~100°）
const CSTART_ENV = [1, 1, 0.72, 0.35, -0.20, -0.42, -0.28, -0.12, 0] // 9 帧 ≈ 300ms
const CSTART_WAVE_FLOOR = 0.18 // C-bend 期间行波幅值压到 18%，避免正弦波与 C 形叠加成钩形
function spineTilt(t, ph0, k) {
  // A3-1：panic/beat 对行波幅值的加成降档。旧值 beat 帽 2.2、panic +0.4，
  // 逃跑时 amp 冲到 47.9°（2.32× 巡航）叠上 3.28× 摆频 = 30fps 时间走样。
  // 常态 beat≈1 / panic=0 时三项完全不变（A1 的 9.9% 体长摆幅保持）。
  const beatC = Math.min(1.6, k.beat || 1)
  const amp = WAVE_TILT_AMP * (0.45 + 0.55 * beatC) * (1 + 0.15 * (k.panic || 0))
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
  // C 形弯曲波状态：bend=当前帧弯曲偏置，bendPrev=上一帧（沿链取值用，保证真传播）
  const bend = new Float32Array(m)
  const bendPrev = new Float32Array(m)
  for (let i = 0; i < m; i++) {
    followRates[i] = followRate(nodeTs[i + 1])
    jointCaps[i] = jointCapRad(nodeTs[i + 1])
  }
  // 头段段数 = 头段节点数 - 1（头段内所有段同向 → 刚性棍）
  const headNodes = Math.max(2, Math.round(n * HEAD_FRAC))
  const headSegs = headNodes - 1
  // A3-1：C-bend 的沿体权重（头段 0、向后按 u² 增大，Σ=1 → 总弯角 = CSTART_TOTAL）。
  // 预分配成数组，运行时不 new 对象。
  const cstartWeight = new Float32Array(m)
  const cstartPulse = new Float32Array(m)
  let wsum = 0
  for (let i = 0; i < m; i++) {
    if (i < headSegs) continue
    const u = Math.max(0, (nodeTs[i + 1] - HEAD_FRAC) / (1 - HEAD_FRAC))
    cstartWeight[i] = u * u
    wsum += cstartWeight[i]
  }
  for (let i = 0; i < m; i++) cstartWeight[i] /= wsum || 1
  // 出生体态 = 沿初速方向的直线鱼（避免出生第一帧身体从 0 角甩到位）
  const a0 = Math.atan2(k.vel.y, k.vel.x)
  for (let i = 0; i < m; i++) spine[i] = a0
  return {
    bind,
    tan: [],
    wave: [],
    flap: 0,
    spread: 0,
    nodeTs,
    spine,
    rel,
    followRates,
    jointCaps,
    headSegs,
    bend,
    bendPrev,
    cstartWeight,
    cstartPulse,
    cstartT: -1, // C-bend 包络帧计数（-1 = 未激活）
    cstartSign: 1, // 弯曲侧：与转向侧相反（先弯后弹）
    prevState: 'normal', // 状态边沿检测
    prevHeadR: a0, // 上一帧航向（算转向角速度用）
    prevKappa: 0, // 上一帧头端曲率（取变化量用）
  }
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
  const m0 = Math.max(0, Math.min(m - 1, headSegs))

  // ---- A3-1：C-start 脉冲状态推进（只在状态边沿触发，稳态转弯不重复注入）----
  const st = k.fs ? k.fs.name : 'normal'
  if ((st === 'avoid' || st === 'escape') && sk.prevState === 'normal') {
    const vh0 = Math.atan2(k.vel.y, k.vel.x)
    let dir = k.fs.avoidDir
    if (!dir && k.fs.esc) {
      const ex = k.fs.esc.x - k.pos.x
      const ey = k.fs.esc.y - k.pos.y
      const el = Math.hypot(ex, ey) || 1
      dir = { x: ex / el, y: ey / el }
    }
    // 转向侧 = cross(vel, 逃离目标)；身体先向**反侧**弯成 C，回弹时顺势把头推出去。
    let cross = dir ? Math.cos(vh0) * dir.y - Math.sin(vh0) * dir.x : 0
    if (Math.abs(cross) < 0.05) cross = k.jitter >= 0 ? 1 : -1
    sk.cstartSign = cross >= 0 ? -1 : 1
    sk.cstartT = 0
  }
  sk.prevState = st
  let cstartEnv = 0
  let waveScale = 1
  if (sk.cstartT >= 0) {
    const t = sk.cstartT
    if (t >= CSTART_ENV.length) sk.cstartT = -1
    else {
      cstartEnv = CSTART_ENV[t] * sk.cstartSign
      // C-bend 期间压低行波：正弦波与单向 C 形叠加正是「问号/钩形」的来源
      const suppress = 1 - t / (CSTART_ENV.length - 1)
      waveScale = 1 - (1 - CSTART_WAVE_FLOOR) * suppress
      sk.cstartT++
    }
  }
  const pulse = sk.cstartPulse
  pulse.fill(0)
  if (cstartEnv !== 0) {
    for (let i = m0; i < m; i++) {
      let p = cstartEnv * CSTART_TOTAL * sk.cstartWeight[i]
      const lim = caps[i] * 0.9
      if (p > lim) p = lim
      else if (p < -lim) p = -lim
      pulse[i] = p
    }
  }

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
  for (let i = 0; i < m; i++) r[i] += spineTilt(nodeTs[i], ph0, k) * waveScale
  // 2.5) C 形弯曲波（CPG 弯曲链）：头端曲率变化 → 脉冲注入第一活动关节，
  //      再以固定关节数/帧沿链向尾传播（用 bendPrev 取值，保证是「传播」而非瞬时同步）。
  const bend = sk.bend
  const bendPrev = sk.bendPrev
  const vh = Math.atan2(k.vel.y, k.vel.x)
  const headOmega = angNorm(vh - sk.prevHeadR) // 航向角速度（rad/帧）
  const vl = Math.max(0.35, Math.hypot(k.vel.x, k.vel.y))
  const seg0 = len[m0] || 1
  // 稳态每关节应弯角度 = ω × 段长 / 游速 = 段长 / 转弯半径（与游速无关的纯几何量）
  const kappa = (headOmega * seg0) / vl
  let drive = kappa - sk.prevKappa // 仅取转向「发起」的变化量
  if (drive > BEND_MAX) drive = BEND_MAX
  else if (drive < -BEND_MAX) drive = -BEND_MAX
  sk.prevHeadR = vh
  sk.prevKappa = kappa
  bendPrev.set(bend)
  bend[m0] += (drive - bend[m0]) * BEND_INJECT_GAIN
  for (let i = m0 + 1; i < m; i++) {
    const src = i - BEND_PROP_SPEED
    const i0 = Math.max(m0, Math.min(m - 1, Math.floor(src)))
    const i1 = Math.max(m0, Math.min(m - 1, i0 + 1))
    const f = Math.max(0, Math.min(1, src - i0))
    bend[i] = bendPrev[i0] + (bendPrev[i1] - bendPrev[i0]) * f
  }
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
    // 目标关节角 = 轨迹场曲率（低频、稳态）+ 行波倾斜（高频）+ C 形弯曲脉冲（瞬态）
    const relT = angNorm(r[i] - r[i - 1]) + bend[i]
    const step = Math.max(-rates[i], Math.min(rates[i], angNorm(relT - rel[i]) * FOLLOW_GAIN))
    rel[i] += step
    // 4) 形态层：关节角上限。被钳量不需残差后推 —— rel 是状态，下一帧继续追目标
    //    （多级弹簧语义，与「对整形量二次加工会放出折角」的旧坑无关：这里只动角度本身）
    if (rel[i] > caps[i]) rel[i] = caps[i]
    else if (rel[i] < -caps[i]) rel[i] = -caps[i]
    spine[i] = spine[i - 1] + rel[i]
  }
  // 4.5) A3-1：把 C-bend 脉冲按关节增量累加进脊柱绝对朝向。
  //      不写进 rel（rel 保持纯跟随状态，脉冲不累积、下帧不残留）；
  //      body 由 spine 重建，所以渲染层自然看到这次主动弯曲。
  if (cstartEnv !== 0) {
    let acc = 0
    for (let i = m0; i < m; i++) {
      acc += pulse[i]
      spine[i] += acc
    }
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
  // 4) 鳍动效相位（A1）：全部锁到体波相位 ph0，幅度随 beat/panic 调制。
  //    - 胸鳍：原 0.8× 体波（周期 1.25×），现同频同相 —— 胸鳍与身体同一拍划水。
  //    - 尾鳍 spread：改定义为「尾鳍相对尾柄切线的角度偏移」(rad)，原值是 0.5 基准的
  //      张合系数且频率 0.5× 体波、渲染层根本不读（死变量）。现与尾端体波
  //      (ph0 − WAVE_SPAN + jitter) 同频、再滞后 TAIL_FIN_LAG，形成 power stroke。
  //    注：路径层 computeWish 仍有 sin(swimPhase*0.5)*0.12 的方向偏摆（0.5×），
  //    它决定 vel/轨迹，属路径层节奏，A1 按「零路径影响」不动，留 Plan B 处理。
  const fl = 0.5 + 0.5 * Math.min(1, k.beat || 1)
  const finAmp = TAIL_FIN_AMP * fl * (1 + 0.4 * (k.panic || 0))
  sk.flap = Math.sin(ph0 + k.jitter) * 0.3 * fl + (k.panic || 0) * 0.18
  sk.spread = Math.sin(ph0 - WAVE_SPAN - TAIL_FIN_LAG + k.jitter) * finAmp
}
