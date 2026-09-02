/**
 * koi-render · 鱼渲染层（共享作用域片段，全部读骨骼 k.sk 绘制）
 * 依赖：koiMath（lerp/rgba）、koiLight（ell/ellLit/lightDirIndex/lightAmp/shadowCtx/
 * shadowPalette）、koiSkeleton（bodySize/tailSize/shadowBodySize）、koiPond 的状态
 * （ctx/curAlpha/frameCount，运行时解析）。
 *
 * 绘制顺序（frame 中）：drawTail → drawPectoralTail → drawBody → drawBodyLight → drawDorsal。
 * 身体段用「body[i] + 法线 × 行波」的世界位置（骨骼驱动姿态），
 * 鳍与尾用骨骼部位锚点（sk.bind.*）与动效相位（sk.flap/sk.spread）。
 */
// 投影偏移跟随体型：原来硬编码 50px，对直径仅 30~40px 的鱼来说
// 影子会整个脱开本体，看着像另一条鱼
function fishShadowOffset(k) {
  return k.baseSize * 1.15
}
function drawShadow(k) {
  const o = fishShadowOffset(k)
  for (let i = 0; i < k.body.length; i++) {
    const b = k.body[i]
    ell(shadowCtx, b.x + o, b.y + o, shadowBodySize(i, k), shadowPalette.fish)
  }
}
// 身体段世界位置（含骨骼行波偏移）
function bodyPoint(k, sk, i) {
  const b = k.body[i]
  const tn = sk.tan[i]
  return { x: b.x + tn.nx * sk.wave[i], y: b.y + tn.ny * sk.wave[i] }
}
function drawTail(k) {
  const sk = k.sk
  const n = k.body.length
  for (let i = 0; i < n; i++) {
    const sz = tailSize(i, k)
    if (sz <= 0) continue
    const t = i / (n - 1)
    const p = bodyPoint(k, sk, i)
    // 尾腹色层：头部弱（被主色盖住），越靠尾越实 —— 尾巴呈现 color2。
    // 同样加温和的方向光照（dark 0.78），方向实时跟随光源。
    ellLit(ctx, p.x, p.y, sz, k.color2, lerp(0.35, 0.75, t) * curAlpha * lightAmp * 255, lightDirIndex(p.x, p.y), 0.78)
  }
}
function drawShadowTail(k) {
  const o = fishShadowOffset(k)
  const n = k.body.length
  for (let i = 0; i < n; i++) {
    const b = k.body[i]
    ell(shadowCtx, b.x + o, b.y + o, tailSize(i, k), shadowPalette.fish)
  }
}
function drawBody(k) {
  const sk = k.sk
  const n = k.body.length
  for (let i = 0; i < n; i++) {
    const sz = bodySize(i, k)
    if (sz <= 0) continue
    const t = i / (n - 1)
    const p = bodyPoint(k, sk, i)
    // 主色层：头部实，向尾逐渐让位给尾腹色。
    // 实时光照：光方向 = 段 → 光源（每帧变化），受光侧亮、背光侧暗；
    // 头部整体亮、尾部整体暗（远离光源）—— dark 0.62→0.48 边缘压暗 38%→52%。
    ellLit(ctx, p.x, p.y, sz, k.color, lerp(0.9, 0.3, t) * curAlpha * lightAmp * 255, lightDirIndex(p.x, p.y), lerp(0.62, 0.48, t))
  }
}

