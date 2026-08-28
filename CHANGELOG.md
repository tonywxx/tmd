# Changelog / 更新日志

All notable changes to **tmd** are documented here in both English and 中文, newest
release first. Version tags follow [Semantic Versioning](https://semver.org/).
本项目所有重要变更均在此以英文与中文双语记录，最新版本在前。版本号遵循语义化版本规范。

---
## [v0.2.9] - 2026-08-28

- Implement markdown alert features

## [v0.2.8] - 2026-08-27

- Added support for multiple markdown themes with a new settings option and corresponding CSS.
- Integrated KaTeX for math rendering in markdown.
- Enhanced settings dialog to include a live preview of selected markdown themes.
- Updated document export functionality to include selected markdown theme styles.
- Refactored markdown rendering logic to accommodate new themes and math rendering.

## [v0.2.7] - 2026-08-26

- Updated `syn` from 3.0.3 to 3.0.4 and other dependencies in `Cargo.lock`.
- Bump version in `Cargo.toml` and `tauri.conf.json` to 0.2.6.
- Refactor zoom functionality in the app, removing native menu accelerators.
- Implement keyboard shortcuts for zooming in, out, and resetting zoom.
- Enhance focus mode in the editor to always show both editor and preview.
- Update settings dialog for better user experience and layout.
- Clean up CSS for focus mode styling.
- Integrate clipboard manager plugin
---

## [v0.2.4] - 2026-08-16

### Added / 新增

- Add a CI workflow covering both the frontend (Vite / `tsc`) and the Rust
  (`cargo`) integration build.
  — 新增同时覆盖前端（Vite / `tsc`）与 Rust（`cargo`）集成构建的 CI 工作流。
- Handle deep links for local file paths (`tmd://open?path=…`); add new
  application icons.
  — 支持本地文件路径的深链接（`tmd://open?path=…`）；新增应用图标。

---

## [v0.2.3] - 2026-08-14

### Changed / 变更

- Refactor the Mermaid loading strategy in `vite.config.ts` for more reliable
  diagram rendering.
  — 重构 `vite.config.ts` 中的 Mermaid 加载策略，使图表渲染更可靠。

---

## [v0.2.2] - 2026-08-14

### Changed / 变更

- Refactor clipboard handling in the Open-from-Path and Open-from-URL dialogs.
  — 重构「从路径打开」与「从 URL 打开」对话框中的剪贴板处理逻辑。

---

## [v0.2.1] - 2026-08-14

### Changed / 变更

- Bump version to 0.2.1 across `package.json` and `tauri.conf.json`.
  — 在 `package.json` 与 `tauri.conf.json` 中将版本号提升至 0.2.1。

---

## [v0.2.0] - 2026-08-14

### Added / 新增

- Auto-download updates in the background and show update status in the sidebar.
  — 在后台自动下载更新，并在侧边栏显示更新状态。

---

## [v0.1.9] - 2026-08-14

### Changed / 变更

- Bump version to 0.1.9 for release.
  — 为发布将版本号提升至 0.1.9。

---

## [v0.1.8] - 2026-08-14

### Fixed / 修复

- Updater: add a timeout to the beta-channel check and register the download
  command permission.
  — 更新器：为测试频道检查增加超时，并注册下载命令权限。

---

## [v0.1.7] - 2026-08-14

### Changed / 变更

- Bump version to 0.1.7 for release.
  — 为发布将版本号提升至 0.1.7。

---

## [v0.1.6] - 2026-08-14

### Changed / 变更

- Bump version to 0.1.6 for release.
  — 为发布将版本号提升至 0.1.6。

---

## [v0.1.5] - 2026-08-14

### Fixed / 修复

- CI: sign the updater archive with the Tauri signer and generate
  `latest.json`.
  — CI：使用 Tauri 签名工具对更新包签名并生成 `latest.json`。

---

## [v0.1.4] - 2026-08-14

### Fixed / 修复

- CI: generate and upload `latest.json` from the bundler signature so
  auto-update can find releases.
  — CI：根据打包签名生成并上传 `latest.json`，使自动更新可定位发布版本。

---

## [v0.1.3] - 2026-08-14

### Changed / 变更

- Bump version to 0.1.3 (auto-update test target).
  — 将版本号提升至 0.1.3（自动更新测试目标）。

---

## [v0.1.2] - 2026-08-14

### Changed / 变更

- Bump version to 0.1.2 for auto-update testing.
  — 为自动更新测试将版本号提升至 0.1.2。

---

## [v0.1.1] - 2026-08-14

### Added / 新增

- Implement the auto-update feature with GitHub release integration and UI
  enhancements.
  — 实现基于 GitHub Releases 的自动更新功能及相关的界面增强。
- Repair the GitHub release workflow so auto-update releases publish correctly.
  — 修复 GitHub 发布工作流，使自动更新版本能正确发布。
- Use a separate ad-hoc build step so Tauri signs without an Apple certificate.
  — 采用独立的 ad-hoc 构建步骤，使 Tauri 在无 Apple 证书时也能签名。

### Fixed / 修复

- Updater: rotate the Tauri signing key and bump version to 0.1.1.
  — 更新器：轮换 Tauri 签名密钥并将版本号提升至 0.1.1。
- CI: pin `tauri-action` to `v0.6.2` for reproducible builds.
  — CI：将 `tauri-action` 固定到 `v0.6.2` 以保证构建可复现。

---

## [v0.1.1-beta.1] - 2026-08-14

### Changed / 变更

- Update version to 0.1.1 and improve Apple certificate import logic.
  — 更新至 0.1.1 并改进 Apple 证书导入逻辑。

---

## [Initial] / 初始版本 - 2026-08-13

- Project initialization: native Tauri 2 + React 19 + TypeScript Markdown editor
  with CodeMirror editor, live preview, file browser, tabs, and multi-window
  support.
  — 项目初始化：基于 Tauri 2 + React 19 + TypeScript 的本地 Markdown 编辑器，
  包含 CodeMirror 编辑器、实时预览、文件浏览器、标签页与多窗口支持。
