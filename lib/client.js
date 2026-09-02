window.__ModuleLoader__.load({
	id: "dsh-skin-koi-pond",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
/**
 * koi-pond · 锦鲤配色方案（自包含版，转写自 carps-top/src/utils/koiSchemes.ts）
 * 作为「鱼群颜色设置」的唯一数据源。
 * 每个方案：c/c2 鱼身主色/尾腹色；mods 游动行为参数。
 */
const KOI_PRESETS = [
  { id: 'kohaku', name: '红白', c: '#ffffff', c2: '#e23b2e', mods: { size: 0, speed: 0, perc: 100, number: 0 } },
  { id: 'sanke', name: '大正三色', c: '#ffffff', c2: '#141414', mods: { size: 0, speed: 0, perc: 100, number: 0 } },
  { id: 'showa', name: '昭和三色', c: '#141414', c2: '#e23b2e', mods: { size: 0, speed: 0, perc: 100, number: 0 } },
  { id: 'ogon', name: '黄金', c: '#f4c430', c2: '#d99a00', mods: { size: 1, speed: -1, perc: 120, number: 0 } },
  { id: 'tancho', name: '丹顶', c: '#ffffff', c2: '#ff3b30', mods: { size: 0, speed: 0, perc: 100, number: 0 } },
  { id: 'asagi', name: '浅黄', c: '#3b6fb5', c2: '#e23b2e', mods: { size: 0, speed: 1, perc: 110, number: 0 } },
  { id: 'utsuri', name: '绯写', c: '#f1541b', c2: '#141414', mods: { size: 0, speed: 2, perc: 110, number: 0 } },
  { id: 'panda', name: '写鲤（黑白）', c: '#141414', c2: '#ffffff', mods: { size: 1, speed: 0, perc: 100, number: 0 } },
  { id: 'momiji', name: '落叶', c: '#f1541b', c2: '#ffffff', mods: { size: 0, speed: 0, perc: 110, number: 0 } },
]

function getScheme(id) {
  return KOI_PRESETS.find((p) => p.id === id) ?? null
}

function pickRandomScheme() {
  const s = Math.random()
  const m = { size: 0, speed: 0, perc: 100, number: 0 }
  const koiColors2 = ['#141414', '#ffffff', '#ffffff', '#ffffff']
  const rc = () => koiColors2[Math.floor(Math.random() * koiColors2.length)]
  let c
  let c2
  if (s < 0.002) {
    c = '#FFC0CB'
    c2 = '#ef8aef'
    m.speed = 8
    m.perc = 120
  } else if (s < 0.008) {
    c = '#a245ff'
    c2 = '#0aebff'
    m.speed = 5
    m.perc = 120
  } else if (s < 0.03) {
    c = '#fffff1'
    c2 = '#ffbf00'
    m.perc = 380
    m.speed = 3
  } else if (s < 0.07) {
    c = '#141414'
    c2 = '#ca040a'
    m.size = 1
    m.perc = 100
    m.number = -5
  } else if (s < 0.12) {
    c = '#fffff2'
    c2 = '#234edb'
    m.perc = 150
  } else if (s < 0.18) {
    c = '#ffbf00'
    c2 = '#ffbf00'
    m.perc = 100
  } else if (s < 0.26) {
    c = '#141413'
    c2 = rc()
    m.perc = 100
  } else if (s < 0.33) {
    c = '#ffffff'
    c2 = rc()
    m.perc = 100
  } else if (s < 0.9) {
    c = '#f1541b'
    c2 = rc()
    m.perc = 120
  } else {
    c = '#ff5000'
    c2 = '#f1541b'
    m.perc = 120
  }
  return { id: 'random', name: '随机彩蛋', c, c2, mods: m }
}

function resolveScheme(saved) {
  if (saved && saved !== 'random') {
    const p = getScheme(saved)
    if (p) return p
  }
  return pickRandomScheme()
}



/**
 * koi-math · 数学与颜色工具（共享作用域片段，被后续 koi 模块直接引用）
 * 依赖：无（在 koiSchemes 之后拼接）。
 */
// ---- 小工具 / 数学 ----
function rnd(a, b) {
  return a + Math.random() * (b - a)
}
function mag(a) {
  return Math.hypot(a.x, a.y)
}
function setMag(a, m) {
  const l = mag(a) || 1
  return { x: (a.x / l) * m, y: (a.y / l) * m }
}
function limit(a, mx) {
  return mag(a) > mx ? setMag(a, mx) : a
}
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
function lerp(a, b, t) {
  return a + t * (b - a)
}
function rgba(hex, a255) {
  const h = hex.replace('#', '')
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  const r = parseInt(full.substring(0, 2), 16)
  const g = parseInt(full.substring(2, 4), 16)
  const b = parseInt(full.substring(4, 6), 16)
  const a = Math.max(0, Math.min(1, a255 / 255))
  return `rgba(${r},${g},${b},${a})`
}
// 把 hex 色向白色提亮 amt(0~1)，返回 hex（背脊线/亮点用）
function lighten(hex, amt) {
  const h = hex.replace('#', '')
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  const to2 = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  const mix = (n) => n + (255 - n) * amt
  return (
    '#' +
    to2(mix(parseInt(full.substring(0, 2), 16))) +
    to2(mix(parseInt(full.substring(2, 4), 16))) +
    to2(mix(parseInt(full.substring(4, 6), 16)))
  )
}
// 按倍率压暗一个 hex 色，返回 hex（供 AO 边缘渐变用）
function shade(hex, f) {
  const h = hex.replace('#', '')
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  const to2 = (n) => Math.min(255, Math.round(n * f)).toString(16).padStart(2, '0')
  return '#' + to2(parseInt(full.substring(0, 2), 16)) + to2(parseInt(full.substring(2, 4), 16)) + to2(parseInt(full.substring(4, 6), 16))
}

// Perlin noise（荷叶边缘）
const perm = new Uint8Array(512)
;(function () {
  const p = []
  let i
  for (i = 0; i < 256; i++) p[i] = i
  for (i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = p[i]
    p[i] = p[j]
    p[j] = t
  }
  for (i = 0; i < 512; i++) perm[i] = p[i & 255]
})()
function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10)
}
function grad(h, x, y) {
  switch (h & 3) {
    case 0:
      return x + y
    case 1:
      return -x + y
    case 2:
      return x - y
    default:
      return -x - y
  }
}
function noise2(x, y) {
  const X = Math.floor(x) & 255
  const Y = Math.floor(y) & 255
  x -= Math.floor(x)
  y -= Math.floor(y)
  const u = fade(x)
  const v = fade(y)
  const aa = perm[perm[X] + Y]
  const ab = perm[perm[X] + Y + 1]
  const ba = perm[perm[X + 1] + Y]
  const bb = perm[perm[X + 1] + Y + 1]
  const res = lerp(
    lerp(grad(aa, x, y), grad(ba, x - 1, y), u),
    lerp(grad(ab, x, y - 1), grad(bb, x - 1, y - 1), u),
    v
  )
  return (res + 1) / 2
}


/**
 * koi-light · 实时光照系统与椭圆绘制基元（共享作用域片段）
 * 依赖：koiMath（rgba/shade/lerp）、koiPond 的状态（frameCount/W/H/curAlpha，运行时解析）。
 * 包含：ell / ellLit（AO 方向渐变，渐变对象缓存）/ 实时光源（updateLight / lightDirIndex）/
 * 阴影离屏层（beginShadowLayer / flushShadowLayer / shadowPalette）。
 */
function ell(target, x, y, size, fill) {
  if (size <= 0 || !target) return
  target.fillStyle = fill
  target.beginPath()
  target.ellipse(x, y, size / 2, size / 2, 0, 0, Math.PI * 2)
  target.fill()
}

// ---- 实时光照 ----
// 光源绕池缓慢移动（Lissajous 轨迹）+ 光强低频呼吸；每条鱼每段按
// 「段 → 光源」方向实时计算受光面，光影随光源位置实时变化。
// 方向离散为 8 向，让渐变缓存可控（缓存 key 含方向索引，每帧零新建）。
const LIGHT_AMP_X = 0.36 // 光源横向游走半径（占屏宽比例）
const LIGHT_AMP_Y = 0.26 // 纵向
const LIGHT_PERIOD = 4600 // 一个周期帧数（约 77s @60fps）
const LIGHT_DIRS = [
  [1, 0], [0.7071, 0.7071], [0, 1], [-0.7071, 0.7071],
  [-1, 0], [-0.7071, -0.7071], [0, -1], [0.7071, -0.7071],
]
let lightX = 0
let lightY = 0
let lightAmp = 1 // 光强呼吸系数（0.76 ~ 1.0）
function updateLight() {
  const ph = frameCount / LIGHT_PERIOD
  lightX = (0.5 + Math.sin(ph * Math.PI * 2) * LIGHT_AMP_X) * W
  lightY = (0.36 + Math.cos(ph * Math.PI * 2 * 0.73) * LIGHT_AMP_Y) * H
  lightAmp = 0.88 + Math.sin(frameCount * 0.008) * 0.12
}
// 从点 (x,y) 指向光源的方向，离散为 8 向索引
function lightDirIndex(x, y) {
  const dx = lightX - x
  const dy = lightY - y
  const l = Math.hypot(dx, dy)
  if (!l) return 6 // 原点 → 朝上
  const a = Math.atan2(dy, dx)
  return ((Math.round(a / (Math.PI / 4)) + 8) % 8)
}

// 方向光照椭圆（AO）：径向渐变，渐变中心向受光方向偏移，
// 中心=原色（受光），边缘=原色按 dark 倍率压暗（遮蔽）。
// 多段沿身体串接后，受光侧连成亮脊、背光侧累积成暗边，产生立体感。
// 渐变对象按 (hex, r, di, dark) 缓存复用 —— 半径/AO 强度只依赖段序号、
// 方向只有 8 种；坐标通过 translate 进入局部系，因此每帧零创建。
const litCache = new Map()
function ellLit(target, x, y, size, hex, a255, di, dark) {
  if (size <= 0 || !target) return
  const r = size / 2
  const key = hex + '|' + Math.round(r * 2) + '|' + di + '|' + Math.round(dark * 100)
  let g = litCache.get(key)
  if (!g) {
    const d = LIGHT_DIRS[di]
    g = target.createRadialGradient(d[0] * r * 0.45, d[1] * r * 0.45, r * 0.08, 0, 0, r)
    g.addColorStop(0, rgba(hex, 255))
    g.addColorStop(1, rgba(shade(hex, dark), 255))
    litCache.set(key, g)
  }
  target.save()
  target.translate(x, y)
  target.globalAlpha = Math.max(0, Math.min(1, a255 / 255))
  target.fillStyle = g
  target.beginPath()
  target.ellipse(0, 0, r, r, 0, 0, Math.PI * 2)
  target.fill()
  target.restore()
}

// ---- 阴影层 ----
// 影子先画在 1/SHADOW_DOWNSCALE 分辨率的离屏画布上，再放大贴回主画布：
// 浏览器的双线性插值顺带得到柔和投影（原来是一堆硬边椭圆），
// 同时把阴影的填充开销压到约 1/8。
const SHADOW_DOWNSCALE = 0.35
let shadowPalette = { fish: 'rgba(2,8,14,0.012)', leaf: 'rgba(2,8,14,0.1)' }
let shadowCanvas = null
let shadowCtx = null

// 投影颜色跟随亮暗主题（原来只有荷叶面色切换，影子恒为近黑，
// 在宣纸日色下会留下一片脏灰）
function syncShadowPalette() {
  const dark = document.body && document.body.hasAttribute('data-ds-dark-theme')
  shadowPalette = dark
    ? { fish: 'rgba(2,8,14,0.012)', leaf: 'rgba(2,8,14,0.1)' }
    : { fish: 'rgba(30,46,38,0.016)', leaf: 'rgba(30,46,38,0.085)' }
}

function beginShadowLayer() {
  if (!shadowCanvas) {
    shadowCanvas = document.createElement('canvas')
    shadowCtx = shadowCanvas.getContext('2d')
  }
  if (!shadowCtx) return false
  const pw = Math.max(1, Math.floor(W * dpr * SHADOW_DOWNSCALE))
  const ph = Math.max(1, Math.floor(H * dpr * SHADOW_DOWNSCALE))
  if (shadowCanvas.width !== pw || shadowCanvas.height !== ph) {
    shadowCanvas.width = pw
    shadowCanvas.height = ph
  }
  const s = dpr * SHADOW_DOWNSCALE
  shadowCtx.setTransform(s, 0, 0, s, 0, 0)
  shadowCtx.clearRect(0, 0, W, H)
  return true
}

