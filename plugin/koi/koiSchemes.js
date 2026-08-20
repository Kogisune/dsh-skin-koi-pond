/**
 * koi-pond · 锦鲤配色方案（自包含版，转写自 carps-top/src/utils/koiSchemes.ts）
 * 作为「鱼群颜色设置」的唯一数据源。
 * 每个方案：c/c2 鱼身主色/尾腹色；mods 游动行为参数。
 */
const KOI_PRESETS = [
  { id: 'kohaku', name: '红白', c: '#ffffff', c2: '#e23b2e', mods: { size: 0, speed: 0, perc: 100, number: 0 } },
  { id: 'sanke', name: '大正三色', c: '#ffffff', c2: '#141414', mods: { size: 0, speed: 0, perc: 100, number: 0 } },
  { id: 'showa', name: '昭和三色', c: '#141414', c2: '#e23b2e', mods: { size: 0, speed: 0, perc: 100, number: 0 } },
  { id: 'ogon', name: '黄金', c: '#f4c430', c2: '#d99a00', mods: { size: 1, speed: -1, perc: 120, number: 0 } },
  { id: 'tancho', name: '丹顶', c: '#ffffff', c2: '#ff3b30', mods: { size: 0, speed: 0, perc: 100, number: 0 } },
  { id: 'asagi', name: '浅黄', c: '#3b6fb5', c2: '#e23b2e', mods: { size: 0, speed: 1, perc: 110, number: 0 } },
  { id: 'utsuri', name: '绯写', c: '#f1541b', c2: '#141414', mods: { size: 0, speed: 2, perc: 110, number: 0 } },
  { id: 'panda', name: '写鲤（黑白）', c: '#141414', c2: '#ffffff', mods: { size: 1, speed: 0, perc: 100, number: 0 } },
  { id: 'momiji', name: '落叶', c: '#f1541b', c2: '#ffffff', mods: { size: 0, speed: 0, perc: 110, number: 0 } },
]

function getScheme(id) {
  return KOI_PRESETS.find((p) => p.id === id) ?? null
}

function pickRandomScheme() {
  const s = Math.random()
  const m = { size: 0, speed: 0, perc: 100, number: 0 }
  const koiColors2 = ['#141414', '#ffffff', '#ffffff', '#ffffff']
  const rc = () => koiColors2[Math.floor(Math.random() * koiColors2.length)]
  let c
  let c2
  if (s < 0.002) {
    c = '#FFC0CB'
    c2 = '#ef8aef'
    m.speed = 8
    m.perc = 120
  } else if (s < 0.008) {
    c = '#a245ff'
    c2 = '#0aebff'
    m.speed = 5
    m.perc = 120
  } else if (s < 0.03) {
    c = '#fffff1'
    c2 = '#ffbf00'
    m.perc = 380
    m.speed = 3
  } else if (s < 0.07) {
    c = '#141414'
    c2 = '#ca040a'
    m.size = 1
    m.perc = 100
    m.number = -5
  } else if (s < 0.12) {
    c = '#fffff2'
    c2 = '#234edb'
    m.perc = 150
  } else if (s < 0.18) {
    c = '#ffbf00'
    c2 = '#ffbf00'
    m.perc = 100
  } else if (s < 0.26) {
    c = '#141413'
    c2 = rc()
    m.perc = 100
  } else if (s < 0.33) {
    c = '#ffffff'
    c2 = rc()
    m.perc = 100
  } else if (s < 0.9) {
    c = '#f1541b'
    c2 = rc()
    m.perc = 120
  } else {
    c = '#ff5000'
    c2 = '#f1541b'
    m.perc = 120
  }
  return { id: 'random', name: '随机彩蛋', c, c2, mods: m }
}

function resolveScheme(saved) {
  if (saved && saved !== 'random') {
    const p = getScheme(saved)
    if (p) return p
  }
  return pickRandomScheme()
}

export { KOI_PRESETS, getScheme, pickRandomScheme, resolveScheme }
