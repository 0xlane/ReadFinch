# 验证记录

## macOS 原生窗口按钮（2026-11-04）

- 设置窗口使用 macOS 原生关闭、最小化与全屏按钮；结果浮窗使用原生关闭控件并保留置顶。标题栏为原生按钮预留空间，不再绘制右侧的自定义窗口按钮。
- 隔离 Electron 实测：原生按钮位置、无重复 HTML 控件、标题栏间距、最小化/恢复、关闭设置后继续驻留、关闭固定浮窗均通过。
- 打包版通过系统辅助功能树确认存在原生关闭/最小化/全屏控件，并实际点击绿色按钮进入全屏、通过系统快捷键退出全屏。
- TypeScript 检查、生产构建和本地 Mac x64 打包通过；未修改版本号，打包使用 `--publish never`。本地 ad-hoc 重签名后，macOS 会要求重新确认应用权限，设置页提供授权指引。

## macOS x64 本机验证（2026-11-04）

ReadFinch 1.2.1 工作区修复版；macOS 15.8.1、Intel x64、Electron 45.2.1、Node 26.5.0、2× Retina 单显示器。全部测试使用隔离数据目录。

- 类型检查、生产构建和 175 项核心测试全部通过；离线 OCR 在禁网条件下通过。
- 凭据改为 `credentials.json` 明文持久化，系统加密 API 被禁用时仍可保存。显示/隐藏已保存密钥、修改后真实 HTTP 请求、重启、请求头、WebDAV 密码、复制、地址隔离、删除及窗口权限边界全部通过。
- 原生 Cocoa `NSTextView` 的真实选区经 Swift/AX 读取；浮标不抢焦点，清空选区和密码框不会留下旧选区；真实 Option+T 按键可刷新选区并触发翻译，没有注入选区或快捷键回调。
- 实际截图、框选、Esc/右键取消、恢复窗口和 OCR 通过；2× Retina 裁剪及预览与原始截图的像素比对一致。
- 设置、模型发现、翻译、词典、写作、笔记、缓存、主题、语言、快捷键录入、系统/在线朗读、旧版配置与加密凭据迁移、更新界面均通过桌面回归。
- `npm run pack -- --mac --x64` 产出 `release/mac/ReadFinch.app`，打包版启动、Command+A 及完整密钥回归（含多次重启）均通过。应用使用 ad-hoc 签名，未进行 Apple 公证。

主要复现入口：`npm test`、`npm run test:credentials`、`npm run test:macos`、`npm run test:input`、`npm run test:settings`、`npm run test:desktop`、`npm run test:shortcuts`、`npm run test:speech`、`npm run test:upgrade`、`npm run test:updates`、`npm run test:ocr`。

[结构化 Mac 验证记录](macos-verification.json)。AI、在线 OCR 和在线朗读使用本机 HTTP 样例，未验证外部服务质量或真实账号可用性。原生选区只覆盖专用 Cocoa 样例，尚未覆盖所有浏览器/PDF/第三方应用、Apple silicon、多显示器或混合 DPI。Mac 当前提供复制结果，不提供原位替换。

## macOS 正常启动与权限补验

自动化脚本从测试宿主派生 Electron 进程，TCC 日志显示权限可能归属于测试宿主。此类测试的 `accessibility: true` / `screen: granted` 不能证明 Finder 正常启动的 ReadFinch 已独立获得授权。

本机正常启动曾出现划词服务不可用：系统日志确认旧版本与新构建的签名要求不匹配，辅助功能授权未授予当前应用。已修复以下行为，并通过 Finder 启动验证缺少权限时的真实界面：

- 启动读取辅助功能与录屏权限；正常启动缺少权限时直接显示设置页，提供具体原因和系统设置入口，回到应用时重新检查。
- 划词入口先检查辅助功能，截图入口先检查录屏；缺少权限时转到对应指引，不继续读取或抓屏。
- Swift 助手在未授权时保持等待，定期检查授权变化；授权后自动连接，撤销后清除选区。
- 助手退出后停止看门狗，保留原始错误，避免将授权问题误报成“目标应用响应超时”。新增两项回归覆盖错误保留及权限等待/恢复/撤销。
- 辅助功能按钮已实际打开系统设置的对应页面；最初系统列表中 ReadFinch 开关关闭。经用户明确确认并完成系统身份验证，已将辅助功能重新绑定到当前修复版，录屏权限也已开启；应用中的权限提示消失，划词状态自动恢复为“划词服务运行中”。未以测试宿主权限代替应用自身授权。

## 历史 Windows 验证

以下为 ReadFinch / 伴读雀 1.0.0 在 2026-11-03 的记录。

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

Windows 的安装、更新与应用窗口已在历史环境实测；macOS 本机验证见本文首节。其他平台的 CI 构建不能替代真实桌面交互验收，详见[平台矩阵](PLATFORMS.md)。当前 macOS 包使用临时签名、没有 Apple 公证，更新后需手动替换应用；Windows 尚未使用 Authenticode 证书。应用更新清单签名与操作系统代码签名是不同机制，详见[发布与更新说明](UPDATES.md)。

正常启动补验确认了权限提示、系统设置入口与授权后自动连接。当前打包版的工具栏在真实第三方应用中的可见性仍需用户继续确认；本次文本编辑器自动化打开超时，没有将该步骤记录为通过。