function flushShadowLayer() {
  if (!shadowCtx || !ctx) return
  const smoothing = ctx.imageSmoothingEnabled
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(shadowCanvas, 0, 0, W, H)
  ctx.imageSmoothingEnabled = smoothing
}


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


/**
 * koi-component · 鱼组件系统基座（共享作用域片段）
 * 依赖：无。鱼对象 = 数据（pos/vel/size/color…）+ 一组可拔插组件，
 * 每条鱼的功能按「组件」拆分，组件之间通过共享的鱼对象状态交互：
 *
 *   - state    状态机：普通 / 躲避 / 逃跑（见 koiState.js）—— 鱼「想干嘛」
 *   - motion   向量寻游：算「下一步目标向量 k.wish」并平滑加减速 —— 鱼「怎么动」
 *   - body     原始轨迹入队 + 等弧长重采样 —— 鱼「身体多长」
 *   - skeleton 骨骼刷新：切线/行波/部位绑定/鳍相位（见 koiSkeleton.js）—— 鱼「怎么摆」
 *
 * 组件 = { name, on, update() }。按注册顺序逐帧 update，可随时
 *   detachComponent(fish, name) 拔掉某个子系统（比如拔掉 skeleton 即停止行波动效），
 *   setComp(fish, name, false) 临时关闭而不移除。
 * 渲染层只读 k.body / k.sk 等共享状态，与组件装配方式解耦。
 */
function attachComponent(k, comp) {
  comp.k = k
  comp.on = comp.on !== false
  k.comps.push(comp)
  if (comp.name) {
    if (!k.comp) k.comp = Object.create(null)
    k.comp[comp.name] = comp
  }
  return comp
}

// 拔掉某组件（移除其 update 与注册）。返回是否找到并移除。
function detachComponent(k, name) {
  const list = k.comps
  for (let i = 0; i < list.length; i++) {
    if (list[i].name === name) {
      list.splice(i, 1)
      if (k.comp) delete k.comp[name]
      return true
    }
  }
  return false
}

// 开关某组件（on=false 停更但保留注册，之后可再打开）。返回是否存在该组件。
function setComp(k, name, on) {
  const c = k.comp && k.comp[name]
  if (!c) return false
  c.on = !!on
  return true
}

// 逐帧驱动：只跑 on 状态的组件（注册顺序 = 依赖顺序，由装配方保证）
function updateComponents(k) {
  const list = k.comps
  for (let i = 0; i < list.length; i++) {
    const c = list[i]
    if (c.on) c.update()
  }
}


/**
 * koi-state · 鱼状态机（共享作用域片段）
 * 依赖：koiMath（dist）、koiPond 的状态（W/H/flock/ripples/FPS，运行时解析）、
 * koiRipple（makeRipple）。行为决策只改这里，不动运动学/渲染。
 *
 * 状态（用户在需求里的三态，行为语义集中在 enterState 与 updateFishState）：
 *   NORMAL 普通 —— 无干扰自然巡游（漫游锚点 + 群游，见 koiFish motion）
 *   AVOID  躲避 —— 指针进入 FLEE_R 半径，鱼需要躲开指针（含预测落点）
 *   ESCAPE 逃跑 —— 满足任一触发即逃跑：
 *       ① 指针在很近的距离（< ESCAPE_CLICK_R）按下（点击惊吓，koiStartle）
 *       ② 被指针「围住」：连续躲避超过 ESCAPE_AFTER_SEC 秒
 *     逃跑时往「离自己最近的边缘」外的目标点爆发游去（见 nearestEdgeTarget），
 *     游出画面（越过 edges 环绕阈值）后由 edges() 收尾回到 NORMAL。
 */
const FISH_STATE = Object.freeze({
  NORMAL: 'normal',
  AVOID: 'avoid',
  ESCAPE: 'escape',
})

// 每条鱼的状态数据（对象复用，字段就地改写）
function mkFishState() {
  return { name: FISH_STATE.NORMAL, prev: FISH_STATE.NORMAL, t: 0, avoidT: 0, esc: null }
}

// 躲避生效半径（px，指针中心到鱼头）
const FLEE_R = 150
// 点击惊吓半径（px，距离比这更近的点按才算「很近的点击」）
const ESCAPE_CLICK_R = 60
// 被围住判定：连续躲避超过该秒数 → 逃跑
const ESCAPE_AFTER_SEC = 2

// 逃跑目标 = 越过「最近的边」外的点（PAD 大于 edges() 的 ±50 环绕阈值，
// 保证鱼在到达目标前先触发越界，由 edges() 平滑收尾，不会卡在边界震荡）
function nearestEdgeTarget(k) {
  const PAD = 90
  const dL = k.pos.x
  const dR = W - k.pos.x
  const dT = k.pos.y
  const dB = H - k.pos.y
  if (dL <= dR && dL <= dT && dL <= dB) return { x: -PAD, y: k.pos.y }
  if (dR <= dT && dR <= dB) return { x: W + PAD, y: k.pos.y }
  if (dT <= dB) return { x: k.pos.x, y: -PAD }
  return { x: k.pos.x, y: H + PAD }
}

// 状态切换（含入场副作用）。无状态组件（早期构造）或同状态直接忽略。
function enterState(k, st) {
  const fs = k.fs
  if (!fs || fs.name === st) return
  fs.prev = fs.name
  fs.name = st
  fs.t = 0
  if (st === FISH_STATE.ESCAPE) {
    // 逃跑：panic 顶满（爆发加速/大幅摆尾），定好「最近的边缘」目标并溅起水花
    k.panic = 1
    fs.esc = nearestEdgeTarget(k)
    fs.avoidT = 0
    if (ripples && typeof makeRipple === 'function') ripples.push(makeRipple(k.pos.x, k.pos.y, true))
  } else if (st === FISH_STATE.NORMAL) {
    // 逃跑收尾（edges 越界后回来）：清目标、panic 先压一档再自然衰减
    fs.esc = null
    k.panic = Math.min(k.panic, 0.4)
  }
}

// 每帧状态推进（在 motion 之前跑：决定 panic/wish 用哪套行为）
function updateFishState(k) {
  const fs = k.fs
  fs.t++
  // 逃跑中不中途降级 —— 直到 edges() 越界环绕时收尾回普通态
  if (fs.name === FISH_STATE.ESCAPE) return
  const hasMouse = mouse.x > -999
  const d = dist(k.pos, mouse)
  if (hasMouse && d < FLEE_R) {
    if (fs.name !== FISH_STATE.AVOID) enterState(k, FISH_STATE.AVOID)
    // 连续躲避计时（离开半径/指针消失即清零）：被围超过阈值 → 逃跑
    fs.avoidT++
    if (fs.avoidT >= Math.max(1, ESCAPE_AFTER_SEC * FPS)) enterState(k, FISH_STATE.ESCAPE)
  } else {
    if (fs.name === FISH_STATE.AVOID) enterState(k, FISH_STATE.NORMAL)
    fs.avoidT = 0
  }
}

// 点击惊吓：指针按下瞬间，附近（< ESCAPE_CLICK_R）的鱼直接进入逃跑
function koiStartle(x, y) {
  if (!flock) return
  for (let i = 0; i < flock.length; i++) {
    const k = flock[i]
    if (!k.active) continue
    if (Math.hypot(k.pos.x - x, k.pos.y - y) < ESCAPE_CLICK_R) enterState(k, FISH_STATE.ESCAPE)
  }
}


/**
 * koi-leaf · 荷叶生成与离屏烘焙（共享作用域片段）
 * 依赖：koiMath（rnd/noise2/lerp）、koiLight（shadowPalette）、koiPond 的状态
 * （dpr/curAlpha/leaves/decoLeaves，运行时解析）。
 * 荷叶是静态的：mount / 主题切换 / dpr 变化时把每片荷叶烘焙成两张位图
 * （阴影与叶面分开，保留「荷叶影在鱼下、荷叶面在鱼上」的遮挡层次），
 * 运行时每帧只剩 16 次 drawImage，Perlin 噪声与折线计算归零。
 */
const DECO_COUNT = 6
const NOTCH_HALF = 0.28
const NOTCH_PROB = 0.3

function spawnLeaf(x, y, offset, scale, size) {
  return {
    x,
    y,
    offset,
    scale,
    size: size || 1,
    notch: rnd(0, Math.PI * 2),
    hasNotch: Math.random() < NOTCH_PROB,
  }
}
function angDiff(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b))
}
function leafRadius(lf, a) {
  const nx = lf.offset * Math.cos(a) + lf.offset
  const ny = lf.offset * Math.sin(a) + lf.offset
  let r = (180 + (noise2(nx, ny) * 2 - 1) * lf.scale) * lf.size
  if (lf.hasNotch) {
    const da = Math.abs(angDiff(a, lf.notch))
    if (da < NOTCH_HALF) {
      const t = da / NOTCH_HALF
      r = r * t * t
    }
  }
  return r
}
function leafVerts(lf) {
  const verts = []
  for (let i = 0; i < 360; i++) {
    const a = (i * Math.PI) / 180
    const r = leafRadius(lf, a)
    verts.push({ x: r * Math.cos(a), y: r * Math.sin(a) })
  }
  return verts
}

// ---- 荷叶离屏缓存 ----
const LEAF_SHADOW_QUALITY = 0.5 // 阴影本来就要柔化，半分辨率足够且省 3/4 内存
const LEAF_SURFACE_QUALITY = 1

function leafShadowOffset(lf) {
  return 50 * lf.size
}

function bakeLeafCache(lf, quality, paint) {
  const maxR = (180 + lf.scale) * lf.size // noise2 ∈ [0,1] → 半径上界
  const half = maxR + leafShadowOffset(lf) + 8
  const res = dpr * quality
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.ceil(half * 2 * res))
  c.height = Math.max(1, Math.ceil(half * 2 * res))
  const cx = c.getContext('2d')
  if (!cx) return null
  cx.setTransform(res, 0, 0, res, 0, 0)
  cx.translate(half, half)
  paint(cx, lf)
  return { canvas: c, half }
}

function buildLeafCaches() {
  const all = leaves.concat(decoLeaves)
  for (let i = 0; i < all.length; i++) {
    const lf = all[i]
    lf.cacheShadow = bakeLeafCache(lf, LEAF_SHADOW_QUALITY, paintLeafShadow)
    lf.cacheSurface = bakeLeafCache(lf, LEAF_SURFACE_QUALITY, paintLeafSurface)
  }
}

function drawLeafCache(target, lf, key) {
  const cache = lf[key]
  if (!cache) return
  const d = cache.half * 2
  target.drawImage(cache.canvas, lf.x - cache.half, lf.y - cache.half, d, d)
}

// 荷叶影子（画到已 translate 至叶心的离屏上下文）
function paintLeafShadow(target, lf) {
  const verts = leafVerts(lf)
  const o = leafShadowOffset(lf)
  target.save()
  target.globalAlpha = curAlpha
  target.fillStyle = shadowPalette.leaf
  target.beginPath()
  target.moveTo(verts[0].x + o, verts[0].y + o)
  for (let v = 1; v < verts.length; v++) target.lineTo(verts[v].x + o, verts[v].y + o)
  target.closePath()
  target.fill()
  target.restore()
}

// ---- 荷叶颜色：亮色=原版亮绿，暗色=压暗绿（上次的变色只作用于暗色模式） ----
let leafPalette = {
  fill: 'rgba(71,184,151,0.9)',
  stroke: 'rgba(23,111,88,0.28)',
  vein: 'rgba(23,111,88,0.17)',
  center: 'rgba(23,111,88,0.22)',
}
function syncLeafPalette() {
  const dark = document.body && document.body.hasAttribute('data-ds-dark-theme')
  leafPalette = dark
    ? {
        fill: 'rgba(47,130,105,0.85)',
        stroke: 'rgba(18,72,58,0.35)',
        vein: 'rgba(18,72,58,0.22)',
        center: 'rgba(18,72,58,0.28)',
      }
    : {
        fill: 'rgba(71,184,151,0.9)',
        stroke: 'rgba(23,111,88,0.28)',
        vein: 'rgba(23,111,88,0.17)',
        center: 'rgba(23,111,88,0.22)',
      }
}

