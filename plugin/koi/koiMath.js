/**
 * koi-math · 数学与颜色工具（共享作用域片段，被后续 koi 模块直接引用）
 * 依赖：无（在 koiSchemes 之后拼接）。
 */
// ---- 小工具 / 数学 ----
function rnd(a, b) {
  return a + Math.random() * (b - a)
}
function mag(a) {
  return Math.hypot(a.x, a.y)
}
function setMag(a, m) {
  const l = mag(a) || 1
  return { x: (a.x / l) * m, y: (a.y / l) * m }
}
function limit(a, mx) {
  return mag(a) > mx ? setMag(a, mx) : a
}
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
function lerp(a, b, t) {
  return a + t * (b - a)
}
function rgba(hex, a255) {
  const h = hex.replace('#', '')
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  const r = parseInt(full.substring(0, 2), 16)
  const g = parseInt(full.substring(2, 4), 16)
  const b = parseInt(full.substring(4, 6), 16)
  const a = Math.max(0, Math.min(1, a255 / 255))
  return `rgba(${r},${g},${b},${a})`
}
// 把 hex 色向白色提亮 amt(0~1)，返回 hex（背脊线/亮点用）
function lighten(hex, amt) {
  const h = hex.replace('#', '')
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  const to2 = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  const mix = (n) => n + (255 - n) * amt
  return (
    '#' +
    to2(mix(parseInt(full.substring(0, 2), 16))) +
    to2(mix(parseInt(full.substring(2, 4), 16))) +
    to2(mix(parseInt(full.substring(4, 6), 16)))
  )
}
// 按倍率压暗一个 hex 色，返回 hex（供 AO 边缘渐变用）
function shade(hex, f) {
  const h = hex.replace('#', '')
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  const to2 = (n) => Math.min(255, Math.round(n * f)).toString(16).padStart(2, '0')
  return '#' + to2(parseInt(full.substring(0, 2), 16)) + to2(parseInt(full.substring(2, 4), 16)) + to2(parseInt(full.substring(4, 6), 16))
}

// Perlin noise（荷叶边缘）
const perm = new Uint8Array(512)
;(function () {
  const p = []
  let i
  for (i = 0; i < 256; i++) p[i] = i
  for (i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = p[i]
    p[i] = p[j]
    p[j] = t
  }
  for (i = 0; i < 512; i++) perm[i] = p[i & 255]
})()
function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10)
}
function grad(h, x, y) {
  switch (h & 3) {
    case 0:
      return x + y
    case 1:
      return -x + y
    case 2:
      return x - y
    default:
      return -x - y
  }
}
function noise2(x, y) {
  const X = Math.floor(x) & 255
  const Y = Math.floor(y) & 255
  x -= Math.floor(x)
  y -= Math.floor(y)
  const u = fade(x)
  const v = fade(y)
  const aa = perm[perm[X] + Y]
  const ab = perm[perm[X] + Y + 1]
  const ba = perm[perm[X + 1] + Y]
  const bb = perm[perm[X + 1] + Y + 1]
  const res = lerp(
    lerp(grad(aa, x, y), grad(ba, x - 1, y), u),
    lerp(grad(ab, x, y - 1), grad(bb, x - 1, y - 1), u),
    v
  )
  return (res + 1) / 2
}
