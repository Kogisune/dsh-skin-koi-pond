# dsh-skin-koi-pond · 锦鲤池塘

> DeepSeek Harness (DSH) WebUI 主题 — 墨青池水、锦鲤点红。
> 兼容 [dsh-theme-manager](https://github.com/Kogisune/dsh-theme-manager) 主题标准（`skin.json` 声明 + 按部件拆分 CSS，支持托管模式）。

## 设计语言

| 意象 | 实现 |
| --- | --- |
| 池塘夜色（深色） | 墨青池水渐变底 + 月光白文字 + 锦鲤橙红强调 |
| 宣纸日色（浅色） | 米白宣纸底 + 墨色文字 + 朱红锦鲤 |
| 水波涟漪 | 纯 CSS 涟漪动画（`[data-koi-ripple]` 装饰层，`prefers-reduced-motion` 自动静止） |
| 锦鲤剪影 | SVG data URI 右下角浮动（`[data-koi-koi]`，缓游动画） |
| 金鳞 / 荷叶 / 水光 | 辅助色：`#d9a441` / `#3fae7a` / `#4fb8c9` |

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
pnpm build                     # 生成自包含 lib/（CSS 内联）
dsh plugin --profile web add D:/Github/dsh-skin-koi-pond
# 重启 dsh web 生效；卸载即复原
```

### 方式二：theme-manager 托管（推荐，可部件级控制）

```bash
dsh plugin --profile web add D:/Github/dsh-skin-koi-pond
# 打开 设置 → 主题管理 → 锦鲤池塘 → 开启「托管」
# 之后可按部件启停 / 排序 / 冲突检测，改动即时生效
```

## 开发

```bash
node scripts/build.mjs        # CSS → lib/ 内联构建
node scripts/validate.mjs      # 结构校验（skin.json / css 文件 / 部件一致性）
```

## 目录

```
css/            # 按部件拆分的主题 CSS（theme-manager 直接读取）
plugin/         # 插件源码（index.js 宿主入口 / client.js 客户端注入）
scripts/        # build / validate
lib/            # 构建产物（自包含，发布用）
```

## 许可

[MIT](LICENSE) © Kogisune
