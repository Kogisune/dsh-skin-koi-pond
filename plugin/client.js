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
const KOI_ID = 'koi-pond-koi'
const POND_HOST_ID = 'koi-pond-dsh'

// 锦鲤剪影（SVG data URI，橙红渐变 + 金鳞 + 水泡）——远处的水墨锦鲤，与动画鱼群叠出层次
const KOI_ART =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
<defs><linearGradient id="k" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="#f26a3c"/><stop offset="0.6" stop-color="#ff8a5c"/><stop offset="1" stop-color="#d94a24"/>
</linearGradient></defs>
<path d="M18 50 C 30 34 40 26 52 42 L 30 58 Z" fill="#f26a3c" opacity="0.85"/>
<ellipse cx="105" cy="50" rx="62" ry="30" fill="url(#k)"/>
<path d="M80 24 C 95 12 118 12 130 26 C 115 20 92 20 80 24 Z" fill="#e85a2a"/>
<circle cx="152" cy="42" r="5" fill="#1c2b24"/>
<circle cx="153.5" cy="40.5" r="1.8" fill="#fff"/>
<path d="M160 46 C 172 44 178 48 182 52" stroke="#e85a2a" stroke-width="2" fill="none" stroke-linecap="round"/>
<path d="M70 40 C 82 46 82 54 70 60 M100 36 C 112 42 112 58 100 64 M130 40 C 140 45 140 55 130 60" stroke="#d94a24" stroke-width="2.5" fill="none" opacity="0.55"/>
<circle cx="166" cy="64" r="3" fill="#4fb8c9" opacity="0.6"/>
<circle cx="174" cy="70" r="2" fill="#4fb8c9" opacity="0.45"/>
</svg>`
  )

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

  // 5. 锦鲤剪影装饰层（静态水墨锦鲤，右下角）
  const koi = document.createElement('div')
  koi.id = KOI_ID
  koi.dataset.koiKoi = ''
  koi.setAttribute('aria-hidden', 'true')
  koi.style.backgroundImage = `url("${KOI_ART}")`
  koi.style.backgroundSize = 'contain'
  koi.style.backgroundRepeat = 'no-repeat'
  body.append(koi)
  owned.push(koi)

  // 卸载还原
  return () => {
    cleanupPond()
    for (const node of owned) node.remove()
    if (originalAttr === null) body.removeAttribute(SKIN_ATTR)
    else body.setAttribute(SKIN_ATTR, originalAttr)
  }
}
