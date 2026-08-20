# 预览图（Preview）

公开仓库的 README 与 dsh-theme-manager 面板会用到预览图。放置：

- `preview/light.png` — 浅色主题截图（宣纸日色）
- `preview/dark.png` — 深色主题截图（池塘夜色）

放好后在 `skin.json` 中启用：

```jsonc
"preview": { "light": "preview/light.png", "dark": "preview/dark.png" }
```

截图建议：1280×800 左右，展示完整 WebUI（侧栏 + 对话区 + 输入框 + 背景鱼群）。
