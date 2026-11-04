# 平台能力与验证矩阵

状态说明：**已测**＝在对应记录环境实际执行通过；**实现/待测**＝存在真实平台代码，但没有成功的目标机交互证据；**受限**＝平台能力限制，提供明确回退；**未提供**＝当前没有实现。

| 能力            | Windows x64（历史验证）                         | macOS                                    | Linux X11                                   | KDE Plasma / Wayland                                             |
| --------------- | ----------------------------------------------- | ---------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------- |
| 应用构建、主 UI | 已测                                            | x64 本机构建、设置与主要流程已测                                | 实现/待测                                   | 实现/待测                                                        |
| 自动选区        | 标准 Edit、UIA 嵌入网页和 Java Swing 选区已测                | NSTextView 真机选区、AX 范围、网页标记及密码框逻辑已测；第三方应用待测 | PRIMARY 实现/待测，需 xclip、xdotool、xprop | 受限：无通用全局选区协议，使用显式剪贴板入口                     |
| 不抢焦点浮标    | showInactive + focusable:false，前台样例已测    | 本机前台焦点、Space 配置及菜单交互已测                                | 实现/待测                                   | 不提供自动浮标                                                   |
| 全局快捷键      | 注册、录入/自动保存、冲突及动作回调已测；真实前台按键取词待测 | 注册、录入、冲突及真实 Option+T 已测                         | 实现/待测                                   | GlobalShortcuts portal，需桌面确认/支持；可用托盘入口             |
| 区域截图        | 截图、取消/恢复、125% 缩放裁剪与前台中英文样例已测 | 本机 2× Retina 截图、裁剪像素与取消恢复已测，需录屏权限             | 同路径，待测                                | Screenshot portal 的交互区域选择；需 python3-gi 与门户后端，待测 |
| 图片导入/预览   | 解码、OCR、可编辑文本已测                       | 图片输入、预览、OCR 和可编辑文本已测                                | 实现/待测                                   | 实现/待测                                                        |
| 离线中英文 OCR  | WASM、语言包、禁网主线程/Worker 已测            | 禁网引擎及真实桌面识别已测                       | 同引擎，目标机待测                          | 同引擎，目标机待测                                               |
| 原位替换        | 标准 Edit 替换与过期选区拒绝已测               | 未提供，使用复制                         | 未提供，使用复制                            | 不提供模拟输入，使用复制                                         |
| 本机凭据 | 平台无关核心逻辑已测 | 明文持久化、显示/隐藏、重启、删除及旧凭据迁移已测 | 明文实现，目标机待测 | 明文实现，不依赖系统密钥环，目标机待测 |
| 配置/WebDAV     | 本机真实 HTTP 双配置测试已测                    | 本机核心测试、设置持久化及凭据迁移已测             | 同左                                        | 同左                                                             |
| 打包            | 见 VERIFICATION.md 的实际产物                   | x64 .app 构建和启动已测；ad-hoc 签名，未公证           | AppImage/deb 配置，目标机待测               | 同左，并校验 desktop ID                                          |

Windows 单物理屏已验证 125% 下的选区与 OCR，并在 100% 和 150% 两次独立运行中检查了工具栏的桌面像素、原生命中区域和菜单位置。双屏相对位置和负坐标有布局测试。Windows 10 双物理屏、不同 DPI 混合布局仍需在对应设备上复测。

2026-11-04 在 macOS 15.8.1 / Intel x64 / 2× Retina 桌面完成了本机验证，见 [Mac 验证记录](macos-verification.json)。多显示器、负坐标屏幕、不同 DPI 混合布局仍需人工检查，不能用单显示器测试推断这些场景。

`test:macos` 使用独立 Cocoa 样例窗口验证真实 AX 选区、浮标焦点、密码框排除和 Option+T；`test:credentials` 验证明文保存、显示已存密钥及真实重启，追加 `-- --packaged` 可测试 Mac 打包产物。

