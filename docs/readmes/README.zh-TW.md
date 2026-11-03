<!-- Generated from docs/readmes/content.json by npm run docs:readme. -->
<div align="center">
<a id="readme-top"></a>

<img src="../../docs/assets/readfinch-banner.png" alt="ReadFinch · 伴读雀 — A little help, right beside your words." width="1280">

# ReadFinch · 伴读雀

**就在文字旁邊，陪你讀懂每一句。**

翻譯一段文字、讀懂一個長句、修好一句表達——留在正在使用的應用程式裡，就能完成。

A desktop reading and writing companion. · 随选随用的桌面阅读与写作助手。

<p><a href="../../README.md">English</a> · <a href="../../docs/readmes/README.zh-CN.md">简体中文</a> · <strong>繁體中文</strong> · <a href="../../docs/readmes/README.ja.md">日本語</a> · <a href="../../docs/readmes/README.ko.md">한국어</a> · <a href="../../docs/readmes/README.fr.md">Français</a> · <a href="../../docs/readmes/README.de.md">Deutsch</a> · <a href="../../docs/readmes/README.es.md">Español</a></p>

<p>
<a href="../../LICENSE"><img src="https://img.shields.io/badge/License-GPL--3.0-4d443e?style=flat-square" alt="GPL-3.0-only"></a>
<img src="https://img.shields.io/badge/Version-0.15.0-4d443e?style=flat-square" alt="0.15.0">
<img src="https://img.shields.io/badge/Offline_OCR-中文_+_English-a9643f?style=flat-square" alt="Offline OCR: Simplified Chinese and English">
<img src="https://img.shields.io/badge/AI-Bring_your_own_provider-74675d?style=flat-square" alt="Bring your own AI provider">
</p>

