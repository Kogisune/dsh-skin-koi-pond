# 更新日志 · Changelog

本文件记录 **dsh-skin-koi-pond（锦鲤池塘）** 的发布变更。格式参考 [Keep a Changelog](https://keepachangelog.com/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.1.0] - 2026-08-28

首个公开版本。

### ✨ 新增特性
- **锦鲤池塘主题**：墨青池水为底、水波涟漪为纹、锦鲤橙红点睛，含「宣纸日色」(亮) 与「池塘夜色」(暗) 双主题
- **客户端锦鲤画布动画**：轻量、纯展示层，不占用额外服务
- **按 7 部件拆分 CSS**：`background / sidebar / titlebar / composer / overlay / fonts / ui`，遵循 `skin.json` 主题规范
- **9 套锦鲤配色预设 + 随机彩蛋**：支持 `window.__koiSetScheme(id)` 在控制台即时切换
- **中英双语文档**与**社区健康文件**（`CONTRIBUTING` / `CODE_OF_CONDUCT` / `SECURITY`、issue/PR 模板）

### 🧹 变更
- 主题改为**自描述**（standalone DSH 皮肤），移除对外部 `dsh-theme-manager` / `theme-manager` /「托管模式」的引用与依赖
- README 顶部补充 `version` / `stars` / `last-commit` 徽章

### 📦 安装
```bash
dsh plugin --profile web add github:Kogisune/dsh-skin-koi-pond
# 重启 dsh web 生效；卸载即复原
```

### 🎨 自定义配色
打开浏览器控制台，切换任意预设：
```js
window.__koiSetScheme('kohaku')   // 红白
window.__koiSetScheme('random')   // 随机彩蛋
```

### ⚠️ 范围说明
本主题是 DSH WebUI 的**纯展示层**，仅覆盖 DSH 官方设计令牌（`--dsw-alias-*`）与部件样式；不引入服务、不发送 Cordis 事件、不触达模型请求。

### 📸 预览
见 `preview/light.png`（亮色）与 `preview/dark.png`（暗色）。建议在 GitHub Release 中作为附件上传，增强分享卡片展示。