// 荷叶面（画到已 translate 至叶心的离屏上下文）
function paintLeafSurface(target, lf) {
  const verts = leafVerts(lf)
  target.save()
  target.globalAlpha = curAlpha
  target.fillStyle = leafPalette.fill
  target.beginPath()
  target.moveTo(verts[0].x, verts[0].y)
  for (let v = 1; v < verts.length; v++) target.lineTo(verts[v].x, verts[v].y)
  target.closePath()
  target.fill()
  target.strokeStyle = leafPalette.stroke
  target.lineWidth = 1.5
  target.beginPath()
  target.moveTo(verts[0].x, verts[0].y)
  for (let e = 1; e < verts.length; e++) target.lineTo(verts[e].x, verts[e].y)
  target.closePath()
  target.stroke()
  target.strokeStyle = leafPalette.vein
  target.lineWidth = 2
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
    if (lf.hasNotch && Math.abs(angDiff(a, lf.notch)) < NOTCH_HALF + 0.12) continue
    const rr = leafRadius(lf, a)
    target.beginPath()
    target.moveTo(Math.cos(a) * rr * 0.1, Math.sin(a) * rr * 0.1)
    target.lineTo(Math.cos(a) * rr * 0.86, Math.sin(a) * rr * 0.86)
    target.stroke()
  }
  target.fillStyle = leafPalette.center
  target.beginPath()
  target.arc(0, 0, 5 * lf.size, 0, Math.PI * 2)
  target.fill()
  target.restore()
}


/**
 * koi-ripple · 涟漪（共享作用域片段）
 * 依赖：koiMath（rnd）、koiPond 的状态（ctx/curAlpha，运行时解析）。
 */
function makeRipple(x, y, small) {
  return {
    x,
    y,
    size: small ? rnd(24, 64) : rnd(40, 140),
    lifespan: 400,
    sizeStep: rnd(2, 3),
    lifeStep: rnd(2, 10),
  }
}
function drawRipple(r) {
  if (!ctx) return
  const a = Math.max(0, Math.min(1, r.lifespan / 255))
  ctx.lineWidth = 0.8
  ctx.strokeStyle = `rgba(255,255,255,${a * curAlpha * 0.8})`
  ctx.beginPath()
  ctx.arc(r.x, r.y, r.size / 2, 0, Math.PI * 2)
  ctx.stroke()
}


/**
 * koi-render · 鱼渲染层（共享作用域片段，全部读骨骼 k.sk 绘制）
 * 依赖：koiMath（lerp/rgba/lighten）、koiLight（ell/ellLit/lightDirIndex/lightAmp/shadowCtx/
 * shadowPalette）、koiSkeleton（bodySize/tailSize/shadowBodySize）、koiPond 的状态
 * （ctx/curAlpha/frameCount/reduced，运行时解析）。
 *
 * 绘制顺序（frame 中）：drawTail → drawPectoralTail(胸鳍/尾鳍素材) → drawBody →
 * drawBodyLight → drawBackLine(背脊线)。
 * 身体段用「body[i] + 法线 × 行波」的世界位置（骨骼驱动姿态），
 * 鳍与尾用骨骼部位锚点（sk.bind.*）与动效相位（sk.flap）。
 * 鳍形素材化：胸鳍/尾鳍是可整体替换的 SVG（assets/fin-*.svg，build 内联）——
 * 运行时染成尾腹色 color2 的离屏剪影贴图，想改鳍形只换素材不动代码；
 * 背鳍不再用整膜，改为沿身体中线一条比主色更亮的线（转弯时随身体连续弯曲）。
 */
// 投影偏移跟随体型：原来硬编码 50px，对直径仅 30~40px 的鱼来说
// 影子会整个脱开本体，看着像另一条鱼
function fishShadowOffset(k) {
  return k.baseSize * 1.15
}
function drawShadow(k) {
  const o = fishShadowOffset(k)
  for (let i = 0; i < k.body.length; i++) {
    const b = k.body[i]
    ell(shadowCtx, b.x + o, b.y + o, shadowBodySize(i, k), shadowPalette.fish)
  }
}
// 身体段世界位置（含骨骼行波偏移）
function bodyPoint(k, sk, i) {
  const b = k.body[i]
  const tn = sk.tan[i]
  return { x: b.x + tn.nx * sk.wave[i], y: b.y + tn.ny * sk.wave[i] }
}
function drawTail(k) {
  const sk = k.sk
  const n = k.body.length
  for (let i = 0; i < n; i++) {
    const sz = tailSize(i, k)
    if (sz <= 0) continue
    const t = i / (n - 1)
    const p = bodyPoint(k, sk, i)
    // 尾腹色层：头部弱（被主色盖住），越靠尾越实 —— 尾巴呈现 color2。
    // 同样加温和的方向光照（dark 0.78），方向实时跟随光源。
    ellLit(ctx, p.x, p.y, sz, k.color2, lerp(0.35, 0.75, t) * curAlpha * lightAmp * 255, lightDirIndex(p.x, p.y), 0.78)
  }
}
function drawShadowTail(k) {
  const o = fishShadowOffset(k)
  const n = k.body.length
  for (let i = 0; i < n; i++) {
    const b = k.body[i]
    ell(shadowCtx, b.x + o, b.y + o, tailSize(i, k), shadowPalette.fish)
  }
}
function drawBody(k) {
  const sk = k.sk
  const n = k.body.length
  for (let i = 0; i < n; i++) {
    const sz = bodySize(i, k)
    if (sz <= 0) continue
    const t = i / (n - 1)
    const p = bodyPoint(k, sk, i)
    // 主色层：头部实，向尾逐渐让位给尾腹色。
    // 实时光照：光方向 = 段 → 光源（每帧变化），受光侧亮、背光侧暗；
    // 头部整体亮、尾部整体暗（远离光源）—— dark 0.62→0.48 边缘压暗 38%→52%。
    ellLit(ctx, p.x, p.y, sz, k.color, lerp(0.9, 0.3, t) * curAlpha * lightAmp * 255, lightDirIndex(p.x, p.y), lerp(0.62, 0.48, t))
  }
}

// 暗部环境反光层：与 AO 渐变配合，给背光一侧一点水下环境光。
// 只画暗部（不画高光 —— 高光离散亮椭圆在体型小时会串珠），方向实时跟随光源。
function drawBodyLight(k) {
  const sk = k.sk
  const n = k.body.length
  if (n < 10) return
  const lo0 = Math.round(n * 0.22)
  const lo1 = Math.round(n * 0.78)
  for (let i = lo0; i <= lo1; i += 2) {
    const sz = bodySize(i, k)
    if (sz <= 0) continue
    const t = i / (n - 1)
    const p = bodyPoint(k, sk, i)
    const d = LIGHT_DIRS[lightDirIndex(p.x, p.y)]
    // 腹侧环境反光（背光一侧，暗部不串珠）
    ell(ctx, p.x - d[0] * sz * 0.2, p.y - d[1] * sz * 0.2, sz * 0.36, rgba('#0e3a4a', 0.05 * (1 - t * 0.5) * curAlpha * 255))
  }
}

// ---- 鳍素材：可替换 SVG → 运行时染色的离屏剪影 ----
// 胸鳍/尾鳍素材（plugin/koi/assets/fin-*.svg）在 build 时内联进占位符
// "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100\" height=\"56\" viewBox=\"0 0 100 56\">\n  <!--\n    koi-pond 胸鳍素材（可替换）\n    约定：根(附着端)在素材左侧中线附近，鱼体在中线(y=28)左侧，\n    鳍向 +x 伸展；运行时整体着色为当前配色 color2 并半透明绘制。\n    请保持左右镜像对称，以便两侧胸鳍共用同一素材。\n  -->\n  <path fill=\"#888888\" d=\"M6 24 C 20 13, 46 11, 70 16 C 86 19, 98 25, 98 28 C 98 31, 86 37, 70 40 C 46 44, 20 43, 6 32 Z\"/>\n</svg>" / "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"120\" height=\"100\" viewBox=\"0 0 120 100\">\n  <!--\n    koi-pond 尾鳍素材（可替换，整片分叉剪影）\n    约定：根(尾柄附着端)在素材左侧中线(y=50)附近，鱼体在左侧，\n    分叉两叶向 +x 伸展；运行时整体着色为当前配色 color2 并半透明绘制。\n    请保持上下镜像对称。\n  -->\n  <path fill=\"#888888\" d=\"M6 46 C 30 42, 58 30, 82 18 C 96 11, 110 10, 115 18 C 119 25, 115 32, 106 37 C 97 42, 90 45, 84 48 C 80 50, 80 50, 84 52 C 90 55, 97 58, 106 63 C 115 68, 119 75, 115 82 C 110 90, 96 89, 82 82 C 58 70, 30 58, 6 54 Z\"/>\n</svg>"（见 scripts/build.mjs）。单文件 bundle 无法外链
// 图片，运行时用 data:image/svg+xml 解码素材、getImageData 把整片剪影染成当前配色
// color2（保留抗锯齿 alpha），缓存为离屏画布 —— 想换鳍形只需改 assets/*.svg。
// 素材约定（viewBox 单位）：根(附着端)在素材左侧中线附近、主体向 +x 伸展；
// rootX/rootY = 附着点在素材像素中的位置（替换素材后按需调整）。
// 无 Image 的环境（Node 回归沙箱）产出「带 _kind 标记的占位画布」：只跑几何不跑像素，
// 便于 finshape 仍能反解鳍的方向/分列。
const FIN_ASSETS = {
  pec: { svg: '"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100\" height=\"56\" viewBox=\"0 0 100 56\">\n  <!--\n    koi-pond 胸鳍素材（可替换）\n    约定：根(附着端)在素材左侧中线附近，鱼体在中线(y=28)左侧，\n    鳍向 +x 伸展；运行时整体着色为当前配色 color2 并半透明绘制。\n    请保持左右镜像对称，以便两侧胸鳍共用同一素材。\n  -->\n  <path fill=\"#888888\" d=\"M6 24 C 20 13, 46 11, 70 16 C 86 19, 98 25, 98 28 C 98 31, 86 37, 70 40 C 46 44, 20 43, 6 32 Z\"/>\n</svg>"', rootX: 10, rootY: 28 },
  tail: { svg: '"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"120\" height=\"100\" viewBox=\"0 0 120 100\">\n  <!--\n    koi-pond 尾鳍素材（可替换，整片分叉剪影）\n    约定：根(尾柄附着端)在素材左侧中线(y=50)附近，鱼体在左侧，\n    分叉两叶向 +x 伸展；运行时整体着色为当前配色 color2 并半透明绘制。\n    请保持上下镜像对称。\n  -->\n  <path fill=\"#888888\" d=\"M6 46 C 30 42, 58 30, 82 18 C 96 11, 110 10, 115 18 C 119 25, 115 32, 106 37 C 97 42, 90 45, 84 48 C 80 50, 80 50, 84 52 C 90 55, 97 58, 106 63 C 115 68, 119 75, 115 82 C 110 90, 96 89, 82 82 C 58 70, 30 58, 6 54 Z\"/>\n</svg>"', rootX: 14, rootY: 50 },
}
const finSpriteCache = new Map()

function svgSize(svg) {
  const mw = /width="(\d+(?:\.\d+)?)"/.exec(svg)
  const mh = /height="(\d+(?:\.\d+)?)"/.exec(svg)
  return [mw ? Math.round(+mw[1]) : 1, mh ? Math.round(+mh[1]) : 1]
}
function hexRgb(hex) {
  const h = String(hex).replace('#', '')
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return { r: parseInt(f.slice(0, 2), 16), g: parseInt(f.slice(2, 4), 16), b: parseInt(f.slice(4, 6), 16) }
}
function newFinCanvas(kind) {
  const a = FIN_ASSETS[kind]
  const [w, h] = svgSize(a.svg)
  const cv = document.createElement('canvas')
  cv.width = Math.max(1, w)
  cv.height = Math.max(1, h)
  cv._kind = kind
  cv._baked = false
  // 附着点元数据：绘制/回归工具共用（finshape 据此反解贴图几何）
  cv._rootX = a.rootX
  cv._rootY = a.rootY
  return cv
}
function tintFinCanvas(kind, cv, color2) {
  const a = FIN_ASSETS[kind]
  if (typeof Image === 'undefined') {
    // 回归沙箱无 Image：占位画布直接可用（几何断言只读方向/锚点，不读像素）
    cv._baked = true
    return
  }
  const img = new Image()
  img.onload = () => {
    const c2d = cv.getContext('2d')
    if (c2d) {
      c2d.drawImage(img, 0, 0, cv.width, cv.height)
      const rgb = hexRgb(color2)
      try {
        const d = c2d.getImageData(0, 0, cv.width, cv.height)
        const px = d.data
        for (let i = 0; i < px.length; i += 4) {
          if (px[i + 3] > 0) {
            px[i] = rgb.r
            px[i + 1] = rgb.g
            px[i + 2] = rgb.b
          }
        }
        c2d.putImageData(d, 0, 0)
      } catch (e) {}
    }
    cv._baked = true
    // 减动效分支只同步画一帧：染色完成后补画一次，避免静态帧没鳍
    if (reduced) frame()
  }
  img.onerror = () => {
    cv._baked = true
    if (reduced) frame()
  }
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(a.svg)
}
// 取某鳍某配色的染色贴图（按 kind+color2 缓存）；异步解码未完成时返回 null → 该帧跳过
function getFinSprite(kind, color2) {
  const key = kind + color2
  let cv = finSpriteCache.get(key)
  if (!cv) {
    cv = newFinCanvas(kind)
    finSpriteCache.set(key, cv)
    tintFinCanvas(kind, cv, color2)
  }
  return cv._baked ? cv : null
}
// 贴图绘制：素材「根(rootX,rootY)」对准 (x,y)，局部 +x 旋转 ang 后与素材 +x（伸向）对齐，
// 实际鳍长 len = 期望视觉长度（scale = len / 素材可见长），半透明 alpha01 × curAlpha。
function drawFinImage(sprite, x, y, ang, len, alpha01) {
  if (!sprite) return
  const lay = FIN_ASSETS[sprite._kind]
  if (!lay.w) {
    const [w, h] = svgSize(lay.svg)
    lay.w = w
    lay.h = h
  }
  const scale = len / Math.max(1, lay.w - lay.rootX)
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(ang)
  ctx.scale(scale, scale)
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha01 * curAlpha))
  ctx.drawImage(sprite, -lay.rootX, -lay.rootY)
  ctx.restore()
}

