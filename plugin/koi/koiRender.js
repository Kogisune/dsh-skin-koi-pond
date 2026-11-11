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
// 整条鱼的不透明度：水里的鱼不是实心贴纸。depth 0=贴水面 1=贴池底，
// 越深越被水色吞（同时影子越偏、越淡，见 fishShadowOffset）。
// 注意：这里的 alpha 必须**与 depth 无关**。回归探针（fishshape）按「alpha 递减
// 连续的段」切分同一条鱼的身体；如果每条鱼的 alpha 档位不同，前一条的尾会与后一条
// 的头连成一段，探针就读到跨鱼的百像素跳变（拉断帧）。深度改用「压暗」表达。
function kAlpha(k) {
  return curAlpha
}
// 深度压暗：越贴池底越暗（量化 4 档，配合 ellLit 的渐变缓存）
function bodyDepth(k, hex) {
  return shade(hex, 1 - 0.05 * Math.round((k.depth || 0) * 4))
}
// 投影偏移跟随体型：原来硬编码 50px，对直径仅 30~40px 的鱼来说
// 影子会整个脱开本体，看着像另一条鱼
function fishShadowOffset(k) {
  return k.baseSize * (1.15 + 0.9 * (k.depth || 0))
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
    // 尾腹色底衬：头部透明、越靠尾越实。斑纹改成 kohaku 后，尾柄在参考里是**白**的，
    // 底衬再给满浓度红会把整条尾柄染成红棒（实测截图就是一根红针）。故同时做两件事：
    // 颜色先向白色提亮，浓度上限也压下来 —— 尾柄保留一点血色透出，不抢白底。
    ell(ctx, p.x, p.y, sz, rgba(mixHex(k.color2, '#ffffff', 0.5), lerp(0.1, 0.34, t) * kAlpha(k) * 255))
  }
}
// 身体沿体轴的配色：白底 + 两段红斑（kohaku）。
// 旧实现是「前段主色 → 45% 起渐变到尾腹色」，读出来是一条从头红到尾的连续渐变 ——
// 参考实现（与真实锦鲤）的辨识度来自**成块的红白斑**：红头 / 白带 / 中段红斑 / 白尾柄。
// 斑块边界做 ~9% 体长的柔化过渡：量化后每级 ≈2 段，边缘不会露出台阶。
// 0.055 → 0.09：硬边在全景下读成「糖果条纹」，真实锦鲤的红白交界是渐次过渡的。
const PATCH_EDGE = 0.09
const BODY_T_STEPS = 14 // 红斑浓度量化级数：6 级太粗，每级交界在 6× 特写下是一圈白环；
// 14 级 + ellLit 的 dark 0.96（边缘几乎不压暗）后，逐段椭圆的自描边彻底消失。
function patchMix(k, t) {
  const p = k.patch
  if (!p) return 0
  const sm = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u))
  let r = 0
  for (let i = 0; i < 4; i += 2) {
    const a = p[i]
    const b = p[i + 1]
    const inA = a <= 0 ? 1 : sm((t - (a - PATCH_EDGE)) / (2 * PATCH_EDGE))
    const inB = 1 - sm((t - (b - PATCH_EDGE)) / (2 * PATCH_EDGE))
    const box = Math.min(inA, inB)
    if (box > r) r = box
  }
  return r
}
function bodyTint(k, t) {
  const q = Math.round(patchMix(k, t) * BODY_T_STEPS) / BODY_T_STEPS
  if (q <= 0) return bodyDepth(k, k.color) // 白底
  return bodyDepth(k, mixHex(k.color, k.color2, q))
}
// 整条鱼的明暗：按「鱼 → 光源」距离给一个统一的亮度系数。
// 逐段方向光照（旧 ellLit）会画出环带，但完全去掉又失去光源移动的响应；
// 折中为「每条鱼一个亮度」，光源游走时整池鱼仍有明暗起伏。
function bodyBright(k) {
  const d = Math.hypot(lightX - k.pos.x, lightY - k.pos.y)
  const near = 1 - Math.min(1, d / (Math.hypot(W, H) * 0.75))
  // 量化成 4 档：亮度连续变化会让 bodyTint 的 hex 组合爆炸，ellLit 渐变缓存不收敛
  const v = (0.9 + 0.24 * near) * (0.92 + 0.12 * lightAmp)
  return 0.86 + Math.round((v - 0.86) / 0.06) * 0.06
}
// 轮廓压边：沿左右体缘描一圈，给平涂的身体补回「圆润」。
// 参考实现（Loomis/koi pond 类壁纸）也是这条路子：一次实心填充 + 脊线提亮 + 边缘压暗，
// 而不是用几十个带渐变的圆去拼 —— 后者必然在重叠处留缝。
function drawBodyRim(k) {
  const sk = k.sk
  const n = k.body.length
  if (n < 6) return
  const br = bodyBright(k)
  // 两条**独立的开放**子路径：右体缘、左体缘。绝不能首尾相连 ——
  // 旧版 closePath 会把右缘末端与左缘末端连起来，在尾柄末端横切一整条深色半环，
  // 12× 特写下身体像一根被切断的管子，尾鳍浮在外面（用户反馈「姿态不如参考」的
  // 主要来源之一就是这条假的「断口」）。吻端也不再跨接：留一个小开口，
  // 反而更像唇部，且不会在快速转向时拉出一根横线。
  const p0 = bodyPoint(k, sk, 0)
  const t0 = sk.tan[0]
  const h0 = bodySize(0, k) * 0.5
  ctx.beginPath()
  ctx.moveTo(p0.x + t0.dx * h0 * 0.55 + t0.nx * h0, p0.y + t0.dy * h0 * 0.55 + t0.ny * h0)
  for (let i = 0; i < n; i++) {
    const p = bodyPoint(k, sk, i)
    const tn = sk.tan[i]
    const h = bodySize(i, k) * 0.5
    ctx.lineTo(p.x + tn.nx * h, p.y + tn.ny * h)
  }
  ctx.moveTo(p0.x + t0.dx * h0 * 0.55 - t0.nx * h0, p0.y + t0.dy * h0 * 0.55 - t0.ny * h0)
  for (let i = 0; i < n; i++) {
    const p = bodyPoint(k, sk, i)
    const tn = sk.tan[i]
    const h = bodySize(i, k) * 0.5
    ctx.lineTo(p.x - tn.nx * h, p.y - tn.ny * h)
  }
  ctx.strokeStyle = rgba(shade(bodyTint(k, 0.55), 0.62 * br), 0.5 * kAlpha(k) * 255)
  ctx.lineWidth = Math.max(1, k.baseSize * 0.13)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.stroke()
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
  const br = bodyBright(k)
  const di = lightDirIndex(k.pos.x, k.pos.y)
  const base = bodyDepth(k, k.color)
  for (let i = 0; i < n; i++) {
    const sz = bodySize(i, k)
    if (sz <= 0) continue
    const p = bodyPoint(k, sk, i)
    // 逐段 ellLit，边缘压暗 0.62 → 0.9 → 0.96：
    // 环带的成因是每个椭圆的暗边在重叠处叠加成一条条横带。0.96 后几乎不可见。
    // 仍是渐变填充（回归探针据 fillStyle 是否为渐变识别鱼体），只是对比度极低。
    // 立体感由 drawBodyRim（轮廓压边）与 drawBackLine（背脊折痕）承担。
    //
    // alpha 保留沿体递减 0.97→0.87：这是 jointdiag/stateprobe/turnprobe/finshape
    // 识别「主色身体层」的签名（按 alpha 单调方向切层）。**不要**为了「看起来更干净」
    // 把它改成常量 —— 改了探针直接找不到鱼（实测 4 个探针全挂）。
    // 白缝的另一半原因（相邻段颜色不同）已由 drawBodyPatches 的一次性渐变解决。
    const a = lerp(0.97, 0.87, i / (n - 1)) * kAlpha(k)
    ellLit(ctx, p.x, p.y, sz, shade(base, br), a * 255, di, 0.96)
  }
}

