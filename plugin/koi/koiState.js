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
// avoidDir/avoidRepath：躲避的锁定逃跑方向 + 低频改判计时器（见 koiFish avoidWish ——
// C-start 语义：进躲避时锁定方向全力爆发，不逐帧跟随指针改判）
function mkFishState() {
  return {
    name: FISH_STATE.NORMAL,
    prev: FISH_STATE.NORMAL,
    t: 0,
    avoidT: 0,
    esc: null,
    avoidDir: null,
    avoidRepath: 0,
  }
}

// 躲避生效半径（px，指针中心到鱼头）
const FLEE_R = 150
// 触发迟滞带：退出躲避仍用 FLEE_R，但从普通态**再入**躲避要求更近（0.7×FLEE_R）。
// 进/出同半径时，指针在 150px 边缘晃动会让鱼「进→出→进」地反复触发躲避
// （每次 re-enter 都重置躲避节奏，观感即「原地抽搐」）。150→105px 的迟滞带
// 保证一次触发后要么持续躲避、要么干脆退出，不会在边缘抖。
const FLEE_R_ENTER = FLEE_R * 0.7
// 退出半径：躲避状态要**跑出 1.6×FLEE_R（240px）**才退出（用户实测：150px 就退出
// 太近，鱼刚弹开一点就停）。三段迟滞：进 105px → 持续躲避 → 出 240px。
// 与 rollAnchorAway 的锚点安全距离（同 240px）对齐：退出躲避时锚点必在半径外，
// 不会立刻把鱼往回拉。
const FLEE_R_EXIT = FLEE_R * 1.6
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
  } else if (st === FISH_STATE.AVOID) {
    // C-start：进入躲避**立刻锁定一次**逃跑方向（之后仅低频计时/紧急情况改判，
    // 见 koiFish.js avoidWish）—— 旧实现每帧按指针位置重算方向，指针一动鱼头
    // 就实时旋转（?koitest 调试层目测确认），真实鱼是选好方向就全力远离。
    if (typeof lockAvoidDir === 'function') lockAvoidDir(k)
  } else if (st === FISH_STATE.NORMAL) {
    // 逃跑收尾（edges 越界后回来）：清目标、panic 先压一档再自然衰减
    fs.esc = null
    k.panic = Math.min(k.panic, 0.4)
    // 关键：丢弃「被吓跑之前想去的地方」。旧锚点仍在原地的话，回到普通态的瞬间
    // 鱼就会掉头往回游，而那里很可能还在指针半径内 → 反复触发躲避。
    // 换一个远离威胁的新锚点，打断「躲开 → 返回 → 再躲」的循环。
    if (typeof rollAnchorAway === 'function') rollAnchorAway(k, mouse.x, mouse.y)
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
  // 三段迟滞：普通态要更近才触发（FLEE_R_ENTER=105）；躲避态要跑出更远才退出
  // （FLEE_R_EXIT=240，见上）—— 弹开一次就跑远，不在指针边缘反复横跳
  const rTrigger = fs.name === FISH_STATE.NORMAL ? FLEE_R_ENTER : FLEE_R_EXIT
  if (hasMouse && d < rTrigger) {
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