// 胸鳍 + 尾鳍：画在身体层之下，根部被主色盖住，只露出伸出体外的部分。
// 锚点与动效相位全部来自骨骼（sk.bind.pec / sk.bind.tail / sk.flap）。
function drawPectoralTail(k) {
  const sk = k.sk
  if (k.body.length < 8) return
  const pec = sk.bind.pec
  const tail = sk.bind.tail
  // 胸鳍：鳃盖后两侧各一片，随游动向后外划（sk.flap 相位）。根钉在体缘
  // （部位点 ± 法线 × 半宽），素材 +x 指向尾向并额外偏开 ±(0.5+flap) 向外张。
  const pecSpr = getFinSprite('pec', k.color2)
  if (pecSpr) {
    const finLen = k.baseSize * 0.62
    for (let s = -1; s <= 1; s += 2) {
      const rx = pec.x + pec.nx * s * pec.half
      const ry = pec.y + pec.ny * s * pec.half
      drawFinImage(pecSpr, rx, ry, Math.atan2(pec.dy, pec.dx) + Math.PI + s * (0.5 + sk.flap), finLen, 0.5)
    }
  }
  // 尾鳍：尾端分叉大叶。锚点沿头向反推少许埋入尾柄（根部被主色盖住），
  // 素材 +x 与尾向对齐；张合/摆动由身体行波自然带动。
  const tailSpr = getFinSprite('tail', k.color2)
  if (tailSpr) {
    const tailLen = k.baseSize * 0.95
    drawFinImage(
      tailSpr,
      tail.x + tail.dx * tailLen * 0.16,
      tail.y + tail.dy * tailLen * 0.16,
      Math.atan2(tail.dy, tail.dx) + Math.PI,
      tailLen,
      0.55
    )
  }
}

// 背脊线（替代背鳍整膜）：沿身体中线从 dorsal0 到 dorsal1 画一条比主色更亮的细线。
// 上一版连续膜用「朝上侧法线 + 固定高度 sin 包络」，鱼转向/摆动时法线翻向使鳍脊方向
// 突变、转弯时整条膜断裂、没有整体性。中线亮线随身体曲线整体弯曲、永不翻转 ——
// 转弯时平滑连续；提亮脊线同时强化背部的受光立体感。
function drawBackLine(k) {
  const sk = k.sk
  const i0 = sk.bind.dorsal0.i
  const i1 = sk.bind.dorsal1.i
  if (i1 - i0 < 2) return
  ctx.strokeStyle = rgba(lighten(k.color, 0.4), 0.7 * 255 * curAlpha)
  ctx.lineWidth = Math.max(1, k.baseSize * 0.1)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  for (let i = i0; i <= i1; i++) {
    const p = bodyPoint(k, sk, i)
    if (i === i0) ctx.moveTo(p.x, p.y)
    else ctx.lineTo(p.x, p.y)
  }
  ctx.stroke()
}


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


/**
 * koi-pond · 锦鲤池塘动画运行时主入口（自包含版）
 * 转写自 carps-top/src/scripts/koiPond.ts（原生 Canvas，无 p5 依赖），为 DSH 主题适配：
 *   - mount(host) 在宿主容器内创建全屏 canvas，不再依赖 #koi-pond/#koi-canvas DOM
 *   - 画布透明背景（clearRect），让主题的池水渐变透出
 *   - 去掉博客内页遮罩（scrim/intensity/localStorage 模式），DSH 固定全亮
 *   - 保留：鱼群 flocking / 荷叶 Perlin 边缘 / 涟漪 / 指针交互 / 可见性暂停 / 减动效
 *   - 暴露 window.__koiSetScheme 实时换色（不重建鱼群）
 *
 * 模块化：本文件只保留「module 状态 + 主循环 + 生命周期」；
 * 渲染/骨骼/荷叶/涟漪/鱼 AI 分别在 plugin/koi/koi*.js 片段中
 * （build 按依赖顺序拼接进同一 factory 作用域）。
 */


// ---- module 状态（声明在 factory 顶层共享作用域，供所有 koi 片段运行时解析）----
// 注意：不要用 IIFE 包裹本文件 —— 拆分后的各 koi 片段与这里共享同一作用域，
// IIFE 会把状态关进私有闭包，其他片段（koiLeaf/koiRender/koiFish…）将无法访问。
let started = false
let container = null
let canvas = null
let ctx = null
let flock = []
let scheme = pickRandomScheme()
let PERC = scheme.mods.perc
let rafId = null
let W = 0
let H = 0
let dpr = 1
let frameCount = 0
let FPS = 30 // 目标帧率（mount 时按 cfg.fps 设定；状态机按帧计时换算秒）
let leaves = []
let decoLeaves = []
let curAlpha = 1
let ripples = []
// 供 cleanup 判断 window.__koiSetScheme 是否仍为本实例的
let setSchemeRef = null

// ---- 主循环（透明背景，让主题池水渐变透出） ----
function frame() {
  if (!ctx) return
  frameCount++
  updateLight()
  ctx.clearRect(0, 0, W, H)

  if (mouse.x > -999 && Date.now() - mouse.last > 1600) {
    mouse.x = -9999
    mouse.y = -9999
  }

  // 阴影层：荷叶影 + 鱼影画进离屏层后放大贴回，一次性得到柔和投影
  if (beginShadowLayer()) {
    for (let ld = 0; ld < decoLeaves.length; ld++) drawLeafCache(shadowCtx, decoLeaves[ld], 'cacheShadow')
    for (let l = 0; l < leaves.length; l++) drawLeafCache(shadowCtx, leaves[l], 'cacheShadow')

    for (let i = 0; i < flock.length; i++) {
      const k1 = flock[i]
      if (!k1.active) continue
      drawShadow(k1)
      drawShadowTail(k1)
    }
    flushShadowLayer()
  }

  for (let j = 0; j < flock.length; j++) {
    const k = flock[j]
    if (!k.active) {
      if (frameCount >= k.bornFrame) {
        k.active = true
        ripples.push(makeRipple(k.pos.x, k.pos.y, true))
      } else {
        continue
      }
    }
    edges(k)
    updateKoi(k)
    // 绘制顺序（全部读骨骼 k.sk）：尾腹色层 → 胸鳍/尾鳍(素材) → 主色层 → 暗部反光 → 背脊线
    drawTail(k)
    drawPectoralTail(k)
    drawBody(k)
    drawBodyLight(k)
    drawBackLine(k)
  }

  if (frameCount % 30 === 0) ripples.push(makeRipple(rnd(0, W), rnd(0, H), false))
  if (ripples.length > 220) ripples.splice(0, ripples.length - 220)
  for (let r = ripples.length - 1; r >= 0; r--) {
    const rp = ripples[r]
    rp.size += rp.sizeStep
    rp.lifespan -= rp.lifeStep
    if (rp.lifespan < 0) {
      ripples.splice(r, 1)
      continue
    }
    drawRipple(rp)
  }

  // 荷叶面画在最上层，鱼从叶下游过时被遮住
  for (let ld = 0; ld < decoLeaves.length; ld++) drawLeafCache(ctx, decoLeaves[ld], 'cacheSurface')
  for (let l = 0; l < leaves.length; l++) drawLeafCache(ctx, leaves[l], 'cacheSurface')
}

const reduced =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
let last = 0
let frameMin = 1000 / 30
function loop(ts) {
  rafId = requestAnimationFrame(loop)
  if (ts - last < frameMin) return
  last = ts
  frame()
}

function placeLeaves() {
  leaves[1].x = W - 100
  leaves[1].y = H - 100
  for (let d = 0; d < decoLeaves.length; d++) {
    decoLeaves[d].x = decoLeaves[d].fx * W
    decoLeaves[d].y = decoLeaves[d].fy * H
  }
}

/**
 * mount(host, opts) — 在宿主容器内创建全屏 canvas 并启动锦鲤池塘。
 * @param {HTMLElement} host 容器（fixed/absolute，样式由主题 CSS 负责）
 * @param {{koi?: number, fps?: number, scheme?: string|null}} opts
 * @returns {() => void} cleanup — 停止动画并移除 canvas
 */