// 沿**弧长**铺的一条斑带：右缘 i0→i1、左缘 i1→i0 围成的闭合多边形。
// 为什么不用「头尾弦的线性渐变」：弦在弯曲的身体上不与体轴对齐，白色带会被压成
// 一条斜细线（实测弯曲帧里像鱼身中间划了道白杠）。带状多边形逐节点跟随体轴，
// 直行和转弯都是同一条真实弧长区间。
// grow：沿法线的外扩量（羽化用），负值表示内缩。
function bodyBandPath(k, i0, i1, grow) {
  const sk = k.sk
  ctx.beginPath()
  for (let i = i0; i <= i1; i++) {
    const p = bodyPoint(k, sk, i)
    const tn = sk.tan[i]
    const h = bodySize(i, k) * 0.5 + grow
    if (i === i0) ctx.moveTo(p.x + tn.nx * h, p.y + tn.ny * h)
    else ctx.lineTo(p.x + tn.nx * h, p.y + tn.ny * h)
  }
  for (let i = i1; i >= i0; i--) {
    const p = bodyPoint(k, sk, i)
    const tn = sk.tan[i]
    const h = bodySize(i, k) * 0.5 + grow
    ctx.lineTo(p.x - tn.nx * h, p.y - tn.ny * h)
  }
  ctx.closePath()
}

