# dsh-skin-koi-pond · 锦鲤池塘

> DeepSeek Harness (DSH) WebUI 主题 — 墨青池水、锦鲤点红。

兼容 [dsh-theme-manager](https://github.com/Kogisune/dsh-theme-manager) 主题标准（`skin.json` 声明 + 按部件拆分 CSS，支持托管模式）。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 预览

<p align="center">
  <img src="preview/dark.png" alt="池塘夜色（深色）" width="49%"/>
  <img src="preview/light.png" alt="宣纸日色（浅色）" width="49%"/>
</p>

<p align="center">深色「池塘夜色」 · 浅色「宣纸日色」</p>

## 特性

- 🐟 **Canvas 锦鲤池塘动画**：原生 Canvas 2D 鱼群（flocking 聚群/对齐/分离 + 鼠标驱赶逃逸），荷叶 Perlin 边缘与缺刻、水波涟漪，点击水面泛起波纹；无 p5 依赖，`prefers-reduced-motion` 自动降级为静态渲染，页面隐藏时暂停
- 🎨 **亮暗双主题**：深色「池塘夜色」（墨青池水 + 月光白 + 锦鲤橙红 `#f26a3c`）/ 浅色「宣纸日色」（米白宣纸 + 墨色 + 朱红 `#d9562f`）
- 🪟 **背景遮罩**：15% 白 + 3px 模糊，柔化动画、突出前景 UI
- 🧩 **组件化主题**：7 部件拆分（background/sidebar/titlebar/composer/overlay/fonts/ui），支持 theme-manager 托管模式按部件启停、即时生效
- 🌊 辅助色：金鳞 `#d9a441` / 荷叶 `#3fae7a` / 水光蓝 `#4fb8c9`
- 🎮 实时换色：浏览器控制台 `__koiSetScheme('ogon')`（红白/丹顶/黄金/绯写等 9 预设 + 随机彩蛋），不重建鱼群

纯展示层：仅覆盖 DSH 官方设计令牌（`--dsw-alias-*`）与部件样式，不注入服务、不发 Cordis 事件、不触达模型请求。

## 主题标准（dsh-theme-manager 兼容）

`skin.json` 声明：

```jsonc
{
  "id": "koi-pond",
  "name": "锦鲤池塘",
  "theme": {
    "kind": "full",            // 完整皮肤（与其它完整主题互斥）
    "family": "koi",           // 系列：同系列主题互斥
    "components": { /* 7 部件全量 */ }
  },
  "css": {
    "*": ["css/base.css"],          // 共享基础（设计令牌）
    "background": ["css/background.css"],
    "sidebar": ["css/sidebar.css"],
    "titlebar": ["css/titlebar.css"],
    "composer": ["css/composer.css"],
    "overlay": ["css/overlay.css"],
    "fonts": ["css/fonts.css"],
    "ui": ["css/ui.css"]
  }
}
```

- 按部件拆分 CSS → 支持 theme-manager **托管模式**（部件混合即时生效，无需刷新）
- `theme.family: koi` → 与未来小只鲤系列主题互斥，不会与其它系列皮肤踩踏
- `z-index` 统一走 `--koi-z-*` 变量，规避弹层撞车

## 安装

### 方式一：作为 DSH 插件（bundle 直载）

```bash
dsh plugin --profile web add github:Kogisune/dsh-skin-koi-pond
# 重启 dsh web 生效；卸载即复原
```

### 方式二：theme-manager 托管（推荐，可部件级控制）

```bash
dsh plugin --profile web add github:Kogisune/dsh-skin-koi-pond
# 打开 设置 → 主题管理 → 锦鲤池塘 → 开启「托管」
# 之后可按部件启停 / 排序 / 冲突检测，改动即时生效
```

## 开发

```bash
node scripts/build.mjs        # 构建：css/ + koi 模块 → lib/client.js 自包含 bundle（CSS 内联）
node scripts/validate.mjs     # 结构校验（skin.json / css 文件 / 部件一致性）
pnpm test                     # 同 validate
```

> ⚠️ 改过 `css/` 或 `plugin/` 后必须重新 `node scripts/build.mjs` 才会在 DSH 中生效（DSH 加载的是 `lib/` 构建产物）。

## 目录

```
css/            # 按部件拆分的主题 CSS（theme-manager 直接读取）
plugin/         # 插件源码（index.js 宿主入口 / client.js 客户端注入 / koi/ 动画引擎）
scripts/        # build / validate
lib/            # 构建产物（已提交，clone 即用）
```

## 开源说明

- 锦鲤池塘动画引擎（`plugin/koi/`）移植自 [carps.top](https://www.carps.top)（MIT，AstroPaper 衍生项目），原实现为博客背景的锦鲤池塘 Canvas 动画
- 本主题整体以 [MIT](LICENSE) 协议开源，欢迎提交 issue 与 PR

## 许可

[MIT](LICENSE) © [Kogisune](https://github.com/Kogisune)
