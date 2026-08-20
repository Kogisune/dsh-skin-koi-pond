#!/usr/bin/env node
/**
 * koi-pond · build — 将 css/*.css 内联进 lib/client.js，生成自包含产物。
 * 产物 lib/ 不依赖任何运行时文件读取（theme-manager 托管模式仍直接读 css/）。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
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

function build() {
  const outDir = join(ROOT, 'lib')
  mkdirSync(outDir, { recursive: true })

  // 宿主入口（原样拷贝）
  writeFileSync(
    join(outDir, 'index.js'),
    readFileSync(join(ROOT, 'plugin', 'index.js'), 'utf8')
  )

  // 客户端入口：CSS 内联
  const clientSrc = readFileSync(join(ROOT, 'plugin', 'client.js'), 'utf8')
  const css = readCssBundle()
  const clientOut = clientSrc.replace('__KOI_CSS__', () => JSON.stringify(css))
  if (clientOut === clientSrc) {
    throw new Error('client.js 中未找到 __KOI_CSS__ 占位符')
  }
  writeFileSync(join(outDir, 'client.js'), clientOut)

  console.log(`[koi-pond] build ok → lib/ (css ${css.length} bytes)`)
}

build()