// 红白（kohaku）斑纹。画法约束（踩过的两个坑）：
//   ① 逐段椭圆各自上色 → 后画的盖住前一段，斑块过渡处露出月牙白缝；
//   ② 沿头尾弦的线性渐变 → 弯曲的身体上斑带被压成斜细线。
// 所以颜色沿弧长取（带状多边形），边界用「外扩 1 节点半透明 + 实心芯」两级羽化。
function drawBodyPatches(k) {
  const sk = k.sk
  const n = k.body.length
  const p = k.patch
  if (!p || n < 6) return
  const br = bodyBright(k)
  const red = shade(bodyDepth(k, k.color2), br)
  const base = shade(bodyDepth(k, k.color), br)
  const ts = sk.nodeTs
  const idxOf = (t) => {
    for (let i = 0; i < n; i++) if (ts[i] >= t) return i
    return n - 1
  }
  ctx.save()
  ctx.globalAlpha = kAlpha(k)
  // 底色先铺满（白底锦鲤的白），再压斑带 —— 保证身体是实心的，不会露椭圆接缝
  ctx.fillStyle = rgba(base, 255)
  bodyBandPath(k, 0, n - 1, Math.max(1.2, k.baseSize * 0.14))
  ctx.fill()
  // 两段红斑：沿**体轴**羽化（外扩/内缩节点），不是沿体宽缩。
  // 缩「两侧」只会让斑带变窄，两端仍是横切身体的直线，全景下读成一条条绷带。
  ctx.fillStyle = rgba(red, 255)
  for (let b = 0; b < 4; b += 2) {
    const i0 = idxOf(p[b])
    const i1 = idxOf(p[b + 1])
    if (i1 - i0 < 2) continue
    // 羽化范围必须**贴住**端点：外扩 5 个节点（≈19% 体长）时两块红斑会连成一片，
    // 整条鱼变成通体红。这里外扩 1 个节点做一层半透明软边 + 实心芯，边界只软一格。
    ctx.globalAlpha = kAlpha(k) * 0.45
    bodyBandPath(k, Math.max(0, i0 - 1), Math.min(n - 1, i1 + 1), Math.max(1.2, k.baseSize * 0.14))
    ctx.fill()
    ctx.globalAlpha = kAlpha(k)
    bodyBandPath(k, i0, i1, Math.max(1.2, k.baseSize * 0.14))
    ctx.fill()
  }
  ctx.restore()
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
    ell(ctx, p.x - d[0] * sz * 0.2, p.y - d[1] * sz * 0.2, sz * 0.36, rgba('#0e3a4a', 0.05 * (1 - t * 0.5) * kAlpha(k) * 255))
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
// 占位符必须**不带引号**：build 用 JSON.stringify(svg文本) 替换，自带双引号。
// 写成带引号的 '__FIN_PEC_SVG__' 会让运行时字符串首尾多出一对 "，SVG 解析失败 →
// img.onerror → 空画布（Node 回归沙箱无 Image 走不到这条路，探针全绿也发现不了）。
const FIN_ASSETS = {
  pec: { svg: __FIN_PEC_SVG__, rootX: 10, rootY: 28 },
  tail: { svg: __FIN_TAIL_SVG__, rootX: 14, rootY: 50 },
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
    // 注意：加载失败也置 _baked —— 返回空画布而不是 null。null 会让每帧重试解码，
    // 一直失败的素材会永久白费 CPU；空画布静默缺鳍，由 finprobe/目测发现。
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
  // 鳍的染色：参考实现里锦鲤鳍是**淡白半透明**的（比身体亮、几乎是水色），
  // 旧实现直接染 color2 → 尾鳍是一块实心红，像贴在尾柄上的红纸片。
  // 向白色提亮后仍保留一点体色（kohaku 尾鳍本就带淡淡血色）。
  const pecTint = mixHex(k.color2, '#ffffff', 0.8)
  const tailTint = mixHex(k.color2, '#ffffff', 0.66)
  // 胸鳍：鳃盖后两侧各一片，随游动向后外划（sk.flap 相位）。根钉在体缘
  // （部位点 ± 法线 × 半宽），素材 +x 指向尾向并额外偏开 ±(0.5+flap) 向外张。
  const pecSpr = getFinSprite('pec', pecTint)
  if (pecSpr) {
    // 尺寸/角度按全景实拍回收：0.92×baseSize + 张开 ±(0.5+flap) 在正常视距下
    // 是两片横插出体侧的粉「手套」，比参考里几乎看不见的胸鳍夸张一个量级。
    // 锦鲤俯视时胸鳍就是贴体向后的一小片，只有外缘露在体侧之外。
    const finLen = k.baseSize * 0.52
    for (let s = -1; s <= 1; s += 2) {
      const rx = pec.x + pec.nx * s * pec.half * 0.85
      const ry = pec.y + pec.ny * s * pec.half * 0.85
      drawFinImage(pecSpr, rx, ry, Math.atan2(pec.dy, pec.dx) + Math.PI + s * (0.28 + sk.flap * 0.6), finLen, 0.42)
    }
  }
  // 尾鳍：尾端分叉大叶。锚点沿头向反推少许埋入尾柄（根部被主色盖住），
  // 素材 +x 与尾向对齐。
  // 关键：鳍角**不是**死贴身体切线 —— 尾巴是「被身体甩出去」的，相位上滞后身体
  // 行波约 0.9 rad，并且自己做 ±0.3 rad 的扫动。死贴切线的结果是一只装在杆子上的
  // 硬桨（实测特写：尾鳍像一根细棍顺着身体伸直）。参考实现同样给鳍加了独立相位。
  const tailSpr = getFinSprite('tail', tailTint)
  if (tailSpr) {
    const tailLen = k.baseSize * 1.8
    const lag = 0.3 * Math.sin((k.swimPhase || 0) - 0.9)
    // 根部埋深 0.16 → 0.28：0.16 时尾柄末端的压边线正好卡在鳍根前沿，
    // 特写下尾鳍像「悬」在身体后面；埋深后鳍根被白色尾柄盖住，接缝消失。
    drawFinImage(
      tailSpr,
      tail.x + tail.dx * tailLen * 0.28,
      tail.y + tail.dy * tailLen * 0.28,
      Math.atan2(tail.dy, tail.dx) + Math.PI + lag,
      tailLen,
      0.6
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
  // 颜色从「主色提亮 40%」改为「主色/尾腹色的中间色再压暗」：
  // 白底锦鲤的提亮色就是纯白，一条纯白中缝压在红斑上会在 9× 特写里读成假接缝。
  // 中间色 + 低 alpha + 半径小，红斑上是略深的折痕、白斑上是淡淡的灰 —— 两侧都成立。
  ctx.save()
  ctx.strokeStyle = rgba(shade(mixHex(k.color, k.color2, 0.5), 0.84), 255)
  ctx.globalAlpha = 0.3 * kAlpha(k)
  ctx.lineWidth = Math.max(1, k.baseSize * 0.12)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  for (let i = i0; i <= i1; i++) {
    const p = bodyPoint(k, sk, i)
    if (i === i0) ctx.moveTo(p.x, p.y)
    else ctx.lineTo(p.x, p.y)
  }
  ctx.stroke()
  ctx.restore()
}