工具栏按选区所在显示器的工作区定位。指针右侧或下方放不下时，会分别向左或向上展开。重复上报同一选区时沿用已显示的窗口。选中另一处相同单词时会重新定位。可参阅 [STranslate 的跨屏定位实现](https://github.com/STranslate/STranslate/blob/8925ba829d1749fc90da1b8ec0cc8efbde77a5f9/src/STranslate/Views/MouseSelectionIconWindow.xaml.cs#L55-L102) 和 [GoldenDict 的取词窗口实现](https://github.com/goldendict/goldendict/blob/b4f3fcdc4861975ec49ae2bb894f907c072fc8f6/scanpopup.cc)。

`test:input` 验证真实 `desktopCapturer`、框选操作及裁剪像素比对。`test:native` 使用独立标准编辑器验证真实选区、焦点、替换、过期保护与屏幕 OCR。`test:selection` 使用独立 Electron 应用验证焦点和正文分离、跨站嵌入文档、清除选区、密码框及工具栏恢复。`test:selection:java` 使用独立 Swing 编辑器验证 Java 选区及工具栏。记录见 [原生测试](native-smoke.json) 和 [打包版网页选区测试](selection-compatibility-packaged.json)。

### 在 IntelliJ IDEA 编辑器中划词

在 IDEA 的代码编辑器中选中一个标识符即可使用工具栏。若编辑器选区没有反应，可在 **Settings → Appearance & Behavior → Appearance** 启用 **Support screen readers**，然后重启 IDEA。macOS 还需在系统设置中授予伴读雀辅助功能权限。[JetBrains 无障碍设置](https://www.jetbrains.com/help/idea/accessibility.html)

Windows 安装包含 Java Access Bridge 客户端。如果 Windows 上的 Java 运行时尚未启用此接口，可在 IDEA 的 **Help → Edit Custom VM Options** 单独添加一行 `-Djavax.accessibility.assistive_technologies=com.sun.java.accessibility.AccessBridge` 后重启。该选项仅作用于配置它的 IDE。[Java Access Bridge](https://docs.oracle.com/en/java/javase/21/access/enabling-and-testing-java-access-bridge.html)

## macOS 权限检查

启动时检查辅助功能和录屏权限。未授权时，设置页面提供原因说明与系统设置入口；划词和截图入口分别在使用前检查对应权限。辅助功能授权后自动连接，撤销后清除选区。更新后旧授权可能因 ad-hoc 签名变化而失效，需要在系统设置重新添加当前应用。自动化宿主派生进程的授权状态不能代替 Finder 正常启动验证，见 [权限补验](VERIFICATION.md#macos-正常启动与权限补验)。
### 在 macOS 中划词

在「系统设置 → 隐私与安全性 → 辅助功能」中允许伴读雀读取选区。授权后选区助手会自动重新连接。伴读雀优先读取当前控件的选中文字，再尝试按选区范围或网页文本标记读取。键盘选词时，如果鼠标远离选区，工具栏按系统提供的文字边界定位。未提供边界的应用会使用当前鼠标位置。

网页文本标记的处理参考了 Easydict 所用的 SelectedTextKit。辅助功能与应用兼容性的背景可参阅 [SelectedTextKit 的取词实现](https://github.com/tisfeng/SelectedTextKit/blob/93dc960a5ef8d52de98af41d4abd7a89576d091c/Sources/SelectedTextKit/Accessibility/AXManager.swift#L56-L115)、[Bob 的取词权限说明](https://bobtranslate.com/faq/selection-error.html) 和 [Electron 的辅助功能接口](https://www.electronjs.org/docs/latest/tutorial/accessibility)。

## 更新方式

Windows NSIS 安装版和 Linux AppImage 支持下载后退出安装或立即重启更新。Windows 便携版、macOS 与 Linux DEB 提供校验后的下载包，由用户手动安装。macOS 首次发布使用 ad-hoc 签名，尚无 Apple 开发者证书与公证，因此不启用 Squirrel.Mac 自动替换。所有平台共享默认开启的自动检查、GitHub 优先与 gh-proxy 回退。详见 [更新机制](UPDATES.md)。

## Windows 人工清单

1. 打开普通记事本/标准 Edit 及浏览器，实际拖动选中一段非敏感样例文字。
   另用 Shift + 方向键选择另一段文字，按当前配置的翻译、词典、润色快捷键；确认直接打开对应卡片且原文为新选区。暂停自动浮标后重试；取消选区后再按，应显示无选区提示。输入框中设置新的组合键后确认旧键释放、重启仍有效；录入和编辑提示词时不得误运行动作。
2. 确认浮标出现时原应用仍有焦点，且没有模型请求。
   在双屏机器上分别在两个屏幕选词，尤其是资源管理器的文件重命名输入框。确认工具栏完整显示，再悬停「更多指令」并移入菜单。将鼠标留在主屏、用键盘在副屏选择代码，确认工具栏出现在副屏。
3. 点击图标工具条的翻译、词典和润色，使用已配置的真实文字服务；验证原文折叠、复制、取消、服务切换、重试、Esc、失焦收起及固定后保留位置。
4. 标准 Edit 中生成结果后检查替换；随后改变原选区或目标内容，再用旧结果替换，必须被拒绝。
5. 触发区域截图，分别在不同显示器和缩放比例裁剪样例文字；检查像素映射、取消和 OCR。
6. 关闭/排除应用，确认浮标行为符合配置。
7. 在系统中切换深浅模式，检查设置、工具条和结果卡片同步；修改设置后关闭再打开，确认自动保存生效。

## macOS / Linux 复验准备

- macOS：在目标机编译 Swift helper；通过系统界面授权辅助功能和录屏；验证菜单栏/焦点、AXSelectedText、全局快捷键。签名和 notarization 应在分发前完成。
- X11：安装 `xclip xdotool xprop`，验证 PRIMARY 所有者与前台应用切换。它不是读取所有应用内部编辑模型的通用 API，无法保证原位替换。
- 0.2.2 的快捷键显式刷新使用 Windows/macOS helper 的带请求 ID 的响应；Windows 不因快捷键仍按住 Shift 而跳过读取。X11 重新读取 PRIMARY 并核对查询前后的前台窗口，但 PRIMARY 的保留/所有者行为仍由目标应用决定。Wayland 无通用选区时继续通过 OCR 或剪贴板入口取词。
- Wayland：安装 `xdg-desktop-portal`、对应桌面后端（KDE 为 `xdg-desktop-portal-kde`）和 `python3-gi`。安装包的 `.desktop` 名称、Electron desktopName 与 StartupWMClass 使用 `app.readfinch.ReadFinch`。快捷键需门户授权；开发未安装应用时可能只能使用主界面按钮。
- Wayland 不尝试通过 X11 工具绕过合成器限制，也不合成粘贴事件。用户先复制，然后显式调用剪贴板入口。

平台依据：[Electron 截屏 API](https://www.electronjs.org/docs/latest/api/desktop-capturer)、[GlobalShortcut 的 Linux 行为](https://www.electronjs.org/docs/latest/api/global-shortcut)、[Screenshot portal](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.Screenshot.html)、[Windows TextPattern](https://learn.microsoft.com/en-us/dotnet/framework/ui-automation/ui-automation-textpattern-overview)。
