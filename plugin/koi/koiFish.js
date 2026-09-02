/**
 * koi-fish · 鱼生成、轨迹重采样与群游 AI（共享作用域片段）
 * 依赖：koiMath（rnd/mag/setMag/limit/dist）、koiSkeleton（makeSkeleton/updateSkeleton/
 * bodyArc 常量）、koiSchemes（scheme）、koiPond 的状态（flock/W/H/leaves/PERC/frameCount，
 * 运行时解析）。
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
    maxForce: 0.12,
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
  return k
}

function bodyArc(k) {
  return k.baseSize * BODY_ARC_RATIO
}

/**
 * 把原始轨迹（按帧采样，点距 = 瞬时速度）重采样为等弧长的身体点列。
 * 结果：体长恒定（躲闪不再拉长），段间距恒定（不再随速度露出串珠），
 * 且每条鱼的重叠层数一致，整体浓淡不随速度漂移。
 * 轨迹不够长时（刚出生/极慢速）尾部收敛到最老的那个轨迹点。
 */
function resampleBody(k) {
  const step = bodyArc(k) / k.bodyLength
  const tr = k.trail
  const last = tr.length - 1
  let seg = 0
  let walked = 0 // 已走过的弧长（到 tr[seg] 为止）
  for (let i = 0; i < k.bodyLength; i++) {
    const target = step * i
    let px = tr[last].x
    let py = tr[last].y
    while (seg < last) {
      const ax = tr[seg].x
      const ay = tr[seg].y
      const bx = tr[seg + 1].x
      const by = tr[seg + 1].y
      const d = Math.hypot(bx - ax, by - ay)
      if (walked + d >= target) {
        const t = d < 1e-6 ? 0 : (target - walked) / d
        px = ax + (bx - ax) * t
        py = ay + (by - ay) * t
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

function steer(k, type) {
  let sx = 0
  let sy = 0
  let total = 0
  for (let j = 0; j < flock.length; j++) {
    const o = flock[j]
    if (o === k || !o.active) continue
    const d = dist(k.pos, o.pos)
    if (d < PERC) {
      if (type === 'align') {
        sx += o.vel.x
        sy += o.vel.y
      } else if (type === 'cohesion') {
        sx += o.pos.x
        sy += o.pos.y
      } else if (d > 0.001) {
        sx += (k.pos.x - o.pos.x) / d
        sy += (k.pos.y - o.pos.y) / d
      }
      total++
    }
  }
  let s = { x: sx, y: sy }
  if (total > 0) {
    s.x /= total
    s.y /= total
    if (type === 'cohesion') {
      s.x -= k.pos.x
      s.y -= k.pos.y
    }
    s = setMag(s, k.maxSpeed)
    s.x -= k.vel.x
    s.y -= k.vel.y
    s = limit(s, k.maxForce)
  }
  return s
}

const FLEE_R = 150
function flee(k) {
  let s = { x: 0, y: 0 }
  if (mouse.x < -999) return s
  const px = mouse.x + mouse.vx * 4
  const py = mouse.y + mouse.vy * 4
  const d1 = dist(k.pos, mouse)
  const d2 = Math.hypot(k.pos.x - px, k.pos.y - py)
  const dd = Math.min(d1, d2)
  if (dd >= FLEE_R || dd < 0.001) return s
  const tx = d2 < d1 ? px : mouse.x
  const ty = d2 < d1 ? py : mouse.y
  const dd2 = Math.max(0.001, Math.hypot(k.pos.x - tx, k.pos.y - ty))
  const dx = (k.pos.x - tx) / dd2
  const dy = (k.pos.y - ty) / dd2
  const cj = Math.cos(k.jitter)
  const sj = Math.sin(k.jitter)
  const rx = dx * cj - dy * sj
  const ry = dx * sj + dy * cj
  const cross = mouse.vx * dy - mouse.vy * dx
  const sign = cross >= 0 ? 1 : -1
  const tanX = -dy * sign
  const tanY = dx * sign
  const closeness = 1 - dd / FLEE_R
  const panic = closeness * closeness
  const desX = rx * k.maxSpeed * 2.2 + tanX * k.maxSpeed * 0.9
  const desY = ry * k.maxSpeed * 2.2 + tanY * k.maxSpeed * 0.9
  s.x = desX - k.vel.x
  s.y = desY - k.vel.y
  s = limit(s, k.maxForce * (2 + panic * 6))
  if (panic > k.panic) k.panic = panic
  return s
}

// 环绕时整条轨迹同步平移，否则身体会在屏幕两侧被拉成断开的两截
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
  }
}
function flockStep(k) {
  k.acc.x = 0
  k.acc.y = 0
  k.panic *= 0.93
  if (k.panic < 0.01) k.panic = 0
  const a = steer(k, 'align')
  const c = steer(k, 'cohesion')
  const sp = steer(k, 'separation')
  const av = flee(k)
  const w = 1 - 0.85 * Math.min(1, k.panic)
  k.acc.x += av.x + (sp.x * 1.1 + a.x * 1.1 + c.x * 0.8) * w
  k.acc.y += av.y + (sp.y * 1.1 + a.y * 1.1 + c.y * 0.8) * w
  k.acc.x += rnd(-0.05, 0.05)
  k.acc.y += rnd(-0.05, 0.05)
}
function updateKoi(k) {
  k.pos.x += k.vel.x
  k.pos.y += k.vel.y
  k.vel.x += k.acc.x
  k.vel.y += k.acc.y
  k.vel = limit(k.vel, k.maxSpeed * (1 + k.panic * 1.1))
  // 头部入队：把最老的那一点搬到队首复用，容量恒定且每帧零分配。
  // trail[0] 是最新点，trail[末尾] 是最老点 —— resampleBody 由新到旧走弧长。
  const recycled = k.trail.pop()
  recycled.x = k.pos.x
  recycled.y = k.pos.y
  k.trail.unshift(recycled)
  // 身体点由轨迹按固定弧长重采样而来，不再直接取每帧位置
  resampleBody(k)
  // 骨骼跟随身体刷新（切线/行波动效/部位定位/鳍相位）
  updateSkeleton(k.sk, k, frameCount)
}
