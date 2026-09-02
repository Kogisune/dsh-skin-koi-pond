/**
 * koi-skeleton · 轻量鱼骨骼系统（共享作用域片段）
 * 依赖：koiMath（lerp）、koiPond 的状态（frameCount，运行时解析）。
 *
 * 设计目标：让「改动效」「绑部位」不再深挖渲染函数。
 *   - 骨骼节点 = koi.body 等弧长点列 + 每帧算好的切线/法线（tan[]）
 *   - 动效 = 行波 undulation（沿身体传播的横向摆动，尾部摆幅最大）+ 鳍摆动相位，
 *     全部由 updateSkeleton 输出；渲染层只读骨骼状态
 *   - 部位绑定 = BIND 表（name → 归一化位置 t），改部位位置只改这张表；
 *     updateSkeleton 把每个部位定位到世界坐标（含行波偏移）写入 sk.bind[name]
 *
 * 渲染层用法：
 *   - 身体段：bx = body[i].x + tan[i].nx * wave[i]（行波偏移）
 *   - 胸鳍：sk.bind.pec（位置/切线/半宽）+ sk.flap
 *   - 背鳍：sk.bind.dorsal0 ~ sk.bind.dorsal1 的节点区间
 *   - 尾鳍：sk.bind.tail + sk.spread
 */
// ---- 体型轮廓 ----
// 锦鲤俯视轮廓：吻部圆钝 → 头冠 → 鳃盖后最宽 → 中段微收 → 尾柄收窄。
// 关键点：[归一化位置 t, 直径系数]（相对 baseSize），smoothstep 插值。
// 替代原先「头部只占 1/6、鳃盖后即最宽、随后线性缩到 0」的蝌蚪形：
// 头部现在占满前 1/4，最宽处移到体长 1/4 处（鳃盖后），尾端保留 0.35 不再尖。
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
  const t = index / (k.bodyLength - 1)
  return k.baseSize * bodyProfile(t)
}
function shadowBodySize(index, k) {
  return bodySize(index, k) * 0.92 // 影子略小于本体
}
function tailSize(index, k) {
  return bodySize(index, k) * 0.95 // 尾腹色底层略收，避免边缘露出
}

// ---- 鱼骨骼 ----
// 部位绑定表：name → 归一化位置 t。改部位位置只改这张表。
const BIND = {
  head: 0.08, // 头部锚点（吻部后，供眼睛/头部装饰）
  pec: 0.2, // 胸鳍根（鳃盖后）
  dorsal0: 0.36, // 背鳍起点
  dorsal1: 0.6, // 背鳍终点
  tail: 1.0, // 尾鳍根
}

// 行波 undulation：沿身体传播的横向摆动。t 越大摆幅越大（尾摆最明显），
// 头部稳定 —— 这是锦鲤游动「头稳尾摆」的关键姿态。
const WAVE_FREQ = 0.42 // 空间频率（弧度/段）
const WAVE_SPEED = 0.2 // 时间频率（弧度/帧）
const WAVE_AMP = 0.24 // 最大摆幅（相对 baseSize，尾部）

/** 创建骨骼（每条鱼一份；bind 对象复用，update 只改写字段，避免每帧分配） */
function makeSkeleton(k) {
  const bind = {}
  for (const name in BIND) {
    bind[name] = { t: BIND[name], i: 0, x: 0, y: 0, dx: 1, dy: 0, nx: 0, ny: 1, half: 0 }
  }
  return { bind, tan: [], wave: [], flap: 0, spread: 0 }
}

/**
 * 每帧刷新骨骼（在 updateKoi 内调用）：
 *   1. 全节点切线/法线（tan[]）
 *   2. 行波偏移（wave[]）
 *   3. 部位世界定位（bind[name]，含行波偏移）
 *   4. 鳍动效相位（flap 胸鳍扇动 / spread 尾鳍张合，均随 panic 加大）
 */
function updateSkeleton(sk, k, frameCount) {
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
  // 2) 行波 undulation：头部稳定，尾部摆幅最大
  sk.wave.length = n
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    sk.wave[i] = Math.sin(i * WAVE_FREQ - frameCount * WAVE_SPEED + k.jitter) * (k.baseSize * WAVE_AMP * t * t)
  }
  // 3) 部位世界定位（含行波偏移）
  for (const name in BIND) {
    const bd = sk.bind[name]
    const i = Math.round(bd.t * (n - 1))
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
  // 4) 鳍动效相位
  sk.flap = Math.sin(frameCount * 0.16 + k.jitter) * 0.32 + k.panic * 0.18
  sk.spread = 0.5 + Math.sin(frameCount * 0.1 + k.jitter) * 0.12 + k.panic * 0.12
}