[開始使用](#get-started) · [功能介紹](#features) · [技術文件](#documentation) · [回報問題](https://github.com/0xlane/ReadFinch/issues)

</div>

## 繼續閱讀，不必來回切換

在瀏覽器、PDF 閱讀器或編輯器裡選取文字，伴讀雀就會在游標旁提供工具列，並在原文附近顯示答案。可以釘選結果對照閱讀，也可以留下值得記住的詞彙。

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../docs/assets/reading-zh-CN-dark.png">
  <img src="../../docs/assets/reading-zh-CN-light.png" width="640" alt="伴讀雀在原文旁逐步顯示譯文，並推薦可儲存至本機筆記庫的詞彙。">
</picture>
<br><em>選取 → 理解 → 收藏。讓陌生的文字，成為能夠運用的知識。</em>
</p>

<a id="features"></a>

## 文字在哪裡，協助就在哪裡

| 想做什麼 | 伴讀雀如何協助 |
| --- | --- |
| **讀懂原文** | 即時查看逐步產生的譯文，查詢發音、釋義和例句，將長句拆解成容易理解的結構。 |
| **改善表達** | 在原句中查看修改位置，對照修改理由與修訂稿，再將改好的文字帶回編輯器。 |
| **辨識無法選取的文字** | 框選螢幕或匯入圖片，以內建 OCR 離線辨識簡體中文和英文。核對文字後，再執行指令。 |
| **邊讀邊聽** | 朗讀選取內容、譯文與例句。依語言選擇系統離線語音或相容的線上語音，並調整語速、音高和音量。 |
| **自訂 AI 指令** | 設定供應商、提示詞、圖示、快捷鍵及輸出欄位，以 HTML + Liquid 編排結果卡片，並將欄位對應至本機筆記庫。 |
| **留下值得記住的內容** | 收藏結果，或勾選建議儲存的詞彙。透過本機搜尋，回看儲存當時的原文與答案。 |

<details>
<summary><strong>看看指令與筆記庫</strong></summary>

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../docs/assets/commands-zh-CN-dark.png">
  <img src="../../docs/assets/commands-zh-CN-light.png" width="860" alt="自訂 AI 指令的版面設定與即時詞典卡片預覽。">
</picture>
<br><em>將結構化回答排成易讀的卡片，隨時檢查不同寬度及淺色、深色模式的效果。</em>
</p>

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../docs/assets/notebook-zh-CN-dark.png">
  <img src="../../docs/assets/notebook-zh-CN-light.png" width="860" alt="伴讀雀本機筆記庫顯示收藏的詞彙與原文。">
</picture>
<br><em>讓閱讀中的發現留在身邊，隨時搜尋、回顧和複習。</em>
</p>

</details>

### 使用自己的供應商，選擇適合的模型

支援 33 種供應商選項，涵蓋 OpenAI、Anthropic、Gemini、DeepSeek、Azure、Amazon Bedrock、OpenRouter 與純翻譯服務，支援原生 API、Chat Completions 和 Responses。每個 AI 供應商項目對應一個模型，可複製項目使用其他模型。翻譯、字典、寫作、OCR 和語言偵測可分別指定供應商，並支援模型建議、連線測試、溫度、自訂請求標頭及獨立代理設定。

### 用熟悉的語言閱讀

README 與應用程式預設的 8 種目標語言一致：

**English · 简体中文 · 繁體中文 · 日本語 · 한국어 · Français · Deutsch · Español**

**應用程式介面目前支援簡體中文和英文**，預設跟隨系統語言。翻譯品質及其他語言能力取決於所選模型；內建離線 OCR 支援簡體中文和英文。

<a id="get-started"></a>

## 開始使用

本機建置需要 **Node.js 24**、npm 和 Git。Windows 需要 .NET Framework 4.8 的 C# 編譯器；macOS 需要 Xcode 命令列工具。

```sh
git clone https://github.com/0xlane/ReadFinch.git
cd ReadFinch
npm ci
npm run assets:ocr
npm run build
npm start
```

`assets:ocr` 僅在**開發建置階段**準備辨識資料。資料隨應用程式打包，安裝後無須下載語言套件。在目標作業系統上執行 `npm run dist`，安裝套件會產生於 `release/`。

### 第一次使用

1. **連接供應商。** 開啟 API Providers，選擇預設或相容介面，填入所需憑證與模型並測試連線。可以設為預設供應商，也可指派給特定功能。
2. **選取一句話。** 點選工具列上的 Translate，選擇目標語言。需要對照時，點圖釘保留結果即可。
3. **試試截圖取字。** 使用下方 OCR 快捷鍵，框選區域並核對辨識文字。內建 OCR 和系統朗讀不需要先設定 AI 供應商。

### 常用快捷鍵

| 指令 | Windows / Linux | macOS |
| --- | --- | --- |
| 翻譯選取文字 | `Alt + T` | `Option + T` |
| 開啟字典 | `Alt + Shift + D` | `Option + Shift + D` |
| 改善寫作 | `Alt + Shift + W` | `Option + Shift + W` |
| 選擇指令 | `Ctrl + Shift + Space` | `Command + Shift + Space` |
| 框選螢幕文字 | `Ctrl + Shift + 2` | `Command + Shift + 2` |
| 讀取剪貼簿 | `Ctrl + Shift + V` | `Command + Shift + V` |

快捷鍵可在獨立設定頁面重新指定。設定自動儲存，外觀可跟隨系統或手動切換明暗模式。開機自動啟動預設關閉，可在系統匣選單中切換。

### 融入桌面使用習慣

| 平台 | 如何取得文字 |
| --- | --- |
| Windows | 透過 UI Automation 讀取前景應用程式提供的文字選取範圍。 |
| macOS | 讀取選取文字需要輔助使用授權；截圖需要螢幕錄製權限。 |
| Linux | X11 使用 PRIMARY 選取範圍，依賴 `xclip`、`xdotool`、`xprop`。Wayland 使用剪貼簿或桌面截圖入口，快捷鍵能力取決於桌面環境。 |

Windows 已在開發機器上驗證。macOS 和 Linux 提供對應實作，原生桌面互動仍須在目標系統驗收，詳見 [平台支援矩陣](../../docs/PLATFORMS.md).

## 文字與資料，去向清楚

**筆記和離線功能留在本機。** 筆記內容儲存於裝置上的 SQLite 資料庫；離線 OCR 和系統語音在本機執行。本機筆記庫頁面只顯示本機內容。

**AI 請求交給你選擇的供應商。** 翻譯與自訂指令傳送所需文字，線上朗讀傳送待朗讀內容。遠端圖片辨識會先顯示原圖和目標供應商，由你明確開始請求。

**設定可以移轉。** 支援檔案匯入、匯出及手動 WebDAV 同步，移轉供應商設定、指令、快捷鍵與筆記欄位對應。API Key 和自訂請求標頭依裝置儲存，新裝置須另行設定；筆記內容不包含在設定同步中。

<a id="documentation"></a>

## 進一步了解

- [應用程式架構與原始碼目錄](../../docs/ARCHITECTURE.md)
- [供應商、模型與功能指派](../../docs/MODELS.md)
- [離線 OCR 與視覺介面](../../docs/OCR.md)
- [設定管理與 WebDAV](../../docs/CONFIGURATION.md)
- [平台支援與權限](../../docs/PLATFORMS.md)
- [介面、翻譯與解釋語言](../../docs/LANGUAGES.md)

技術文件使用中文或英文。

## 一起讓伴讀雀更好用

歡迎提出可重現的問題、互動建議、翻譯修訂和程式碼貢獻。回報時請註明作業系統與應用程式版本，並移除範例中的憑證和私人文字。 [回報問題](https://github.com/0xlane/ReadFinch/issues) · [貢獻程式碼](https://github.com/0xlane/ReadFinch/pulls).

```sh
npm run typecheck
npm test
npm run build
```

README 文案維護於 `docs/readmes/content.json`。修改翻譯後執行 `npm run docs:readme`，產生器會檢查是否涵蓋應用程式的目標語言清單。

## 授權與致謝

伴讀雀採用 **GPL-3.0-only** 授權。文字選取工具列和指令卡片的互動設計受到 **陪讀蛙（Read Frog）** 啟發。伴讀雀是獨立桌面專案，並非陪讀蛙官方發行版。

[GPL-3.0-only](../../LICENSE) · [Read Frog](https://github.com/mengxi-ream/read-frog) · [第三方元件與資源聲明](../../THIRD_PARTY_NOTICES.md).

<div align="right">

[↑ 回到頂端](#readme-top)

</div>
