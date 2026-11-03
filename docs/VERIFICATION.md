# 交付与验证

ReadFinch / 伴读雀 0.14.0 使用独立的应用身份、安装目录和数据目录。

## 本地验证

2026-11-03，在 Windows x64 上完成：

- TypeScript 检查、生产构建及 **86 项核心测试**通过。
- 实际 Electron 流程通过：提供商设置、指令与输出版式、划词工具栏、语音、缓存和托盘启动、代理请求、本地笔记，以及中英文文档截图生成。
- 离线 OCR 在禁止网络的主线程和 Worker 中完成中英文、深浅背景及小字号测试。低清晰度文本仍需校对。
- 生产包检查通过：应用名称、版本、快捷键注册、模型选择、内置图标、本地笔记、离线 OCR、原生选区辅助程序，以及独立代理路由。开发专用的选区测试接口在生产包中不可用。
- 应用归档内的 5,433 个文本文件、归档资源名称及原生辅助程序扫描通过，使用统一的 ReadFinch 身份。

[桌面流程记录](context-smoke.json) · [设置记录](settings-verification.json) · [生产包记录](packaged-smoke.json) · [代理记录](packaged-proxy-verification.json) · [OCR 记录](offline-ocr-verification.json)

## Windows 安装

已运行当前用户 NSIS 静默安装并验证实际安装的应用：

- 安装目录：`%LOCALAPPDATA%\Programs\ReadFinch`。
- 数据目录：`%APPDATA%\ReadFinch`，使用全新默认配置。
- 卸载名称：`ReadFinch 0.14.0`；卸载程序：`Uninstall ReadFinch.exe`。
- 桌面和开始菜单快捷方式均为 `ReadFinch`，应用 ID 为 `app.readfinch.ReadFinch`。
- 初始提供商为 1 个，凭据和笔记为空；界面语言跟随系统，开机启动默认关闭。
- 原生辅助程序为 `readfinch-selection.exe`，实际连接成功；内置 OCR 资源可用。

之前安装的产品已卸载，其用户数据单独备份在项目之外，没有导入新应用。交互式安装向导界面未逐页验收。

[安装验证记录](installation-verification.json) · [产物与 SHA-256](release-manifest.json)

macOS、Linux 的构建与核心测试由仓库 CI 检查；平台桌面交互和签名、公证状态见[平台矩阵](PLATFORMS.md)。