// 暗部环境反光层：与 AO 渐变配合，给背光一侧一点水下环境光。
// 只画暗部（不画高光 —— 高光离散亮椭圆在体型小时会串珠），方向实时跟随光源。
function drawBodyLight(k) {
  const sk = k.sk
  const n = k.body.length
  if (n < 10) return
  const lo0 = Math.round(n * 0.22)
  const lo1 = Math.round(n * 0.78)
  for (let i = lo0; i <= lo1; i += 2) {
    const sz = bodySize(i, k)
    if (sz <= 0) continue
    const t = i / (n - 1)
    const p = bodyPoint(k, sk, i)
    const d = LIGHT_DIRS[lightDirIndex(p.x, p.y)]
    // 腹侧环境反光（背光一侧，暗部不串珠）
    ell(ctx, p.x - d[0] * sz * 0.2, p.y - d[1] * sz * 0.2, sz * 0.36, rgba('#0e3a4a', 0.05 * (1 - t * 0.5) * curAlpha * 255))
  }
}

// 胸鳍 + 尾鳍：画在身体层之下，根部被主色盖住，只露出伸出体外的部分。
// 锚点与动效相位全部来自骨骼（sk.bind.pec / sk.bind.tail / sk.flap / sk.spread）。
function drawPectoralTail(k) {
  const sk = k.sk
  const n = k.body.length
  if (n < 8) return
  // 胸鳍：鳃盖后两侧各一片，随游动扇动（骨骼动效相位 sk.flap）
  const pec = sk.bind.pec
  const finLen = k.baseSize * 0.6
  const finWid = k.baseSize * 0.2
  for (let s = -1; s <= 1; s += 2) {
    const rx = pec.x + pec.nx * s * pec.half
    const ry = pec.y + pec.ny * s * pec.half
    ctx.save()
    ctx.translate(rx, ry)
    ctx.rotate(Math.atan2(pec.dy, pec.dx) + s * (0.55 + sk.flap))
    // 注意：rgba 的 alpha 是 0-255 语义，这里 0.5 是 0-1 不透明度，须乘 255
    ctx.fillStyle = rgba(k.color2, 0.5 * 255 * curAlpha)
    ctx.beginPath()
    ctx.ellipse(finLen * 0.25, 0, finLen * 0.75, finWid, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  // 尾鳍：尾端向后分叉的双叶，随游动张合（骨骼动效相位 sk.spread）
  const tail = sk.bind.tail
  const spread = sk.spread
  const tailLen = k.baseSize * 0.95
  const tailWid = k.baseSize * 0.28
  for (let s = -1; s <= 1; s += 2) {
    ctx.save()
    ctx.translate(tail.x, tail.y)
    ctx.rotate(Math.atan2(tail.dy, tail.dx))
    ctx.fillStyle = rgba(k.color2, 0.55 * 255 * curAlpha)
    ctx.beginPath()
    ctx.ellipse(
      tailLen * 0.55,
      s * tailWid * 1.5,
      tailLen * 0.62,
      tailWid * 0.7,
      s * spread * 0.45,
      0,
      Math.PI * 2
    )
    ctx.fill()
    ctx.restore()
  }
}

// 背鳍：沿脊线的一串小三角，从身体上边缘朝画面「上方」伸出（俯视视角下
// 背鳍始终朝观察者一侧，用世界 -y 而非身体法线，避免鱼转向时鳍翻到腹侧）。
// 区间由骨骼部位 dorsal0 ~ dorsal1 决定。
function drawDorsal(k) {
  const sk = k.sk
  const n = k.body.length
  const i0 = sk.bind.dorsal0.i
  const i1 = sk.bind.dorsal1.i
  if (i1 <= i0 || i0 >= n - 1) return
  const finH = k.baseSize * 0.32
  for (let i = i0; i <= i1; i += 2) {
    const p = bodyPoint(k, sk, i)
    const t = sk.tan[i]
    const by = p.y - bodySize(i, k) * 0.5 // 身体上边缘
    ctx.fillStyle = rgba(k.color2, 0.42 * 255 * curAlpha)
    ctx.beginPath()
    ctx.moveTo(p.x - t.dx * 2.5, by - t.dy * 2.5)
    ctx.lineTo(p.x, by - finH)
    ctx.lineTo(p.x + t.dx * 2.5, by + t.dy * 2.5)
    ctx.closePath()
    ctx.fill()
  }
}
