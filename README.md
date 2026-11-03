# TextHop

TextHop 是一款用于外语阅读和写作的桌面划词工具。在浏览器、PDF 阅读器或编辑器里选中文字，即可通过鼠标旁的工具栏翻译、查词、分析长句或改进措辞。结果浮窗可以固定在原文旁，方便对照阅读。遇到扫描页或图片时，也可以框选区域提取文字，再使用同一组工具。主窗口集中管理设置和本地笔记。

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/v0.7/suggested-notes-dark.png">
    <img src="docs/screenshots/v0.7/suggested-notes-light.png" width="480" alt="划词翻译浮窗显示英文原句和中文译文，下方可勾选 chance encounter 和 serendipity 存入生词本">
  </picture>
  <br>
  <em>在译文下勾选生词，可以将释义和原句一起存入本地笔记库。</em>
</p>

## 主要功能

| 功能 | 使用方式 |
| --- | --- |
| 翻译与精读 | 在浮窗中逐步查看译文。选中一个词可查看读音、释义和例句，选中长句可分析主干与从句。 |
| 写作改进 | 在原句上查看修改位置，对照修改理由和修订稿，再将改好的文字复制回编辑器。 |
| 截图识别 | 框选屏幕区域或导入图片，用内置文字识别引擎（OCR）离线提取简体中文和英文。可对照原图校正文字，再翻译、查词或复制。 |
| 文本朗读 | 朗读选区、译文或词典例句。可按语言选择系统离线音色或在线音色，并调整语速、音高和音量。 |
| 自定义 AI 指令 | 为常用任务定义提示词、模型、输出字段和结果卡片版式。指令可固定到划词工具栏，也可绑定快捷键。 |
| 本地笔记库 | 从结果卡片收藏摘录，或从「猜你想存」勾选词条。按笔记库和关键词检索时，可以回看保存时的原文与结果。 |

## 安装与运行

从源码运行需要 Git、Node.js 24 和 npm。Windows 构建使用 .NET Framework 4.8 的 C# 编译器，macOS 构建需要 Xcode 命令行工具提供的 `swiftc`。

```sh
git clone https://github.com/0xlane/TextHop.git
cd TextHop
npm ci
npm run assets:ocr
npm run build
npm start
```

`npm run assets:ocr` 为构建准备中英文识别数据。数据随应用一起打包，安装后首次截图即可离线识别。需要生成安装包时，在目标操作系统上运行 `npm run dist`。产物位于 `release/`，Windows 提供安装程序和便携版。

## 首次使用

1. **配置文字模型。** 首次启动会打开设置。在「API 提供商」中选择 OpenAI、DeepSeek 等预设，或添加自定义 OpenAI 兼容接口。填写所需的 API Key、选择模型并测试连接。每个提供商对应一个模型，可在「功能提供商」中设为「默认动作提供商」，也可单独分配给翻译、词典等指令。
2. **翻译一段文字。** 返回正在阅读的应用，选中一句话，点击划词工具栏上的「翻译」。在浮窗顶部选择目标语言，点击图钉可保留译文，继续对照原文。
3. **从图片取词。** 在系统托盘菜单中选择「框选屏幕文字（OCR）」，拖框选取区域。识别完成后可直接编辑文字并运行指令。内置 OCR 和系统朗读均可在配置 API 提供商之前使用。

### 默认快捷键

| 操作 | Windows / Linux | macOS |
| --- | --- | --- |
| 翻译选区 | `Alt + T` | `Option + T` |
| 打开词典 | `Alt + Shift + D` | `Option + Shift + D` |
| 改进写作 | `Alt + Shift + W` | `Option + Shift + W` |
| 打开选区动作菜单 | `Ctrl + Shift + Space` | `Command + Shift + Space` |
| 框选屏幕文字 | `Ctrl + Shift + 2` | `Command + Shift + 2` |
| 读取剪贴板文字 | `Ctrl + Shift + V` | `Command + Shift + V` |

所有组合键均可在「设置 → 快捷键」中重新绑定。设置自动保存，界面语言和深浅色外观默认跟随系统。

## 平台与权限

- **Windows** 通过 UI Automation 读取前台应用提供的文本选区。
- **macOS** 读取选区需要在「系统设置 → 隐私与安全性 → 辅助功能」中授权 TextHop。框选屏幕还需要屏幕录制权限。
- **Linux** 在 X11 下通过 PRIMARY 选区取词，需安装 `xclip`、`xdotool` 和 `xprop`。Wayland 下可复制文字后从剪贴板读取，或通过桌面门户框选屏幕。可用的快捷键和截图方式取决于桌面环境及其门户后端。[平台支持说明](docs/PLATFORMS.md)

## 数据与配置

笔记正文保存在本机 SQLite 数据库中。翻译、自定义指令和「猜你想存」会将任务所需的文字发送给所选 API 提供商。使用在线音色时，语音提供商会收到待朗读文字。若改用视觉模型识别截图，应用会先显示原图和目标提供商，确认后才发送图片。

「配置管理」支持文件导入、导出和手动 WebDAV 同步。迁移范围包括提供商设置、指令、快捷键和笔记库字段映射。API Key 和自定义请求头按设备、按提供商保存，迁移到新设备时需单独配置。[配置管理说明](docs/CONFIGURATION.md)

## 技术文档

- [应用架构与源码目录](docs/ARCHITECTURE.md)
- [API 提供商、模型与功能分配](docs/MODELS.md)
- [离线 OCR 与视觉模型接口](docs/OCR.md)

## 许可与致谢

TextHop 采用 GPL-3.0-only 许可证。划词工具栏和指令卡片的交互设计参考了陪读蛙（Read Frog）。[项目许可证](LICENSE) · [陪读蛙项目](https://github.com/mengxi-ream/read-frog) · [第三方组件与资源声明](THIRD_PARTY_NOTICES.md)
