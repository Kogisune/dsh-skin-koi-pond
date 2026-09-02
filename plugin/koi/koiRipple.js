/**
 * koi-ripple · 涟漪（共享作用域片段）
 * 依赖：koiMath（rnd）、koiPond 的状态（ctx/curAlpha，运行时解析）。
 */
function makeRipple(x, y, small) {
  return {
    x,
    y,
    size: small ? rnd(24, 64) : rnd(40, 140),
    lifespan: 400,
    sizeStep: rnd(2, 3),
    lifeStep: rnd(2, 10),
  }
}
function drawRipple(r) {
  if (!ctx) return
  const a = Math.max(0, Math.min(1, r.lifespan / 255))
  ctx.lineWidth = 0.8
  ctx.strokeStyle = `rgba(255,255,255,${a * curAlpha * 0.8})`
  ctx.beginPath()
  ctx.arc(r.x, r.y, r.size / 2, 0, Math.PI * 2)
  ctx.stroke()
}