function mount(host, opts = {}) {
  if (started || !host) return () => {}
  container = host

  canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  host.append(canvas)
  ctx = canvas.getContext('2d')
  if (!ctx) {
    canvas.remove()
    return () => {}
  }

  const cfg = { koi: opts.koi ?? 12, fps: opts.fps ?? 30 }
  frameMin = 1000 / cfg.fps
  FPS = cfg.fps

  dpr = Math.min(window.devicePixelRatio || 1, 2)
  W = window.innerWidth
  H = window.innerHeight
  // 初始尺寸（leaves 尚未创建，不能走 resizeCanvas→placeLeaves）
  canvas.width = Math.floor(W * dpr)
  canvas.height = Math.floor(H * dpr)
  canvas.style.width = W + 'px'
  canvas.style.height = H + 'px'
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  scheme = resolveScheme(opts.scheme ?? localStorage.getItem('koi-scheme'))
  PERC = scheme.mods.perc

  // 预热胸鳍/尾鳍素材（当前配色）：浏览器异步解码染色，尽早让首帧就有鳍；
  // 之后 setScheme 换色时 getFinSprite 按新 color2 懒烘/缓存，无需额外接线。
  getFinSprite('pec', scheme.c2)
  getFinSprite('tail', scheme.c2)

  // 荷叶/阴影配色跟随主题（暗色模式压暗）
  syncLeafPalette()
  syncShadowPalette()
  let themeObserver = null
  if (typeof MutationObserver !== 'undefined') {
    const onThemeChange = () => {
      syncLeafPalette()
      syncShadowPalette()
      buildLeafCaches() // 位图里烘死了配色，换主题必须重烤
    }
    themeObserver = new MutationObserver(onThemeChange)
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
  }

  leaves = [spawnLeaf(100, 100, 0.4, 100, 1), spawnLeaf(0, 0, 1, 40, 1)]
  decoLeaves = []
  for (let di = 0; di < DECO_COUNT; di++) {
    const dl = spawnLeaf(0, 0, rnd(0.6, 1.4), rnd(16, 32), rnd(0.28, 0.45))
    dl.fx = rnd(0.08, 0.92)
    dl.fy = rnd(0.08, 0.92)
    decoLeaves.push(dl)
  }
  placeLeaves()
  buildLeafCaches()

  const koiCount = Math.max(4, cfg.koi + scheme.mods.number)
  flock = []
  for (let i = 0; i < koiCount; i++) flock.push(makeKoi(i))

  function onPointerMove(e) {
    const nx = e.clientX
    const ny = e.clientY
    if (mouse.x > -999) {
      mouse.vx = mouse.vx * 0.6 + (nx - mouse.x) * 0.4
      mouse.vy = mouse.vy * 0.6 + (ny - mouse.y) * 0.4
    }
    mouse.x = nx
    mouse.y = ny
    mouse.last = Date.now()
    if (drawing) {
      const dx = nx - lastRX
      const dy = ny - lastRY
      if (dx * dx + dy * dy > 26 * 26) {
        ripples.push(makeRipple(nx, ny, true))
        lastRX = nx
        lastRY = ny
      }
    }
  }
  function onPointerDown(e) {
    drawing = true
    lastRX = e.clientX
    lastRY = e.clientY
    ripples.push(makeRipple(lastRX, lastRY, false))
    mouse.x = lastRX
    mouse.y = lastRY
    mouse.last = Date.now()
    // 很近的点击会惊吓附近的鱼 → 进入逃跑态（往最近的边缘冲）
    koiStartle(lastRX, lastRY)
  }
  function onPointerUp() {
    drawing = false
  }
  function resizeCanvas() {
    if (!canvas || !ctx) return
    const prevDpr = dpr
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    W = window.innerWidth
    H = window.innerHeight
    canvas.width = Math.floor(W * dpr)
    canvas.height = Math.floor(H * dpr)
    canvas.style.width = W + 'px'
    canvas.style.height = H + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    placeLeaves()
    if (dpr !== prevDpr) buildLeafCaches() // 位图分辨率跟随设备像素比
  }
  function onVis() {
    if (document.hidden) {
      if (rafId) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
    } else if (!reduced) {
      rafId = requestAnimationFrame(loop)
    }
  }

  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('pointerdown', onPointerDown, { passive: true })
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  window.addEventListener('blur', onPointerUp)
  window.addEventListener('resize', resizeCanvas)
  document.addEventListener('visibilitychange', onVis)

  if (reduced) {
    for (let ri = 0; ri < flock.length; ri++) flock[ri].active = true
    frame()
  } else {
    rafId = requestAnimationFrame(loop)
  }

  // 实时换色（不重建鱼群）
  const setScheme = function (id) {
    const next = id && id !== 'random' ? getScheme(id) : null
    const s = next ?? pickRandomScheme()
    scheme = s
    PERC = s.mods.perc
    for (let i = 0; i < flock.length; i++) {
      const k = flock[i]
      k.color = s.c
      k.color2 = s.c2
      k.baseSize = k.baseSize0 + s.mods.size
      k.maxSpeed = 3.5 + s.mods.speed
    }
    try {
      localStorage.setItem('koi-scheme', id || 'random')
    } catch {}
  }
  setSchemeRef = setScheme
  window.__koiSetScheme = setScheme

  started = true

  return function cleanup() {
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    if (themeObserver) {
      themeObserver.disconnect()
      themeObserver = null
    }
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerdown', onPointerDown)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerUp)
    window.removeEventListener('blur', onPointerUp)
    window.removeEventListener('resize', resizeCanvas)
    document.removeEventListener('visibilitychange', onVis)
    if (canvas) canvas.remove()
    canvas = null
    ctx = null
    for (const lf of leaves.concat(decoLeaves)) {
      lf.cacheShadow = null
      lf.cacheSurface = null
    }
    flock = []
    leaves = []
    decoLeaves = []
    ripples = []
    shadowCanvas = null
    shadowCtx = null
    started = false
    if (window.__koiSetScheme === setSchemeRef) delete window.__koiSetScheme
  }
}

const KoiPond = { mount }




/**
 * koi-pond · 客户端入口（Cordis 插件）
 * 锦鲤池塘主题：注入 design-token CSS、挂载 Canvas 锦鲤池塘动画（carps.top koiPond 移植）、
 * 水波涟漪装饰层与锦鲤剪影。卸载时由 effect disposer 完整还原。
 * 构建时 scripts/build.mjs 会把 css/*.css 内联进 CSS 占位符、并把 koi 模块合并进同一 factory。
 */


const SKIN_ATTR = 'data-dsh-koi-pond'
const STYLE_ID = 'koi-pond-style'
const RIPPLE_ID = 'koi-pond-ripple'
const POND_HOST_ID = 'koi-pond-dsh'
const SCRIM_ID = 'koi-pond-scrim'

