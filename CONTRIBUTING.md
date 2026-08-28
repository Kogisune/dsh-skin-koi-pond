# 贡献指南 · Contributing

感谢你考虑为 **dsh-skin-koi-pond（锦鲤池塘）** 贡献力量！本文件说明如何本地开发、提交规范与 PR 流程。

> PR 可用中文或英文提交，描述清晰即可。

## 开发环境
- **Node.js** ≥ 22
- **包管理器**：pnpm（仓库含 `pnpm-lock.yaml`）
- 克隆后安装依赖：
  ```bash
  pnpm install
  ```

## 项目结构
本主题是 **DSH WebUI 的纯展示层皮肤**，目录职责如下：

| 路径 | 职责 |
|---|---|
| `css/` | 按 7 个部件拆分的主题样式（background / sidebar / titlebar / composer / overlay / fonts / ui） |
| `plugin/` | 客户端注入逻辑（锦鲤画布动画、配色预设） |
| `skin.json` | 主题声明，DSH 读取的入口 |
| `lib/` | **构建产物**，由 `scripts/build.mjs` 生成，是 DSH 实际加载的内容 |
| `scripts/` | `build.mjs`（构建）、`validate.mjs`（校验） |

> ⚠️ **`lib/` 需要提交**：DSH 直接加载 `lib/`，因此改动 `css/` 或 `plugin/` 后必须重建并把新的 `lib/` 一并提交。

## 本地开发流程
```bash
node scripts/build.mjs     # 改动 css/ 或 plugin/ 后，重新生成 lib/
node scripts/validate.mjs  # 提交前校验（结构/字段完整性）
```

## 提交规范
沿用本仓库约定：`type: 简述（中文补充说明）`
- `feat` 新特性 · `fix` 修复 · `docs` 文档 · `style` 样式 · `chore` 杂项

## PR 流程
1. Fork 并新建分支（`feat/xxx`、`fix/xxx`）
2. 本地改动 → 重建 `lib/` → 跑 `validate.mjs`
3. 提交（中文说明），发起 PR，描述改动动机与验证方式
4. 若涉及文档，请同步更新 `README.en.md`

## 范围约定
- 仅覆盖 DSH 官方设计令牌（`--dsw-alias-*`）与部件样式；**不引入服务、不发送 Cordis 事件、不触达模型请求**。
- 新增配色预设请在 `plugin/koi/koiSchemes.js` 注册，并同步更新 README 的配色表。
