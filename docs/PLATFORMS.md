# 平台能力与验证矩阵

状态说明：**已测**＝本环境实际执行通过；**实现/待测**＝存在真实平台代码，但没有成功的目标机交互证据；**受限**＝平台能力限制，提供明确回退；**未提供**＝当前没有实现。

| 能力            | Windows x64（当前环境）                         | macOS                                    | Linux X11                                   | KDE Plasma / Wayland                                             |
| --------------- | ----------------------------------------------- | ---------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------- |
| 应用构建、主 UI | 已测                                            | 实现/待测                                | 实现/待测                                   | 实现/待测                                                        |
| 自动选区        | UIA、标准 Edit、嵌入网页选区已测                | AXSelectedText 实现/待测，需辅助功能权限 | PRIMARY 实现/待测，需 xclip、xdotool、xprop | 受限：无通用全局选区协议，使用显式剪贴板入口                     |
| 不抢焦点浮标    | showInactive + focusable:false，前台样例已测    | 实现/待测                                | 实现/待测                                   | 不提供自动浮标                                                   |
| 全局快捷键      | 注册、录入/自动保存、冲突及动作回调已测；真实前台按键取词待测 | 实现/待测                         | 实现/待测                                   | GlobalShortcuts portal，需桌面确认/支持；可用托盘入口             |
| 区域截图        | 截图、取消/恢复、125% 缩放裁剪与前台中英文样例已测 | 同路径，需系统录屏权限，待测             | 同路径，待测                                | Screenshot portal 的交互区域选择；需 python3-gi 与门户后端，待测 |
| 图片导入/预览   | 解码、OCR、可编辑文本已测                       | 实现/待测                                | 实现/待测                                   | 实现/待测                                                        |
| 离线中英文 OCR  | WASM、语言包、禁网主线程/Worker 已测            | 同引擎，目标机待测                       | 同引擎，目标机待测                          | 同引擎，目标机待测                                               |
| 原位替换        | 标准 Edit 替换与过期选区拒绝已测               | 未提供，使用复制                         | 未提供，使用复制                            | 不提供模拟输入，使用复制                                         |
| 安全凭据        | Electron 异步 OS 加密路径已测                   | Keychain 实现/待测                       | libsecret/KWallet 实现/待测                 | KWallet6/libsecret 实现/待测；缺失时仅内存                       |
| 配置/WebDAV     | 本机真实 HTTP 双配置测试已测                    | 平台无关逻辑已测，目标机待测             | 同左                                        | 同左                                                             |
| 打包            | 见 VERIFICATION.md 的实际产物                   | 配置已写，签名/公证/目标机待测           | AppImage/deb 配置，目标机待测               | 同左，并校验 desktop ID                                          |

当前桌面为 Windows，设备像素比为 1.25。主 UI、原生选区与图像 OCR 已在这个缩放比例下检查。多显示器、负坐标屏幕、不同 DPI 混合布局仍需人工检查，不能用单显示器测试推断这些场景。

`test:input` 验证真实 `desktopCapturer`、框选操作及裁剪像素比对。`test:native` 使用独立标准编辑器验证真实选区、焦点、替换、过期保护与屏幕 OCR；`test:selection` 使用独立 Electron 应用验证焦点和正文分离、跨站嵌入文档、清除选区、密码框及工具栏恢复。记录见 [原生测试](native-smoke.json) 和 [打包版选区测试](selection-compatibility-packaged.json)。这些样例不代表所有第三方应用均已测试；未公开 UIA 文本选区的界面仍需 OCR 或剪贴板。

## 更新方式

Windows NSIS 安装版和 Linux AppImage 支持下载后退出安装或立即重启更新。Windows 便携版、macOS 与 Linux DEB 提供校验后的下载包，由用户手动安装。macOS 首次发布使用 ad-hoc 签名，尚无 Apple 开发者证书与公证，因此不启用 Squirrel.Mac 自动替换。所有平台共享默认开启的自动检查、GitHub 优先与 gh-proxy 回退。详见 [更新机制](UPDATES.md)。

## Windows 人工清单

1. 打开普通记事本/标准 Edit 及浏览器，实际拖动选中一段非敏感样例文字。
   另用 Shift + 方向键选择另一段文字，按当前配置的翻译、词典、润色快捷键；确认直接打开对应卡片且原文为新选区。暂停自动浮标后重试；取消选区后再按，应显示无选区提示。输入框中设置新的组合键后确认旧键释放、重启仍有效；录入和编辑提示词时不得误运行动作。
2. 确认浮标出现时原应用仍有焦点，且没有模型请求。
3. 点击图标工具条的翻译、词典和润色，使用已配置的真实文字服务；验证原文折叠、复制、取消、服务切换、重试、Esc、失焦收起及固定后保留位置。
4. 标准 Edit 中生成结果后检查替换；随后改变原选区或目标内容，再用旧结果替换，必须被拒绝。
5. 触发区域截图，分别在不同显示器和缩放比例裁剪样例文字；检查像素映射、取消和 OCR。
6. 关闭/排除应用，确认浮标行为符合配置。
7. 在系统中切换深浅模式，检查设置、工具条和结果卡片同步；修改设置后关闭再打开，确认自动保存生效。

## macOS / Linux 验收准备

- macOS：在目标机编译 Swift helper；通过系统界面授权辅助功能和录屏；验证菜单栏/焦点、AXSelectedText、全局快捷键。签名和 notarization 应在分发前完成。
- X11：安装 `xclip xdotool xprop`，验证 PRIMARY 所有者与前台应用切换。它不是读取所有应用内部编辑模型的通用 API，无法保证原位替换。
- 0.2.2 的快捷键显式刷新使用 Windows/macOS helper 的带请求 ID 的响应；Windows 不因快捷键仍按住 Shift 而跳过读取。X11 重新读取 PRIMARY 并核对查询前后的前台窗口，但 PRIMARY 的保留/所有者行为仍由目标应用决定。Wayland 无通用选区时继续通过 OCR 或剪贴板入口取词。
- Wayland：安装 `xdg-desktop-portal`、对应桌面后端（KDE 为 `xdg-desktop-portal-kde`）和 `python3-gi`。安装包的 `.desktop` 名称、Electron desktopName 与 StartupWMClass 使用 `app.readfinch.ReadFinch`。快捷键需门户授权；开发未安装应用时可能只能使用主界面按钮。
- Wayland 不尝试通过 X11 工具绕过合成器限制，也不合成粘贴事件。用户先复制，然后显式调用剪贴板入口。

平台依据：[Electron 截屏 API](https://www.electronjs.org/docs/latest/api/desktop-capturer)、[GlobalShortcut 的 Linux 行为](https://www.electronjs.org/docs/latest/api/global-shortcut)、[SafeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)、[Screenshot portal](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.Screenshot.html)、[Windows TextPattern](https://learn.microsoft.com/en-us/dotnet/framework/ui-automation/ui-automation-textpattern-overview)。
