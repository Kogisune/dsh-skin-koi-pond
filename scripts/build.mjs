#!/usr/bin/env node
/**
 * koi-pond · build — 生成自包含 lib/client.js：
 *   1. css/*.css 内联进 CSS 占位符
 *   2. koi 模块（plugin/koi/*.js 按依赖顺序）与 client.js 拼接进同一 factory
 * DSH 客户端模块加载器要求：bundle 加载后必须通过
 *   window.__ModuleLoader__.load({ id, factory: (require) => {...} })
 * 注册（CommonJS factory 风格，exports.apply = apply; return module.exports）。
 *
 * 模块化约定：plugin/koi/ 下的模块是「共享作用域片段」——build 去掉每个文件的
 * import/export 行后按 KOI_MODULES 顺序拼接，模块间直接引用彼此声明的变量。
 * 依赖顺序：schemes（配色）→ math（工具）→ light（光照）→ skeleton（鱼骨骼）→
 * leaf（荷叶）→ ripple（涟漪）→ render（鱼渲染）→ fish（鱼生成/AI）→ pond（主入口）。
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

/** koi 模块拼接顺序（依赖在前）。每个文件去掉 import/export 行成为作用域片段。 */
const KOI_MODULES = [
  'koiSchemes.js',
  'koiMath.js',
  'koiLight.js',
  'koiSkeleton.js',
  'koiLeaf.js',
  'koiRipple.js',
  'koiRender.js',
  'koiFish.js',
  'koiPond.js',
]

function readCssBundle() {
  const parts = []
  for (const f of CSS_FILES) {
    const p = join(ROOT, 'css', f)
    parts.push(`/* ===== ${f} ===== */\n${readFileSync(p, 'utf8')}`)
  }
  return parts.join('\n\n')
}

/**
 * 去掉模块的 import/export 行，使其变量进入 factory 共享作用域。
 * 注意：`export function apply() {` 只去掉 export 关键字、保留函数体括号 `{`，
 * 否则拼接后 factory 提前闭合（括号失衡）。
 */
function stripModuleLines(src) {
  return src
    .replace(/^export\s+function\s/gm, 'function ')
    .replace(/^import\s[^\n]*$/gm, '')
    .replace(/^export\s+default\s[^\n]*$/gm, '')
    .replace(/^export\s*\{[^\n]*\}\s*$/gm, '')
}

/**
 * 拼接 koi 模块 + client 源码，包装为 __ModuleLoader__.load 注册形式。
 * 顺序：KOI_MODULES（依赖序）→ client（引用 KoiPond）。
 */
function wrapLoader({ koiSrcs, clientSrc, css }) {
  const client = stripModuleLines(clientSrc)
    .split('__KOI_CSS__').join(JSON.stringify(css))

  const body = [...koiSrcs, client].join('\n\n')

  for (const [name, pat] of [
    ['koi 模块 import/export', /(^|\n)\s*(import|export)\s/],
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
  const koiSrcs = KOI_MODULES.map((f) => stripModuleLines(readFileSync(join(ROOT, 'plugin', 'koi', f), 'utf8')))
  const clientOut = wrapLoader({
    koiSrcs,
    clientSrc: readFileSync(join(ROOT, 'plugin', 'client.js'), 'utf8'),
    css,
  })
  writeFileSync(join(outDir, 'client.js'), clientOut)

  console.log(`[koi-pond] build ok → lib/ (css ${css.length} bytes, ${KOI_MODULES.length} koi modules inlined, loader-wrapped)`)
}

build()
