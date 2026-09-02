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