function apply() {
  const body = document.body
  const owned = []
  const originalAttr = body.getAttribute(SKIN_ATTR)

  // 1. 作用域属性
  body.setAttribute(SKIN_ATTR, '')

  // 2. 注入设计令牌 + 部件 CSS（构建时内联）
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = "/* ===== base.css ===== */\n/* ============================================================\r\n   koi-pond · base.css — 共享基础（任何部件都加载）\r\n   设计令牌：锦鲤池塘意象\r\n   深色 = 池塘夜色（墨青池水 / 月光文字 / 锦鲤橙红）\r\n   浅色 = 宣纸日色（米白宣纸 / 墨色文字 / 朱红锦鲤）\r\n   作用域：body[data-dsh-koi-pond]\r\n   ============================================================ */\r\n\r\n/* ---------- 深色 · 池塘夜色（默认） ---------- */\r\nbody[data-dsh-koi-pond] {\r\n  color: #e6f0e9;\r\n\r\n  /* 自有令牌：锦鲤池塘色板（蓝调池水） */\r\n  --koi-bg-0: #0a1118;          /* 池底墨蓝（页面最深处） */\r\n  --koi-bg-1: #0e1822;          /* 中层池水 */\r\n  --koi-bg-2: #14222e;          /* 池面（侧栏/卡片） */\r\n  --koi-bg-3: #192b38;          /* 抬升层 */\r\n  --koi-bg-4: #203747;          /* hover 层 */\r\n  --koi-ink-1: #e6f0e9;         /* 月光白（主文字） */\r\n  --koi-ink-2: #a9c4b4;         /* 次级文字 */\r\n  --koi-ink-3: #7c9a89;         /* 三级文字 */\r\n  --koi-ink-4: #5c7a6a;         /* 弱化文字 */\r\n  --koi-accent: #f26a3c;        /* 锦鲤橙红（主强调） */\r\n  --koi-accent-hi: #ff8a5c;     /* 锦鲤亮橙 */\r\n  --koi-gold: #d9a441;          /* 金鳞 */\r\n  --koi-lotus: #3fae7a;         /* 荷叶绿（辅助，UI 偏蓝用独立色值） */\r\n  --koi-water: #4fb8c9;         /* 水光蓝 */\r\n  --koi-border-1: #243a4e;\r\n  --koi-border-2: #2e4a5e;\r\n  --koi-border-3: #40607a;\r\n  --koi-glass: #0e1822b8;       /* 水光玻璃 */\r\n  --koi-shadow: 0 18px 48px #00000059, 0 2px 8px #0000003d;\r\n\r\n  /* 覆盖 DSH 官方设计令牌（dsw-alias） */\r\n  --dsw-alias-bg-base: transparent;\r\n  --dsw-alias-bg-layer-1: #0e1822e6;\r\n  --dsw-alias-bg-layer-2: #14222eeb;\r\n  --dsw-alias-bg-layer-3: #192b38f0;\r\n  --dsw-alias-bg-overlay: #0a1118f7;\r\n  --dsw-alias-border-l1: #2e4a5e33;\r\n  --dsw-alias-border-l2-darkmode-thin: #40607a40;\r\n  --dsw-alias-border-l2: #40607a4d;\r\n  --dsw-alias-border-l3: #f26a3ca3;\r\n  --dsw-alias-brand-primary: #f26a3c;\r\n  --dsw-alias-brand-text: #ffe7dc;\r\n  --dsw-alias-button-elevated-fill: #192b38f0;\r\n  --dsw-alias-button-floating-fill: #14222ef5;\r\n  --dsw-alias-button-floating-hover: #203747;\r\n  --dsw-alias-button-info-fill: #40a8c9;\r\n  --dsw-alias-button-info-hover: #52b8d6;\r\n  --dsw-alias-interactive-bg-active: #f26a3c3d;\r\n  --dsw-alias-interactive-bg-hover: #40a8c924;\r\n  --dsw-alias-interactive-bg-hover-solid: #203747;\r\n  --dsw-alias-label-primary: #e6f0e9;\r\n  --dsw-alias-label-primary-bluish: #cde0d3;\r\n  --dsw-alias-label-secondary: #a9c4b4;\r\n  --dsw-alias-label-tertiary: #7c9a89;\r\n  --dsw-alias-label-caption: #64806f;\r\n  --dsw-alias-label-dimmed: #4d6657;\r\n  --dsw-alias-state-business-primary: #f26a3c;\r\n  --dsw-alias-state-business-tertiary: #2e4a5e;\r\n  --dsw-alias-state-warn-tertiary: #d9a44133;\r\n  --dsw-alias-state-warn-label: #e5b860;\r\n  --dsw-alias-state-danger-tertiary: #f26a3c2e;\r\n  --dsw-alias-state-danger-label: #ff8a5c;\r\n  --dsw-alias-markdown-code-block: #0e1822f7;\r\n  --dsw-specific-input-major: #14222ee0;\r\n  --dsw-specific-selector: #192b38e6;\r\n  --dsw-specific-sidebar-fill: #0b141ee6;\r\n  --dsw-specific-sidebar-nav-item-active-accent: #f26a3c42;\r\n  --dsw-shadow-lv1: 0 2px 10px #00000033;\r\n  --dsw-shadow-lv2: var(--koi-shadow);\r\n\r\n  background-color: var(--koi-bg-0);\r\n}\r\n\r\n/* ---------- 浅色 · 宣纸日色 ---------- */\r\nbody[data-dsh-koi-pond]:not([data-ds-dark-theme]) {\r\n  color: #1c2b24;\r\n\r\n  --koi-bg-0: #f5f3ea;\r\n  --koi-bg-1: #efece0;\r\n  --koi-bg-2: #e8e4d4;\r\n  --koi-bg-3: #faf8f0;\r\n  --koi-bg-4: #f0ecdc;\r\n  --koi-ink-1: #1c2b24;\r\n  --koi-ink-2: #46594e;\r\n  --koi-ink-3: #6d8075;\r\n  --koi-ink-4: #93a39a;\r\n  --koi-accent: #d9562f;\r\n  --koi-accent-hi: #e86a40;\r\n  --koi-gold: #b8860b;\r\n  --koi-lotus: #2e8b57;\r\n  --koi-water: #2a9db4;\r\n  --koi-border-1: #d8dce6;\r\n  --koi-border-2: #c9cede;\r\n  --koi-border-3: #b0bcd4;\r\n  --koi-glass: #faf8f0c7;\r\n  --koi-shadow: 0 14px 36px #3a4a5e24, 0 2px 8px #3a4a5e1a;\r\n\r\n  --dsw-alias-bg-base: transparent;\r\n  --dsw-alias-bg-layer-1: #efece0e6;\r\n  --dsw-alias-bg-layer-2: #e8e4d4eb;\r\n  --dsw-alias-bg-layer-3: #faf8f0f0;\r\n  --dsw-alias-bg-overlay: #f5f3eafa;\r\n  --dsw-alias-border-l1: #b0bcd433;\r\n  --dsw-alias-border-l2-darkmode-thin: #b0bcd440;\r\n  --dsw-alias-border-l2: #b0bcd44d;\r\n  --dsw-alias-border-l3: #d9562fa3;\r\n  --dsw-alias-brand-primary: #d9562f;\r\n  --dsw-alias-brand-text: #5c2415;\r\n  --dsw-alias-button-elevated-fill: #faf8f0f0;\r\n  --dsw-alias-button-floating-fill: #faf8f0f5;\r\n  --dsw-alias-button-floating-hover: #f0ecdc;\r\n  --dsw-alias-button-info-fill: #2e8ba8;\r\n  --dsw-alias-button-info-hover: #38a5bd;\r\n  --dsw-alias-interactive-bg-active: #d9562f3d;\r\n  --dsw-alias-interactive-bg-hover: #2e8ba81f;\r\n  --dsw-alias-interactive-bg-hover-solid: #f0ecdc;\r\n  --dsw-alias-label-primary: #1c2b24;\r\n  --dsw-alias-label-primary-bluish: #2c3d33;\r\n  --dsw-alias-label-secondary: #46594e;\r\n  --dsw-alias-label-tertiary: #6d8075;\r\n  --dsw-alias-label-caption: #93a39a;\r\n  --dsw-alias-label-dimmed: #a8b5ad;\r\n  --dsw-alias-state-business-primary: #d9562f;\r\n  --dsw-alias-state-business-tertiary: #e8e4d4;\r\n  --dsw-alias-state-warn-tertiary: #b8860b24;\r\n  --dsw-alias-state-warn-label: #8a6508;\r\n  --dsw-alias-state-danger-tertiary: #d9562f24;\r\n  --dsw-alias-state-danger-label: #c2451f;\r\n  --dsw-alias-markdown-code-block: #efece0f7;\r\n  --dsw-specific-input-major: #faf8f0e0;\r\n  --dsw-specific-selector: #f0ecdce6;\r\n  --dsw-specific-sidebar-fill: #e8e4d4e6;\r\n  --dsw-specific-sidebar-nav-item-active-accent: #d9562f38;\r\n  --dsw-shadow-lv1: 0 2px 8px #3a4a5e1a;\r\n  --dsw-shadow-lv2: var(--koi-shadow);\r\n\r\n  background-color: var(--koi-bg-0);\r\n}\r\n\r\n/* ---------- 全局基础 ---------- */\r\nbody[data-dsh-koi-pond] [id='root'] {\r\n  background: transparent;\r\n  position: relative;\r\n}\r\n\r\nbody[data-dsh-koi-pond] ::selection {\r\n  background: var(--koi-accent);\r\n  color: #fff;\r\n}\r\n\r\nbody[data-dsh-koi-pond] :focus-visible {\r\n  outline-color: var(--koi-accent);\r\n}\r\n\r\n/* 滚动条：池水青 */\r\nbody[data-dsh-koi-pond] *::-webkit-scrollbar {\r\n  width: 10px;\r\n  height: 10px;\r\n}\r\nbody[data-dsh-koi-pond] *::-webkit-scrollbar-thumb {\r\n  background: var(--koi-border-2);\r\n  border-radius: 6px;\r\n  border: 2px solid transparent;\r\n  background-clip: content-box;\r\n}\r\nbody[data-dsh-koi-pond] *::-webkit-scrollbar-thumb:hover {\r\n  background: var(--koi-border-3);\r\n  border: 2px solid transparent;\r\n  background-clip: content-box;\r\n}\r\nbody[data-dsh-koi-pond] *::-webkit-scrollbar-track {\r\n  background: transparent;\r\n}\r\n\r\n/* 主题切换过渡：仅颜色，避免闪烁 */\r\nbody[data-dsh-koi-pond] * {\r\n  transition-property: background-color, border-color, color, box-shadow;\r\n  transition-duration: 0.18s;\r\n  transition-timing-function: ease;\r\n}\r\nbody[data-dsh-koi-pond] [data-skin-chrome],\r\nbody[data-dsh-koi-pond] [data-koi-ripple] {\r\n  transition: none;\r\n}\r\n@media (prefers-reduced-motion: reduce) {\r\n  body[data-dsh-koi-pond] * {\r\n    transition: none;\r\n    animation: none;\r\n  }\r\n}\r\n\n\n/* ===== background.css ===== */\n/* ============================================================\n   koi-pond · background.css — 池水背景部件\n   墨青池水渐变 + 缓慢涟漪动画 + 右下角锦鲤剪影\n   ============================================================ */\n\nbody[data-dsh-koi-pond] {\n  /* 池水：由深至浅的纵向渐变（蓝调），底部透出一点幽光 */\n  background-image:\n    radial-gradient(120% 90% at 50% -10%, #16283a 0%, transparent 55%),\n    radial-gradient(90% 70% at 85% 110%, #103a524d 0%, transparent 60%),\n    linear-gradient(180deg, var(--koi-bg-0) 0%, var(--koi-bg-1) 100%);\n  background-attachment: fixed;\n}\n\nbody[data-dsh-koi-pond]:not([data-ds-dark-theme]) {\n  background-image:\n    radial-gradient(120% 90% at 50% -10%, #fffdf4 0%, transparent 55%),\n    radial-gradient(90% 70% at 85% 110%, #2a9db414 0%, transparent 60%),\n    linear-gradient(180deg, var(--koi-bg-0) 0%, var(--koi-bg-1) 100%);\n}\n\n/* ---------- 涟漪层（纯装饰，pointer-events: none） ---------- */\nbody[data-dsh-koi-pond] [data-koi-ripple] {\n  position: fixed;\n  inset: 0;\n  z-index: 0;\n  pointer-events: none;\n  overflow: hidden;\n  background-image:\n    radial-gradient(circle at 20% 30%, transparent 0 6px, #4fb8c90f 6.5px, transparent 7px),\n    radial-gradient(circle at 72% 62%, transparent 0 10px, #4fb8c90a 10.5px, transparent 11px),\n    radial-gradient(circle at 88% 22%, transparent 0 4px, #f26a3c0d 4.5px, transparent 5px);\n  animation: koi-ripple-drift 26s ease-in-out infinite alternate;\n}\n\n@keyframes koi-ripple-drift {\n  0% { transform: translateY(0) scale(1); opacity: 0.9; }\n  100% { transform: translateY(-14px) scale(1.06); opacity: 0.55; }\n}\n\n/* 单圈涟漪：缓慢扩散的水波环 */\nbody[data-dsh-koi-pond] [data-koi-ripple]::before,\nbody[data-dsh-koi-pond] [data-koi-ripple]::after {\n  content: '';\n  position: absolute;\n  border-radius: 50%;\n  border: 1px solid #4fb8c91f;\n  animation: koi-ripple-ring 9s linear infinite;\n}\nbody[data-dsh-koi-pond] [data-koi-ripple]::before {\n  width: 220px;\n  height: 220px;\n  left: 18%;\n  bottom: 22%;\n}\nbody[data-dsh-koi-pond] [data-koi-ripple]::after {\n  width: 140px;\n  height: 140px;\n  right: 26%;\n  bottom: 30%;\n  animation-delay: 4.5s;\n  border-color: #f26a3c1c;\n}\n\n@keyframes koi-ripple-ring {\n  0% { transform: scale(0.35); opacity: 0; }\n  18% { opacity: 1; }\n  100% { transform: scale(1.6); opacity: 0; }\n}\n\n/* ---------- 池水雾面层 —— 沉到 canvas 之下，只压池水渐变 ----------\n   原实现是全屏 backdrop-filter: blur(2px) 盖在 canvas 之上，两个问题：\n   1) 把锦鲤与荷叶一起糊掉，细节全丢；\n   2) canvas 每帧都在变，backdrop 每帧都要重算，全屏 GPU 开销。\n   改为 scrim 置于 canvas 下层（z-index 0 / canvas z-index 1），\n   用渐变雾面替代实时模糊，只作用于 body 的池水渐变。 */\nbody[data-dsh-koi-pond] #koi-pond-dsh #koi-pond-scrim {\n  position: absolute;\n  inset: 0;\n  z-index: 0;\n  pointer-events: none;\n  /* 暗色：顶部一缕冷月光，底部沉入墨色 */\n  background: linear-gradient(180deg, #78bed70d 0%, #06121e1f 100%);\n}\n\nbody[data-dsh-koi-pond]:not([data-ds-dark-theme]) #koi-pond-dsh #koi-pond-scrim {\n  /* 亮色：宣纸日色由外向内收，底部透一点水色 */\n  background: linear-gradient(180deg, #fffdf43d 0%, #2a9db40d 100%);\n}\n\n/* ---------- Canvas 锦鲤池塘（carps.top koiPond 移植） ---------- */\nbody[data-dsh-koi-pond] #koi-pond-dsh {\n  position: fixed;\n  inset: 0;\n  z-index: -1;\n  pointer-events: none;\n  overflow: hidden;\n}\nbody[data-dsh-koi-pond] #koi-pond-dsh canvas {\n  display: block;\n  position: absolute;\n  inset: 0;\n  z-index: 1;\n}\n\n/* 减动效：涟漪与锦鲤静止 */\n@media (prefers-reduced-motion: reduce) {\n  body[data-dsh-koi-pond] [data-koi-ripple] {\n    animation: none;\n  }\n  body[data-dsh-koi-pond] [data-koi-ripple]::before,\n  body[data-dsh-koi-pond] [data-koi-ripple]::after {\n    animation: none;\n  }\n}\n\n\n/* ===== sidebar.css ===== */\n/* ============================================================\r\n   koi-pond · sidebar.css — 侧栏部件\r\n   深池水渐变 + 锦鲤金选中态 + 竹节分隔线\r\n   ============================================================ */\r\n\r\nbody[data-dsh-koi-pond] :is([data-pane='sidebar'], [class*='sidebarCol']) {\r\n  --dsw-alias-label-primary: var(--koi-ink-1);\r\n  --dsw-alias-label-secondary: var(--koi-ink-2);\r\n  --dsw-alias-label-tertiary: var(--koi-ink-3);\r\n  --dsw-alias-label-caption: var(--koi-ink-4);\r\n  --dsw-alias-border-l1: var(--koi-border-1);\r\n  --dsw-alias-border-l2: var(--koi-border-2);\r\n  --dsw-alias-button-elevated-fill: var(--koi-bg-3);\r\n  --dsw-alias-button-floating-hover: var(--koi-bg-4);\r\n  --dsw-alias-interactive-bg-hover: #40a8c91a;\r\n  --dsw-alias-interactive-bg-active: #f26a3c33;\r\n\r\n  z-index: auto;\r\n  background: transparent;\r\n  border-right: 0;\r\n  position: relative;\r\n}\r\n\r\n/* 侧栏池水底：纵向渐变 + 隐约水纹 */\r\nbody[data-dsh-koi-pond] :is([data-pane='sidebar'], [class*='sidebarCol']) > div {\r\n  background:\r\n    radial-gradient(120% 60% at 50% 0%, #1c34294d 0%, transparent 60%),\r\n    linear-gradient(180deg, var(--koi-bg-1) 0%, var(--koi-bg-2) 100%);\r\n  position: relative;\r\n  overflow: hidden;\r\n  box-shadow: inset -1px 0 var(--koi-border-1);\r\n}\r\n\r\n/* Logo 行：宣纸衬底 + 锦鲤描边 */\r\nbody[data-dsh-koi-pond] [class*='logoRow'] {\r\n  background: linear-gradient(135deg, #f26a3c14 0%, transparent 46%),\r\n    linear-gradient(180deg, var(--koi-bg-3) 0%, var(--koi-bg-2) 100%);\r\n  border: 1px solid var(--koi-border-2);\r\n  border-radius: 12px;\r\n  min-height: 58px;\r\n  margin: 10px 10px 4px;\r\n  padding: 8px 10px;\r\n  box-shadow: inset 0 0 0 1px #ffffff08, 0 6px 16px #00000026;\r\n}\r\nbody[data-dsh-koi-pond] [class*='logoRow'] button[class*='brand'] {\r\n  color: var(--koi-ink-1);\r\n}\r\n\r\n/* 新建会话按钮：锦鲤橙红渐变 */\r\nbody[data-dsh-koi-pond] button[class*='newSession'] {\r\n  color: #fff6ef;\r\n  background: linear-gradient(135deg, var(--koi-accent-hi) 0%, var(--koi-accent) 55%, #d94a24 100%);\r\n  border: 0;\r\n  border-radius: 10px;\r\n  min-height: 40px;\r\n  margin: 8px 10px;\r\n  font-weight: 600;\r\n  letter-spacing: 0.02em;\r\n  box-shadow: 0 4px 12px #f26a3c40, inset 0 1px #ffffff2e;\r\n  transition: filter 0.15s, transform 0.15s, box-shadow 0.15s;\r\n}\r\nbody[data-dsh-koi-pond] button[class*='newSession']:hover {\r\n  filter: brightness(1.06);\r\n  transform: translateY(-1px);\r\n  box-shadow: 0 6px 16px #f26a3c59, inset 0 1px #ffffff2e;\r\n}\r\nbody[data-dsh-koi-pond] button[class*='newSession'] svg {\r\n  color: #fff6ef;\r\n}\r\n\r\n/* 分组标题 */\r\nbody[data-dsh-koi-pond] [class*='sectionHeader'] {\r\n  color: var(--koi-ink-3);\r\n  letter-spacing: 0.04em;\r\n  font-size: 12px;\r\n}\r\nbody[data-dsh-koi-pond] [class*='sectionHeader'] [class*='sectionLabel'] {\r\n  color: var(--koi-ink-3);\r\n}\r\n\r\n/* 搜索框 */\r\nbody[data-dsh-koi-pond] :is([data-pane='sidebar'], [class*='sidebarCol'])\r\n  [class*='search'][class*='searchExpanded']:has(> input[class*='searchInput']) {\r\n  background: var(--koi-bg-3);\r\n  border: 1px solid var(--koi-border-2);\r\n  border-radius: 9px;\r\n  height: 40px;\r\n  margin: 0 10px;\r\n  padding-inline: 12px;\r\n  box-shadow: inset 0 1px 3px #0000001f;\r\n}\r\nbody[data-dsh-koi-pond] :is([data-pane='sidebar'], [class*='sidebarCol'])\r\n  [class*='search'][class*='searchExpanded']:has(> input[class*='searchInput']):focus-within {\r\n  border-color: var(--koi-accent);\r\n  box-shadow: inset 0 1px 3px #0000001f, 0 0 0 2px #f26a3c1f;\r\n}\r\nbody[data-dsh-koi-pond] [class*='searchInput']::placeholder {\r\n  color: var(--koi-ink-4);\r\n  opacity: 1;\r\n}\r\n\r\n/* 会话行：静谧，选中 = 锦鲤金描边 + 橙红指示条 */\r\nbody[data-dsh-koi-pond] [data-koi-session-row] {\r\n  border-radius: 8px;\r\n  margin-inline: 8px;\r\n  padding-inline: 10px;\r\n  height: 34px;\r\n}\r\nbody[data-dsh-koi-pond] :is([data-pane='sidebar'], [class*='sidebarCol']) [aria-selected='true'],\r\nbody[data-dsh-koi-pond] :is([data-pane='sidebar'], [class*='sidebarCol']) [class*='active'][role='button'] {\r\n  color: var(--koi-ink-1);\r\n  background: linear-gradient(0deg, #f26a3c24 0%, #f26a3c0a 78%, transparent 100%);\r\n  /* border-left: 2px solid var(--koi-accent); */\r\n  border-radius: 0 8px 8px 0;\r\n}\r\nbody[data-dsh-koi-pond] :is([data-pane='sidebar'], [class*='sidebarCol'])\r\n  [aria-selected='true'] [class*='title'] {\r\n  color: var(--koi-ink-1);\r\n  font-weight: 500;\r\n}\r\nbody[data-dsh-koi-pond] :is([data-pane='sidebar'], [class*='sidebarCol'])\r\n  [aria-selected='true'] [class*='time'] {\r\n  color: var(--koi-gold);\r\n}\r\nbody[data-dsh-koi-pond] :is([data-pane='sidebar'], [class*='sidebarCol'])\r\n  [role='button']:hover:not([aria-selected='true']) {\r\n  background: #40a8c914;\r\n  border-radius: 8px;\r\n}\r\n\r\n/* 侧栏底部设置区 */\r\nbody[data-dsh-koi-pond] [data-slot='sidebar.settings'] > :is(button, [role='button']) {\r\n  color: var(--koi-ink-2);\r\n  background: var(--koi-bg-3);\r\n  border: 1px solid var(--koi-border-2);\r\n  border-radius: 9px;\r\n  min-height: 42px;\r\n  box-shadow: 0 3px 8px #0000001f;\r\n}\r\nbody[data-dsh-koi-pond] [data-slot='sidebar.settings'] > :is(button, [role='button']):is(:hover, :focus-visible) {\r\n  color: var(--koi-accent);\r\n  border-color: var(--koi-border-3);\r\n  background: var(--koi-bg-4);\r\n}\r\n\r\n/* 徽标 / cordis 面板入口 */\r\nbody[data-dsh-koi-pond] [data-cordis-badge] {\r\n  color: var(--koi-ink-2);\r\n  background: var(--koi-bg-3);\r\n  border: 1px solid var(--koi-border-2);\r\n  min-height: 46px;\r\n  box-shadow: inset 0 0 0 1px #ffffff08;\r\n}\r\nbody[data-dsh-koi-pond] [data-cordis-badge]:is(:hover, :focus-visible, [data-active]) {\r\n  color: var(--koi-accent);\r\n  border-color: var(--koi-accent);\r\n}\r\n\n\n/* ===== titlebar.css ===== */\n/* ============================================================\n   koi-pond · titlebar.css — 顶栏部件\n   一线水痕分隔 + 水光微透\n   ============================================================ */\n\nbody[data-dsh-koi-pond] header[class*='header'] {\n  border-bottom: 1px solid var(--koi-border-1);\n  background: linear-gradient(180deg, #0a100e66 0%, transparent 100%);\n  backdrop-filter: blur(10px) saturate(0.9);\n}\nbody[data-dsh-koi-pond]:not([data-ds-dark-theme]) header[class*='header'] {\n  background: linear-gradient(180deg, #fffdf459 0%, transparent 100%);\n}\n\nbody[data-dsh-koi-pond] header[class*='header'] :is(nav, span, button, a, div) {\n  color: var(--koi-ink-2);\n}\nbody[data-dsh-koi-pond] header[class*='header'] button:hover {\n  color: var(--koi-accent);\n}\n\n/* Tab：选中 = 锦鲤橙下划线 */\nbody[data-dsh-koi-pond] :is([data-pane='conversation'], [class*='centerCol'])\n  button[class*='tabActive'] {\n  color: var(--koi-ink-1);\n  border-bottom-color: var(--koi-accent);\n}\nbody[data-dsh-koi-pond] :is([data-pane='conversation'], [class*='centerCol'])\n  button[class*='tab']:hover {\n  color: var(--koi-ink-1);\n}\n\n/* 顶栏计数/元信息弱化 */\nbody[data-dsh-koi-pond] header[class*='header'] :is([class*='counter'], [class*='caption'], [class*='meta']) {\n  color: var(--koi-ink-4);\n}\n\n/* 聚焦环 */\nbody[data-dsh-koi-pond] header[class*='header'] :is(button, [role='tab']):focus-visible {\n  outline-offset: 2px;\n  border-radius: 4px;\n  outline: 1px solid var(--koi-accent);\n  box-shadow: 0 0 0 2px #f26a3c2e;\n}\n\n\n/* ===== composer.css ===== */\n/* ============================================================\r\n   koi-pond · composer.css — 输入区部件\r\n   水光玻璃卡片 + 锦鲤描边 + 橙红主按钮\r\n   ============================================================ */\r\n\r\nbody[data-dsh-koi-pond] [data-composer-card] {\r\n  --dsw-alias-bg-base: transparent;\r\n  background:\r\n    linear-gradient(180deg, #ffffff14 0%, transparent 40%),\r\n    var(--koi-glass);\r\n  border: 1px solid var(--koi-border-2);\r\n  border-radius: 22px;\r\n  box-shadow: var(--koi-shadow), inset 0 1px #ffffff14;\r\n  backdrop-filter: blur(14px) saturate(0.92);\r\n  min-height: 0;\r\n  overflow: visible;\r\n}\r\nbody[data-dsh-koi-pond]:not([data-ds-dark-theme]) [data-composer-card] {\r\n  background:\r\n    linear-gradient(180deg, #ffffff73 0%, transparent 40%),\r\n    var(--koi-glass);\r\n  box-shadow: var(--koi-shadow), inset 0 1px #ffffffb8;\r\n}\r\n\r\n/* 聚焦态：锦鲤橙描边 */\r\nbody[data-dsh-koi-pond] [data-composer-card]:focus-within {\r\n  border-color: var(--koi-accent);\r\n  box-shadow: var(--koi-shadow), 0 0 0 2px #f26a3c21, inset 0 1px #ffffff14;\r\n}\r\n\r\nbody[data-dsh-koi-pond] [data-composer-card] textarea {\r\n  caret-color: var(--koi-accent);\r\n}\r\nbody[data-dsh-koi-pond] [data-composer-card] textarea::placeholder {\r\n  color: var(--koi-ink-4);\r\n  opacity: 1;\r\n}\r\n\r\n/* 输入区圆形工具按钮 */\r\nbody[data-dsh-koi-pond] [data-composer-card] button[class*='add'],\r\nbody[data-dsh-koi-pond] [data-composer-card] [class*='modes'] button[class*='trigger']:has([class*='triggerIcon']) {\r\n  color: var(--koi-ink-2);\r\n  background: var(--koi-bg-3);\r\n  border: 1px solid var(--koi-border-2);\r\n  /* border-radius: 50%; */\r\n  box-shadow: inset 0 0 0 1px #ffffff0a;\r\n}\r\nbody[data-dsh-koi-pond] [data-composer-card] button[class*='add']:hover,\r\nbody[data-dsh-koi-pond] [data-composer-card] [class*='modes'] button[class*='trigger']:hover {\r\n  color: var(--koi-accent);\r\n  border-color: var(--koi-border-3);\r\n  transform: translateY(-1px);\r\n}\r\n\r\n/* 主发送按钮：锦鲤橙红 */\r\nbody[data-dsh-koi-pond] [data-composer-card] button[class*='primary'] {\r\n  color: #fff6ef;\r\n  background: linear-gradient(135deg, var(--koi-accent-hi) 0%, var(--koi-accent) 60%, #d94a24 100%);\r\n  border: 0;\r\n  border-radius: 50%;\r\n  box-shadow: 0 4px 12px #f26a3c3d, inset 0 1px #ffffff2e;\r\n  transition: filter 0.15s, transform 0.15s, box-shadow 0.15s;\r\n}\r\nbody[data-dsh-koi-pond] [data-composer-card] button[class*='primary']:hover:not(:disabled) {\r\n  filter: brightness(1.07);\r\n  transform: translateY(-1px);\r\n  box-shadow: 0 6px 16px #f26a3c52, inset 0 1px #ffffff2e;\r\n}\r\nbody[data-dsh-koi-pond] [data-composer-card] button[class*='primary']:disabled {\r\n  opacity: 0.55;\r\n}\r\n\r\n/* 输入区底部 dock 工具条 */\r\nbody[data-dsh-koi-pond] [data-slot='conversation.composer.dock'] > * {\r\n  color: var(--koi-ink-3);\r\n  background: linear-gradient(90deg, transparent, #40a8c90d 10% 90%, transparent);\r\n}\r\nbody[data-dsh-koi-pond] [data-slot='conversation.composer.dock'] > * [class*='sep'] {\r\n  color: var(--koi-ink-4);\r\n}\r\n\r\n/* 模式/模型选择按钮 */\r\nbody[data-dsh-koi-pond] [data-composer-card] [class*='trailing'] button[aria-haspopup='menu'] {\r\n  color: var(--koi-ink-2);\r\n  background: transparent;\r\n  border-radius: 9px;\r\n}\r\nbody[data-dsh-koi-pond] [data-composer-card] [class*='trailing'] button[aria-haspopup='menu']:hover {\r\n  color: var(--koi-accent);\r\n  background: #40a8c90f;\r\n}\r\n\n\n/* ===== overlay.css ===== */\n/* ============================================================\r\n   koi-pond · overlay.css — 弹层/对话框部件\r\n   统一 z-index 变量 + 水光玻璃面板\r\n   ============================================================ */\r\n\r\nbody[data-dsh-koi-pond] {\r\n  /* 弹层 z-index 统一治理（统一层级变量，规避弹层撞车） */\r\n  --koi-z-dropdown: 900;\r\n  --koi-z-popover: 950;\r\n  --koi-z-modal: 1000;\r\n  --koi-z-toast: 1050;\r\n}\r\n\r\nbody[data-dsh-koi-pond] [role='dialog'][aria-modal='true'],\r\nbody[data-dsh-koi-pond] [data-cordis-panel] {\r\n  z-index: var(--koi-z-modal);\r\n  --dsw-alias-bg-base: var(--koi-bg-3);\r\n  --dsw-alias-label-primary: var(--koi-ink-1);\r\n  --dsw-alias-label-secondary: var(--koi-ink-2);\r\n  --dsw-alias-label-tertiary: var(--koi-ink-3);\r\n  --dsw-alias-label-caption: var(--koi-ink-4);\r\n  --dsw-alias-border-l1: var(--koi-border-1);\r\n  --dsw-alias-border-l2: var(--koi-border-2);\r\n  --dsw-alias-interactive-bg-hover: #40a8c91a;\r\n  --dsw-alias-state-warn-tertiary: #d9a44124;\r\n  --dsw-alias-state-warn-label: var(--koi-gold);\r\n\r\n  color: var(--koi-ink-1);\r\n  backdrop-filter: blur(18px) saturate(0.9);\r\n  background: linear-gradient(145deg, var(--koi-bg-3) 0%, var(--koi-bg-2) 100%);\r\n  border: 1px solid var(--koi-border-2);\r\n  border-radius: 14px;\r\n  box-shadow: var(--koi-shadow), inset 0 0 0 1px #ffffff0d;\r\n}\r\n\r\nbody[data-dsh-koi-pond] [role='dialog'][aria-modal='true'] > header,\r\nbody[data-dsh-koi-pond] [data-cordis-panel] > header {\r\n  background: var(--koi-bg-3);\r\n  border-bottom: 1px solid var(--koi-border-1);\r\n  color: var(--koi-ink-1);\r\n}\r\n\r\nbody[data-dsh-koi-pond] [data-cordis-row] {\r\n  background: var(--koi-bg-3);\r\n  box-shadow: inset 0 1px #ffffff0a;\r\n  border: 1px solid var(--koi-border-1);\r\n  border-radius: 9px;\r\n}\r\nbody[data-dsh-koi-pond] [data-cordis-row][data-cordis-awaiting] {\r\n  border-color: var(--koi-gold);\r\n  box-shadow: inset 0 0 0 1px #d9a44126, 0 4px 12px #0000002b;\r\n}\r\n\r\nbody[data-dsh-koi-pond] [data-cordis-panel] :is([data-cordis-approve], [data-cordis-approve-plugin], [data-cordis-decline]) {\r\n  color: var(--koi-ink-1);\r\n  background: var(--koi-bg-4);\r\n  border: 1px solid var(--koi-border-2);\r\n  border-radius: 8px;\r\n}\r\nbody[data-dsh-koi-pond] [data-cordis-panel] [data-cordis-approve] {\r\n  color: #fff6ef;\r\n  background: linear-gradient(135deg, var(--koi-accent-hi), var(--koi-accent));\r\n  border: 0;\r\n}\r\n\r\n/* 下拉菜单 / 弹窗 */\r\nbody[data-dsh-koi-pond] [role='menu'],\r\nbody[data-dsh-koi-pond] [role='listbox'],\r\nbody[data-dsh-koi-pond] [role='tooltip'] {\r\n  z-index: var(--koi-z-popover);\r\n  background: var(--koi-bg-3);\r\n  border: 1px solid var(--koi-border-2);\r\n  border-radius: 10px;\r\n  box-shadow: var(--koi-shadow);\r\n  color: var(--koi-ink-1);\r\n}\r\nbody[data-dsh-koi-pond] [role='menuitem']:hover,\r\nbody[data-dsh-koi-pond] [role='option']:hover,\r\nbody[data-dsh-koi-pond] [role='option'][aria-selected='true'] {\r\n  background: #40a8c91a;\r\n  color: var(--koi-ink-1);\r\n}\r\n\r\n/* Toast：上浮一层 */\r\nbody[data-dsh-koi-pond] [role='status'],\r\nbody[data-dsh-koi-pond] [data-toast] {\r\n  z-index: var(--koi-z-toast);\r\n  background: var(--koi-bg-3);\r\n  border: 1px solid var(--koi-border-2);\r\n  border-radius: 10px;\r\n  box-shadow: var(--koi-shadow);\r\n  color: var(--koi-ink-1);\r\n}\r\n\n\n/* ===== fonts.css ===== */\n/* ============================================================\n   koi-pond · fonts.css — 字体部件\n   中文优先的系统字体栈 + 标题衬线点缀（纸墨感）\n   ============================================================ */\n\nbody[data-dsh-koi-pond] {\n  --koi-font-ui: 'PingFang SC', 'HarmonyOS Sans SC', 'Microsoft YaHei UI',\n    'Microsoft YaHei', 'Noto Sans SC', system-ui, -apple-system, sans-serif;\n  --koi-font-serif: 'Songti SC', 'Noto Serif SC', 'STSong', 'SimSun', Georgia, serif;\n  --koi-font-mono: 'Cascadia Code', 'JetBrains Mono', 'Sarasa Mono SC',\n    Consolas, 'Courier New', monospace;\n\n  font-family: var(--koi-font-ui);\n}\n\n/* 标题/品牌处用衬线，纸墨感 */\nbody[data-dsh-koi-pond] [class*='headline'],\nbody[data-dsh-koi-pond] [class*='logoRow'] button[class*='brand'],\nbody[data-dsh-koi-pond] [class*='sectionHeader'] {\n  font-family: var(--koi-font-serif);\n}\n\n/* 代码块 */\nbody[data-dsh-koi-pond] code,\nbody[data-dsh-koi-pond] pre,\nbody[data-dsh-koi-pond] [data-terminal] {\n  font-family: var(--koi-font-mono);\n}\n\n/* 输入区 */\nbody[data-dsh-koi-pond] [data-composer-card] textarea,\nbody[data-dsh-koi-pond] [class*='searchInput'],\nbody[data-dsh-koi-pond] input,\nbody[data-dsh-koi-pond] textarea {\n  font-family: var(--koi-font-ui);\n}\n\n/* 行高/字距微调，阅读更舒展 */\nbody[data-dsh-koi-pond] [data-chat-flow] [class*='markdown'],\nbody[data-dsh-koi-pond] [data-chat-flow-kind] [class*='markdown'] {\n  line-height: 1.75;\n  letter-spacing: 0.01em;\n}\n\n\n/* ===== ui.css ===== */\n/* ============================================================\r\n   koi-pond · ui.css — 通用 UI 部件\r\n   消息气泡 / 代码块 / 状态色 / 通用按钮\r\n   ============================================================ */\r\n\r\n/* ---------- 对话消息 ---------- */\r\n\r\n/* 用户气泡：宣纸底 + 锦鲤描边 */\r\nbody[data-dsh-koi-pond] [class*='userRow'] [class*='bubble'] {\r\n  background: var(--koi-bg-3);\r\n  border: 1px solid var(--koi-border-2);\r\n  border-radius: 14px 14px 4px 14px;\r\n  box-shadow: 0 4px 14px #0000001a;\r\n  color: var(--koi-ink-1);\r\n}\r\n\r\n/* 助手消息卡：池水玻璃 */\r\nbody[data-dsh-koi-pond] [data-chat-flow-kind='assistant-step'] > * > * > * > div[class*='markdown'] {\r\n  box-sizing: border-box;\r\n  background: linear-gradient(180deg, #ffffff0d 0%, transparent 42%), var(--koi-glass);\r\n  border: 1px solid var(--koi-border-1);\r\n  border-radius: 14px 14px 14px 4px;\r\n  align-self: flex-start;\r\n  width: fit-content;\r\n  max-width: min(680px, 96%);\r\n  padding: 14px 18px;\r\n  box-shadow: 0 4px 14px #0000001f;\r\n  color: var(--koi-ink-1);\r\n}\r\nbody[data-dsh-koi-pond]:not([data-ds-dark-theme])\r\n  [data-chat-flow-kind='assistant-step'] > * > * > * > div[class*='markdown'] {\r\n  background: linear-gradient(180deg, #ffffff73 0%, transparent 42%), var(--koi-glass);\r\n  border-color: var(--koi-border-2);\r\n}\r\n\r\n/* 思考块：荷叶绿微光 */\r\nbody[data-dsh-koi-pond] [data-variant='think'] > [data-open='true'] > [data-disclosure-row='true'] {\r\n  background: #40a8c914;\r\n  border: 1px solid #40a8c92e;\r\n  border-radius: 9px;\r\n  color: var(--koi-ink-2);\r\n}\r\nbody[data-dsh-koi-pond] [data-variant='think'][data-state='running'] [class*='row']:after {\r\n  background: linear-gradient(90deg, transparent, #f26a3c40 46%, #40a8c933 62%, transparent);\r\n  width: 220px;\r\n  height: 2px;\r\n  border-radius: 2px;\r\n  left: -220px;\r\n  animation: koi-think-sweep 2.6s ease-in-out infinite;\r\n}\r\n@keyframes koi-think-sweep {\r\n  0% { opacity: 0; transform: translateX(0); }\r\n  14% { opacity: 1; }\r\n  86% { opacity: 1; }\r\n  100% { opacity: 0; transform: translateX(calc(100vw + 440px)); }\r\n}\r\n\r\n/* bash/工具块 */\r\nbody[data-dsh-koi-pond] [data-variant='bash'] {\r\n  background: var(--koi-bg-1);\r\n  border: 1px solid var(--koi-border-1);\r\n  border-radius: 9px;\r\n  color: var(--koi-ink-2);\r\n}\r\nbody[data-dsh-koi-pond] [data-terminal] {\r\n  color: var(--koi-ink-1);\r\n}\r\n\r\n/* ---------- 代码块 ---------- */\r\nbody[data-dsh-koi-pond] [class*='markdown'] pre,\r\nbody[data-dsh-koi-pond] [class*='markdown'] code {\r\n  background: var(--koi-bg-1);\r\n  border: 1px solid var(--koi-border-1);\r\n  border-radius: 8px;\r\n  color: var(--koi-ink-1);\r\n}\r\n\r\n/* ---------- 行内状态点（运行中 = 金鳞微光） ---------- */\r\nbody[data-dsh-koi-pond] [data-state='running'] :is([class*='runState'], [class*='stateDot']) {\r\n  filter: drop-shadow(0 0 6px #d9a441b3);\r\n  color: var(--koi-gold);\r\n}\r\n\r\n/* ---------- 通用按钮（非 composer） ---------- */\r\nbody[data-dsh-koi-pond] button {\r\n  border-radius: 8px;\r\n}\r\nbody[data-dsh-koi-pond] button:not([class*='primary']):not([class*='newSession']):hover {\r\n  color: var(--koi-accent);\r\n  background: #40a8c914;\r\n}\r\n\r\n/* ---------- 链接：锦鲤橙，去下划线改描边感 ---------- */\r\nbody[data-dsh-koi-pond] a {\r\n  color: var(--koi-accent);\r\n  text-decoration: none;\r\n  border-bottom: 1px solid #f26a3c3d;\r\n  transition: border-color 0.15s, color 0.15s;\r\n}\r\nbody[data-dsh-koi-pond] a:hover {\r\n  color: var(--koi-accent-hi);\r\n  border-bottom-color: var(--koi-accent);\r\n}\r\n\r\n/* ---------- 分隔线 ---------- */\r\nbody[data-dsh-koi-pond] hr,\r\nbody[data-dsh-koi-pond] [class*='divider'] {\r\n  border-color: var(--koi-border-1);\r\n}\r\n\r\n/* ---------- 表格（markdown） ---------- */\r\nbody[data-dsh-koi-pond] [class*='markdown'] table {\r\n  border-collapse: collapse;\r\n}\r\nbody[data-dsh-koi-pond] [class*='markdown'] th,\r\nbody[data-dsh-koi-pond] [class*='markdown'] td {\r\n  border: 1px solid var(--koi-border-2);\r\n  padding: 6px 12px;\r\n}\r\nbody[data-dsh-koi-pond] [class*='markdown'] th {\r\n  background: var(--koi-bg-3);\r\n  color: var(--koi-ink-1);\r\n}\r\n\r\n/* ---------- 引用块：池水青左边线 ---------- */\r\nbody[data-dsh-koi-pond] [class*='markdown'] blockquote {\r\n  border-left: 3px solid var(--koi-water);\r\n  background: #4fb8c90d;\r\n  border-radius: 0 8px 8px 0;\r\n  margin: 8px 0;\r\n  padding: 6px 14px;\r\n  color: var(--koi-ink-2);\r\n}\r\n\r\n/* ---------- 图标按钮 ---------- */\r\nbody[data-dsh-koi-pond] [class*='iconButton'] {\r\n  color: var(--koi-ink-3);\r\n  border-radius: 8px;\r\n}\r\nbody[data-dsh-koi-pond] [class*='iconButton']:hover {\r\n  color: var(--koi-accent);\r\n  background: #40a8c914;\r\n}\r\n"
  document.head.append(style)
  owned.push(style)

  // 3. Canvas 锦鲤池塘动画（carps.top koiPond 移植，透明背景）
  const pondHost = document.createElement('div')
  pondHost.id = POND_HOST_ID
  pondHost.setAttribute('aria-hidden', 'true')
  body.append(pondHost)
  owned.push(pondHost)
  const cleanupPond = KoiPond.mount(pondHost, { koi: 12, fps: 30 })

  // 4. 背景遮罩（15% 白 + 3px 模糊）——挂在容器内部，不参与全局层级
  const scrim = document.createElement('div')
  scrim.id = SCRIM_ID
  scrim.setAttribute('aria-hidden', 'true')
  pondHost.append(scrim)

  // 5. 水波涟漪装饰层（纯 CSS 动画）
  const ripple = document.createElement('div')
  ripple.id = RIPPLE_ID
  ripple.dataset.koiRipple = ''
  ripple.setAttribute('aria-hidden', 'true')
  body.append(ripple)
  owned.push(ripple)

  // 卸载还原
  return () => {
    cleanupPond()
    for (const node of owned) node.remove()
    if (originalAttr === null) body.removeAttribute(SKIN_ATTR)
    else body.setAttribute(SKIN_ATTR, originalAttr)
  }
}

		exports.apply = apply;
		return module.exports;
	}
});
