/**
 * koi-pond · 客户端入口（Cordis 插件）
 * 锦鲤池塘主题：注入 design-token CSS、挂载 Canvas 锦鲤池塘动画（carps.top koiPond 移植）、
 * 水波涟漪装饰层与锦鲤剪影。卸载时由 effect disposer 完整还原。
 * 构建时 scripts/build.mjs 会把 css/*.css 内联进 CSS 占位符、并把 koi 模块合并进同一 factory。
 */
import KoiPond from './koi/koiPond.js'

const SKIN_ATTR = 'data-dsh-koi-pond'
const STYLE_ID = 'koi-pond-style'
const RIPPLE_ID = 'koi-pond-ripple'
const POND_HOST_ID = 'koi-pond-dsh'

export function apply() {
  const body = document.body
  const owned = []
  const originalAttr = body.getAttribute(SKIN_ATTR)

  // 1. 作用域属性
  body.setAttribute(SKIN_ATTR, '')

  // 2. 注入设计令牌 + 部件 CSS（构建时内联）
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = __KOI_CSS__
  document.head.append(style)
  owned.push(style)

  // 3. Canvas 锦鲤池塘动画（carps.top koiPond 移植，透明背景）
  const pondHost = document.createElement('div')
  pondHost.id = POND_HOST_ID
  pondHost.setAttribute('aria-hidden', 'true')
  body.append(pondHost)
  owned.push(pondHost)
  const cleanupPond = KoiPond.mount(pondHost, { koi: 12, fps: 30 })

  // 4. 水波涟漪装饰层（纯 CSS 动画）
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
