#!/usr/bin/env node
/**
 * koi-pond · validate — 校验主题包结构完整性：
 * skin.json 字段 / css 文件存在性 / 部件映射一致性。
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const COMPONENTS = ['background', 'sidebar', 'titlebar', 'composer', 'overlay', 'fonts', 'ui']
let ok = true

function fail(msg) {
  ok = false
  console.error(`❌ ${msg}`)
}

// 1. skin.json
const skin = JSON.parse(readFileSync(join(ROOT, 'skin.json'), 'utf8'))
if (skin.id !== 'koi-pond') fail(`skin.json id 应为 koi-pond，实际 ${skin.id}`)
if (skin.theme?.kind !== 'full') fail('theme.kind 应为 full')
if (skin.theme?.family !== 'koi') fail('theme.family 应为 koi')
if (!skin.bodyAttr?.startsWith('data-dsh-')) fail('bodyAttr 应为 data-dsh-* 作用域')

// 2. css 对象：* 必填，部件映射与文件存在
const css = skin.css
if (!css?.['*']?.length) fail('css["*"] 必须声明共享基础')
for (const c of COMPONENTS) {
  if (!css[c]?.length) fail(`部件 ${c} 未在 css 中声明`)
  for (const rel of css[c]) {
    const p = join(ROOT, rel)
    if (!existsSync(p)) fail(`css 文件缺失: ${rel}`)
  }
}

// 3. theme.components 与 css 部件一一对应
const declared = Object.keys(css).filter((k) => k !== '*')
for (const c of COMPONENTS) {
  if (!skin.theme.components?.[c]) fail(`theme.components 未声明 ${c}`)
  if (!declared.includes(c)) fail(`css 未包含 ${c}`)
}

// 4. 构建产物存在
if (!existsSync(join(ROOT, 'lib', 'client.js'))) fail('lib/client.js 缺失，请先 pnpm build')
if (!existsSync(join(ROOT, 'lib', 'index.js'))) fail('lib/index.js 缺失，请先 pnpm build')

console.log(ok ? '✅ validate ok — koi-pond 主题结构完整' : '❌ validate failed')
process.exit(ok ? 0 : 1)
