/**
 * koi-render · 鱼渲染层（共享作用域片段，全部读骨骼 k.sk 绘制）
 * 依赖：koiMath（lerp/rgba/lighten）、koiLight（ell/ellLit/lightDirIndex/lightAmp/shadowCtx/
 * shadowPalette）、koiSkeleton（bodySize/tailSize/shadowBodySize）、koiPond 的状态
 * （ctx/curAlpha/frameCount/reduced，运行时解析）。
 *
 * 绘制顺序（frame 中）：drawTail → drawPectoralTail(胸鳍/尾鳍素材) → drawBody →
 * drawBodyLight → drawBackLine(背脊线)。
 * 身体段用「body[i] + 法线 × 行波」的世界位置（骨骼驱动姿态），
 * 鳍与尾用骨骼部位锚点（sk.bind.*）与动效相位（sk.flap）。
 * 鳍形素材化：胸鳍/尾鳍是可整体替换的 SVG（assets/fin-*.svg，build 内联）——
 * 运行时染成尾腹色 color2 的离屏剪影贴图，想改鳍形只换素材不动代码；
 * 背鳍不再用整膜，改为沿身体中线一条比主色更亮的线（转弯时随身体连续弯曲）。
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

// ---- 鳍素材：可替换 SVG → 运行时染色的离屏剪影 ----
// 胸鳍/尾鳍素材（plugin/koi/assets/fin-*.svg）在 build 时内联进占位符
// __FIN_PEC_SVG__ / __FIN_TAIL_SVG__（见 scripts/build.mjs）。单文件 bundle 无法外链
// 图片，运行时用 data:image/svg+xml 解码素材、getImageData 把整片剪影染成当前配色
// color2（保留抗锯齿 alpha），缓存为离屏画布 —— 想换鳍形只需改 assets/*.svg。
// 素材约定（viewBox 单位）：根(附着端)在素材左侧中线附近、主体向 +x 伸展；
// rootX/rootY = 附着点在素材像素中的位置（替换素材后按需调整）。
// 无 Image 的环境（Node 回归沙箱）产出「带 _kind 标记的占位画布」：只跑几何不跑像素，
// 便于 finshape 仍能反解鳍的方向/分列。
const FIN_ASSETS = {
  pec: { svg: '__FIN_PEC_SVG__', rootX: 10, rootY: 28 },
  tail: { svg: '__FIN_TAIL_SVG__', rootX: 14, rootY: 50 },
}
const finSpriteCache = new Map()

function svgSize(svg) {
  const mw = /width="(\d+(?:\.\d+)?)"/.exec(svg)
  const mh = /height="(\d+(?:\.\d+)?)"/.exec(svg)
  return [mw ? Math.round(+mw[1]) : 1, mh ? Math.round(+mh[1]) : 1]
}
function hexRgb(hex) {
  const h = String(hex).replace('#', '')
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return { r: parseInt(f.slice(0, 2), 16), g: parseInt(f.slice(2, 4), 16), b: parseInt(f.slice(4, 6), 16) }
}
function newFinCanvas(kind) {
  const a = FIN_ASSETS[kind]
  const [w, h] = svgSize(a.svg)
  const cv = document.createElement('canvas')
  cv.width = Math.max(1, w)
  cv.height = Math.max(1, h)
  cv._kind = kind
  cv._baked = false
  // 附着点元数据：绘制/回归工具共用（finshape 据此反解贴图几何）
  cv._rootX = a.rootX
  cv._rootY = a.rootY
  return cv
}
function tintFinCanvas(kind, cv, color2) {
  const a = FIN_ASSETS[kind]
  if (typeof Image === 'undefined') {
    // 回归沙箱无 Image：占位画布直接可用（几何断言只读方向/锚点，不读像素）
    cv._baked = true
    return
  }
  const img = new Image()
  img.onload = () => {
    const c2d = cv.getContext('2d')
    if (c2d) {
      c2d.drawImage(img, 0, 0, cv.width, cv.height)
      const rgb = hexRgb(color2)
      try {
        const d = c2d.getImageData(0, 0, cv.width, cv.height)
        const px = d.data
        for (let i = 0; i < px.length; i += 4) {
          if (px[i + 3] > 0) {
            px[i] = rgb.r
            px[i + 1] = rgb.g
            px[i + 2] = rgb.b
          }
        }
        c2d.putImageData(d, 0, 0)
      } catch (e) {}
    }
    cv._baked = true
    // 减动效分支只同步画一帧：染色完成后补画一次，避免静态帧没鳍
    if (reduced) frame()
  }
  img.onerror = () => {
    cv._baked = true
    if (reduced) frame()
  }
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(a.svg)
}
// 取某鳍某配色的染色贴图（按 kind+color2 缓存）；异步解码未完成时返回 null → 该帧跳过
function getFinSprite(kind, color2) {
  const key = kind + color2
  let cv = finSpriteCache.get(key)
  if (!cv) {
    cv = newFinCanvas(kind)
    finSpriteCache.set(key, cv)
    tintFinCanvas(kind, cv, color2)
  }
  return cv._baked ? cv : null
}
// 贴图绘制：素材「根(rootX,rootY)」对准 (x,y)，局部 +x 旋转 ang 后与素材 +x（伸向）对齐，
// 实际鳍长 len = 期望视觉长度（scale = len / 素材可见长），半透明 alpha01 × curAlpha。
function drawFinImage(sprite, x, y, ang, len, alpha01) {
  if (!sprite) return
  const lay = FIN_ASSETS[sprite._kind]
  if (!lay.w) {
    const [w, h] = svgSize(lay.svg)
    lay.w = w
    lay.h = h
  }
  const scale = len / Math.max(1, lay.w - lay.rootX)
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(ang)
  ctx.scale(scale, scale)
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha01 * curAlpha))
  ctx.drawImage(sprite, -lay.rootX, -lay.rootY)
  ctx.restore()
}

// 胸鳍 + 尾鳍：画在身体层之下，根部被主色盖住，只露出伸出体外的部分。
// 锚点与动效相位全部来自骨骼（sk.bind.pec / sk.bind.tail / sk.flap）。
function drawPectoralTail(k) {
  const sk = k.sk
  if (k.body.length < 8) return
  const pec = sk.bind.pec
  const tail = sk.bind.tail
  // 胸鳍：鳃盖后两侧各一片，随游动向后外划（sk.flap 相位）。根钉在体缘
  // （部位点 ± 法线 × 半宽），素材 +x 指向尾向并额外偏开 ±(0.5+flap) 向外张。
  const pecSpr = getFinSprite('pec', k.color2)
  if (pecSpr) {
    const finLen = k.baseSize * 0.62
    for (let s = -1; s <= 1; s += 2) {
      const rx = pec.x + pec.nx * s * pec.half
      const ry = pec.y + pec.ny * s * pec.half
      drawFinImage(pecSpr, rx, ry, Math.atan2(pec.dy, pec.dx) + Math.PI + s * (0.5 + sk.flap), finLen, 0.5)
    }
  }
  // 尾鳍：尾端分叉大叶。锚点沿头向反推少许埋入尾柄（根部被主色盖住），
  // 素材 +x 与尾向对齐；张合/摆动由身体行波自然带动。
  const tailSpr = getFinSprite('tail', k.color2)
  if (tailSpr) {
    const tailLen = k.baseSize * 0.95
    drawFinImage(
      tailSpr,
      tail.x + tail.dx * tailLen * 0.16,
      tail.y + tail.dy * tailLen * 0.16,
      Math.atan2(tail.dy, tail.dx) + Math.PI,
      tailLen,
      0.55
    )
  }
}

// 背脊线（替代背鳍整膜）：沿身体中线从 dorsal0 到 dorsal1 画一条比主色更亮的细线。
// 上一版连续膜用「朝上侧法线 + 固定高度 sin 包络」，鱼转向/摆动时法线翻向使鳍脊方向
// 突变、转弯时整条膜断裂、没有整体性。中线亮线随身体曲线整体弯曲、永不翻转 ——
// 转弯时平滑连续；提亮脊线同时强化背部的受光立体感。
function drawBackLine(k) {
  const sk = k.sk
  const i0 = sk.bind.dorsal0.i
  const i1 = sk.bind.dorsal1.i
  if (i1 - i0 < 2) return
  ctx.strokeStyle = rgba(lighten(k.color, 0.4), 0.7 * 255 * curAlpha)
  ctx.lineWidth = Math.max(1, k.baseSize * 0.1)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  for (let i = i0; i <= i1; i++) {
    const p = bodyPoint(k, sk, i)
    if (i === i0) ctx.moveTo(p.x, p.y)
    else ctx.lineTo(p.x, p.y)
  }
  ctx.stroke()
}
