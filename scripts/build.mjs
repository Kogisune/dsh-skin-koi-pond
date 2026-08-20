#!/usr/bin/env node
/**
 * koi-pond · build — 将 css/*.css 内联进 lib/client.js，生成自包含产物。
 * DSH 客户端模块加载器要求：bundle 加载后必须通过
 *   window.__ModuleLoader__.load({ id, factory: (require) => {...} })
 * 注册（CommonJS factory 风格，exports.apply = apply; return module.exports）。
 * 产物 lib/ 不依赖任何运行时文件读取（theme-manager 托管模式仍直接读 css/）。
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

/**
 * 把 ESM 风格 client 源码包装为 __ModuleLoader__.load 注册形式：
 * - `export function apply()` → `function apply()`
 * - 末尾追加 `exports.apply = apply; return module.exports;`
 */
function wrapLoader(clientSrc, css) {
  const body = clientSrc
    .replace(/^export function apply\(\)/m, 'function apply()')
    .split('__KOI_CSS__').join(JSON.stringify(css))

  if (body.includes('export ')) {
    throw new Error('client.js 仍包含未转换的 export，请检查')
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

  // 宿主入口（原样拷贝）
  writeFileSync(
    join(outDir, 'index.js'),
    readFileSync(join(ROOT, 'plugin', 'index.js'), 'utf8')
  )

  // 客户端入口：__ModuleLoader__.load 包装 + CSS 内联
  const clientSrc = readFileSync(join(ROOT, 'plugin', 'client.js'), 'utf8')
  const css = readCssBundle()
  const clientOut = wrapLoader(clientSrc, css)
  writeFileSync(join(outDir, 'client.js'), clientOut)

  console.log(`[koi-pond] build ok → lib/ (css ${css.length} bytes, loader-wrapped)`)
}

build()
