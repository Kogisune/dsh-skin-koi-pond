#!/usr/bin/env node
/**
 * koi-pond · build — 生成自包含 lib/client.js：
 *   1. css/*.css 内联进 CSS 占位符
 *   2. koi 模块（koiSchemes.js + koiPond.js）与 client.js 拼接进同一 factory
 * DSH 客户端模块加载器要求：bundle 加载后必须通过
 *   window.__ModuleLoader__.load({ id, factory: (require) => {...} })
 * 注册（CommonJS factory 风格，exports.apply = apply; return module.exports）。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BUNDLE_ID = 'dsh-skin-koi-pond'
const CSS_FILES = [
  'base.css',
  'background.css',
  'sidebar.css',
  'titlebar.css',
  'composer.css',
  'overlay.css',
  'fonts.css',
  'ui.css',
]

function readCssBundle() {
  const parts = []
  for (const f of CSS_FILES) {
    const p = join(ROOT, 'css', f)
    parts.push(`/* ===== ${f} ===== */\n${readFileSync(p, 'utf8')}`)
  }
  return parts.join('\n\n')
}

/** 去掉模块的 import/export 行，使其变量进入 factory 共享作用域 */
function stripModuleLines(src, { imports = [], exports = [] } = {}) {
  let out = src
  for (const line of imports) out = out.split(line).join('')
  for (const line of exports) out = out.split(line).join('')
  return out
}

/**
 * 拼接 koi 模块 + client 源码，包装为 __ModuleLoader__.load 注册形式。
 * 顺序：koiSchemes（无依赖）→ koiPond（引用前者变量）→ client（引用 KoiPond）。
 */
function wrapLoader({ koiSchemesSrc, koiPondSrc, clientSrc, css }) {
  const koiSchemes = stripModuleLines(koiSchemesSrc, {
    exports: ['export { KOI_PRESETS, getScheme, pickRandomScheme, resolveScheme }'],
  })
  const koiPond = stripModuleLines(koiPondSrc, {
    imports: ["import { resolveScheme, pickRandomScheme, getScheme } from './koiSchemes.js'"],
    exports: ['export default KoiPond'],
  })
  const client = stripModuleLines(clientSrc, {
    imports: ["import KoiPond from './koi/koiPond.js'"],
  })
    .replace(/^export function apply\(\)/m, 'function apply()')
    .split('__KOI_CSS__').join(JSON.stringify(css))

  const body = [koiSchemes, koiPond, client].join('\n\n')

  for (const [name, pat] of [
    ['koiSchemes export', /export\s*\{/],
    ['koiPond import/export', /(^|\n)\s*(import|export)\s/],
    ['client import/export', /(^|\n)\s*(import|export)\s/],
  ]) {
    if (pat.test(body)) throw new Error(`${name} 残留，请检查源码`)
  }
  if (body.includes('__KOI_CSS__')) {
    throw new Error('client.js 中 CSS 占位符未被替换，请检查源码')
  }

  return `window.__ModuleLoader__.load({
\tid: ${JSON.stringify(BUNDLE_ID)},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${body}
\t\texports.apply = apply;
\t\treturn module.exports;
\t}
});
`
}

function build() {
  const outDir = join(ROOT, 'lib')
  mkdirSync(outDir, { recursive: true })

  writeFileSync(join(outDir, 'index.js'), readFileSync(join(ROOT, 'plugin', 'index.js'), 'utf8'))

  const css = readCssBundle()
  const clientOut = wrapLoader({
    koiSchemesSrc: readFileSync(join(ROOT, 'plugin', 'koi', 'koiSchemes.js'), 'utf8'),
    koiPondSrc: readFileSync(join(ROOT, 'plugin', 'koi', 'koiPond.js'), 'utf8'),
    clientSrc: readFileSync(join(ROOT, 'plugin', 'client.js'), 'utf8'),
    css,
  })
  writeFileSync(join(outDir, 'client.js'), clientOut)

  console.log(`[koi-pond] build ok → lib/ (css ${css.length} bytes, koi modules inlined, loader-wrapped)`)
}

build()
