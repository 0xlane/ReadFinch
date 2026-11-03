# 验证记录

ReadFinch / 伴读雀 1.0.0，验证日期：2026-11-03。

## 构建与功能

- TypeScript 检查、生产构建及 **159 项核心测试**通过，覆盖配置、提供商、流式回答、思考摘要、缓存、快捷键、笔记和更新逻辑。
- GitHub Actions 在 Windows、macOS、Linux 上运行核心测试与断网 OCR 验证；发布流水线生成 Windows x64、macOS arm64/x64 和 Linux x64 安装包。
- “关于”页使用实际 Electron 窗口验证：版本信息、项目链接、更新状态、自动更新开关、中英文与深浅色。下载来源由内部选择，不显示在更新卡片中。
- 自动更新默认开启，开关即时保存并在重启后保留。设备更新偏好独立于可迁移配置；浮窗无法调用安装更新或修改更新偏好的接口。
- 更新测试覆盖清单签名、错误签名拒绝、版本比较、架构选择、下载回退、取消下载、文件长度与 SHA-512 校验、手动更新、安装时机及失败重试。
- 已安装的 Windows 程序使用真实 electron-updater 传输验证本地签名测试清单，模拟直连失败后回退下载。该测试使用隔离配置，不执行测试安装包。

[界面与持久化记录](update-ui-verification.json) · [实际公开版本升级记录](update-install-verification.json) · [生产包记录](packaged-smoke.json) · [离线 OCR 记录](offline-ocr-verification.json)

## Windows 实际升级

通过已安装应用自身的更新器，从本地验证版本 0.99.0 下载 GitHub Release 的正式 1.0.0 安装包并重启升级。随后重新启动实际安装版本，执行手动检查，确认返回“已是最新版本”。

- 安装目录：%LOCALAPPDATA%\Programs\ReadFinch。
- 数据目录：%APPDATA%\ReadFinch。
- 原有提供商、默认配置、外观、划词设置、快捷键、指令和本地笔记库配置保留。
- 加密凭据文件与升级前逐字节一致；没有修改或重新录入密钥。
- 自动更新保持开启；原有开机启动设置保留。
- 原生划词辅助程序与内置离线 OCR 资源正常加载。

[安装记录](installation-verification.json) · [正式发布包及 SHA256SUMS](https://github.com/0xlane/ReadFinch/releases/tag/v1.0.0)

## 验证范围

Windows 的安装、更新与应用窗口已经在当前系统实测。macOS、Linux 的 CI 构建、打包与离线 OCR 验证不能替代真实桌面的选区、权限和交互验收，详见[平台矩阵](PLATFORMS.md)。当前 macOS 包使用临时签名、没有 Apple 公证，更新后需手动替换应用；Windows 尚未使用 Authenticode 证书。应用更新清单签名与操作系统代码签名是不同机制，详见[发布与更新说明](UPDATES.md)。
