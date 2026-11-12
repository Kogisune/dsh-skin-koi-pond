#!/usr/bin/env node
/**
 * koi-pond · 回归测试总入口（npm test）
 *
 * 串行执行各回归探针，每个探针的**退出码**即断言结果，全部为 0 才 exit 0。
 * 之所以需要这个入口：此前 `npm test` 只跑 `validate.mjs`（纯结构校验），
 * 行为/几何/鳍形/状态机四类断言全不在 CI 内，回归形同虚设。
 *
 * 流程：build（默认开启，保证测的是当前源码而非过期产物）→ 7 个断言探针 → 可选 bench。
 * 所有探针共用同一套 LCG 随机种子（默认 20260902，KOI_SEED 可覆盖），结果逐位可复现。
 *
 * 未纳入的脚本：
 *   - sizeprofile.mjs：纯体型分布报告，无断言、无退出码语义，需人工看输出
 *   - bench.mjs：性能统计，无断言；用 --bench 纳入时只跑不判（性能阈值留给人工判断，
 *     固定种子后波动已消除，但机器阈值易在换机器/CI 上误报）
 *
 * 用法：
 *   npm test                     # build + 7 个断言探针
 *   node scripts/test.mjs --no-build   # 跳过 build，直接测现有 lib/client.js
 *   node scripts/test.mjs --bench      # 额外跑 bench（只跑不判）
 *   node scripts/test.mjs --verbose    # 打印探针完整输出（调试用）
 * 环境变量：KOI_SEED 透传给各探针。
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const argv = new Set(process.argv.slice(2))
const VERBOSE = argv.has('--verbose')
const DO_BUILD = !argv.has('--no-build')
const WITH_BENCH = argv.has('--bench') || !!process.env.KOI_BENCH

const TARGET = 'lib/client.js'

/** 探针清单：[脚本名, 传给脚本的参数, 说明] */
const PROBES = [
  ['validate.mjs', [], '结构校验（Css/模块/资源完整性）'],
  ['jointdiag.mjs', [TARGET, 'jointdiag'], '脊柱关节角（E/F）'],
  ['fishshape.mjs', [TARGET, 'fishshape'], '鱼体几何 保长/段距（J/K/L/M）'],
  ['finshape.mjs', [TARGET, 'finshape'], '鳍几何 胸鳍/尾鳍/背脊/单弧（A-D）'],
  ['stateprobe.mjs', [TARGET, 'stateprobe'], '状态机行为（G/H/I）'],
  ['turnprobe.mjs', [TARGET, 'turnprobe'], '掉头/螺旋（T1-T4：pivot/转弯半径/盘旋/净弯）'],
  ['timestep.mjs', [TARGET, 'timestep'], '时间基 掉帧补步/相位不漂移（S）'],
]
if (WITH_BENCH) PROBES.push(['bench.mjs', [TARGET, 'bench'], '性能统计（只跑不判）'])

/** 从探针输出里挑出「值得看的行」：断言行、汇总行、警告行 */
function keyLines(out) {
  return out
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => /^\[[A-Z]\]\s|══|FAIL|✗|⚠|Error|错误/.test(l))
}

function run(script, args) {
  const t0 = Date.now()
  const r = spawnSync(process.execPath, [join(HERE, script), ...args], {
    cwd: join(HERE, '..'),
    encoding: 'utf8',
    env: process.env,
  })
  const ms = Date.now() - t0
  const out = `${r.stdout || ''}${r.stderr || ''}`
  return { code: r.status ?? (r.error ? -1 : 0), ms, out, err: r.error }
}

// ---- 0. build（保证测的是当前源码，避免「改了 plugin/ 却忘了 build」导致测了旧产物）----
if (DO_BUILD) {
  process.stdout.write('▸ build ... ')
  const b = run('build.mjs', [])
  if (b.code !== 0) {
    console.log('✗')
    console.log(b.out)
    console.error('\n══ build 失败，回归中止 ✗')
    process.exit(1)
  }
  console.log(`✓ (${b.ms}ms)  ${b.out.trim()}`)
}

// ---- 1. 串行执行各探针 ----
console.log(`\n── koi-pond 回归测试（种子 ${process.env.KOI_SEED || 20260902}）${'─'.repeat(20)}`)
const results = []
for (const [script, args, desc] of PROBES) {
  const name = script.replace(/\.mjs$/, '')
  process.stdout.write(`▸ ${name.padEnd(12)} ${desc} ... `)
  const r = run(script, args)
  const ok = r.code === 0
  console.log(`${ok ? '✓' : '✗'}  (${(r.ms / 1000).toFixed(1)}s)`)
  results.push({ name, desc, ...r, ok })
  // 失败或 --verbose 时打印详情；失败时打全量输出便于定位，成功时只打关键行
  if (VERBOSE || !ok) {
    const lines = VERBOSE ? r.out.split('\n') : keyLines(r.out)
    for (const l of lines) if (l.trim()) console.log(`    ${l.trimEnd()}`)
    if (r.err) console.log(`    [spawn error] ${r.err.message}`)
  }
}

// ---- 2. 汇总 ----
console.log(`\n── 汇总 ${'─'.repeat(46)}`)
for (const r of results) {
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.name.padEnd(14)} exit=${String(r.code).padEnd(3)} ${(r.ms / 1000).toFixed(1)}s  ${r.desc}`)
}
const failed = results.filter((r) => !r.ok)
const totalMs = results.reduce((a, r) => a + r.ms, 0)

if (failed.length) {
  console.log(`\n══ 回归测试失败：${failed.length}/${results.length} 个探针未通过 ✗`)
  console.log(`   失败项：${failed.map((r) => r.name).join(', ')}`)
  console.log(`   （完整输出见上方各探针详情；单跑某探针：node scripts/<探针>.mjs ${TARGET} <标签>）`)
  process.exit(1)
}
console.log(`\n══ 回归测试全部通过 ✓（${results.length} 个探针，${(totalMs / 1000).toFixed(1)}s）`)
process.exit(0)
