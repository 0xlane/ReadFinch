<!-- Generated from docs/readmes/content.json by npm run docs:readme. -->
<div align="center">
<a id="readme-top"></a>

<img src="../../docs/assets/readfinch-banner.png" alt="ReadFinch · 伴读雀 — A little help, right beside your words." width="1280">

# ReadFinch · 伴读雀

**言葉のすぐそばに、読書のパートナー。**

文章を翻訳する。難しい一文を読み解く。自分の表現を磨く。いま使っているアプリを離れずに。

A desktop reading and writing companion. · 随选随用的桌面阅读与写作助手。

<p><a href="../../README.md">English</a> · <a href="../../docs/readmes/README.zh-CN.md">简体中文</a> · <a href="../../docs/readmes/README.zh-TW.md">繁體中文</a> · <strong>日本語</strong> · <a href="../../docs/readmes/README.ko.md">한국어</a> · <a href="../../docs/readmes/README.fr.md">Français</a> · <a href="../../docs/readmes/README.de.md">Deutsch</a> · <a href="../../docs/readmes/README.es.md">Español</a></p>

<p>
<a href="../../LICENSE"><img src="https://img.shields.io/badge/License-GPL--3.0-4d443e?style=flat-square" alt="GPL-3.0-only"></a>
<img src="https://img.shields.io/badge/Version-0.13.0-4d443e?style=flat-square" alt="0.13.0">
<img src="https://img.shields.io/badge/Offline_OCR-中文_+_English-a9643f?style=flat-square" alt="Offline OCR: Simplified Chinese and English">
<img src="https://img.shields.io/badge/AI-Bring_your_own_provider-74675d?style=flat-square" alt="Bring your own AI provider">
</p>

[使い始める](#get-started) · [機能](#features) · [ドキュメント](#documentation) · [問題を報告](https://github.com/0xlane/ReadFinch/issues)

</div>

## 読む流れを、そのままに

ブラウザー、PDF リーダー、エディターで文字を選択すると、カーソルのそばに小さなツールバーが現れ、原文の近くに結果を表示します。結果を固定して読み比べたり、覚えておきたい単語を保存したりできます。

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../docs/assets/reading-en-dark.png">
  <img src="../../docs/assets/reading-en-light.png" width="640" alt="ReadFinch が原文のそばに翻訳を逐次表示し、ローカルノートに保存できる単語を提案している画面。">
</picture>
<br><em>選ぶ → 理解する → 残す。知らない言葉を、自分で使える言葉へ。</em>
</p>

<a id="features"></a>

## 文字のある場所で、必要な手助けを

| やりたいこと | ReadFinch でできること |
| --- | --- |
| **文章を読み解く** | 翻訳をストリーミング表示し、発音・意味・例文を調べ、長い文の構造をわかりやすく分解します。 |
| **表現を整える** | 原文のどこが変わるかを確認し、修正理由と改善後の文章を読み比べて、エディターに戻せます。 |
| **選択できない文字を読む** | 画面の範囲を指定するか、画像を読み込みます。内蔵 OCR が簡体字中国語と英語をオフラインで認識。文字を確認してから指示を実行できます。 |
| **読みながら聴く** | 選択範囲、翻訳、例文を読み上げます。言語ごとにシステムのオフライン音声や対応するオンライン音声を選び、速度・高さ・音量を調整できます。 |
| **自分用の AI 指示を作る** | プロバイダー、プロンプト、アイコン、ショートカット、型付き出力フィールドを設定。HTML + Liquid で結果カードを整え、フィールドをローカルノートに対応付けられます。 |
| **大切な内容を残す** | 結果を保存するか、おすすめの単語を選びます。ローカルノートを検索して、保存時の原文と回答を一緒に振り返れます。 |

<details>
<summary><strong>AI 指示とノートを見てみる</strong></summary>

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../docs/assets/commands-en-dark.png">
  <img src="../../docs/assets/commands-en-light.png" width="860" alt="カスタム AI コマンドのレイアウト設定と辞書カードのライブプレビュー。">
</picture>
<br><em>構造化された回答を読みやすいカードに。幅やライト・ダークモードを切り替えてレイアウトを確認できます。</em>
</p>

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../docs/assets/notebook-en-dark.png">
  <img src="../../docs/assets/notebook-en-light.png" width="860" alt="保存した単語と原文を表示する ReadFinch のローカルノート。">
</picture>
<br><em>読書で見つけた言葉を手元に。検索して、読み返して、学び直せます。</em>
</p>

</details>

### プロバイダーもモデルも、自分で選ぶ

OpenAI、DeepSeek、Gemini、Alibaba Cloud、SiliconFlow、OpenRouter のプリセット、または OpenAI 互換 Chat Completions エンドポイントを利用できます。1 つのプロバイダー項目に 1 つのモデルを設定し、別のモデルには項目を複製します。翻訳、辞書、文章改善、画像認識ごとにプロバイダーを分けられます。モデル候補、接続テスト、temperature、カスタムリクエストヘッダーにも対応しています。

### 自分の言語で読む

README は、アプリに用意されている次の 8 つの出力先言語に対応しています。

**English · 简体中文 · 繁體中文 · 日本語 · 한국어 · Français · Deutsch · Español**

**アプリの表示言語は現在、英語と簡体字中国語に対応**しており、システム言語に合わせて自動選択できます。翻訳の品質や追加言語への対応はモデルによります。内蔵のオフライン OCR は簡体字中国語と英語に対応しています。

<a id="get-started"></a>

## 使い始める

ローカルでのビルドには **Node.js 24**、npm、Git が必要です。Windows は .NET Framework 4.8 の C# コンパイラー、macOS は Xcode Command Line Tools も必要です。

```sh
git clone https://github.com/0xlane/ReadFinch.git
cd ReadFinch
npm ci
npm run assets:ocr
npm run build
npm start
```

`assets:ocr` は**開発時のビルド準備**として認識データをダウンロードします。データはアプリに同梱されるため、インストール後の言語パック取得は不要です。対象 OS 上で `npm run dist` を実行すると、`release/` にパッケージを生成します。

### 最初の使い方

1. **プロバイダーを接続する。** API Providers でプリセットまたは互換エンドポイントを選び、必要な認証情報とモデルを入力して接続をテストします。既定のプロバイダー、または特定機能のプロバイダーに設定できます。
2. **一文を選択する。** ツールバーの Translate を押して翻訳先の言語を選びます。読み比べたいときは、ピンで結果を固定できます。
3. **スクリーンショットから文字を取る。** 下記の OCR ショートカットで範囲を選び、認識結果を確認します。オフライン OCR とシステム音声は AI プロバイダーの設定前でも使えます。

### 便利なショートカット

| 操作 | Windows / Linux | macOS |
| --- | --- | --- |
| 選択範囲を翻訳 | `Alt + T` | `Option + T` |
| 辞書を開く | `Alt + Shift + D` | `Option + Shift + D` |
| 文章を改善 | `Alt + Shift + W` | `Option + Shift + W` |
| 指示を選ぶ | `Ctrl + Shift + Space` | `Command + Shift + Space` |
| 画面の文字を OCR で取得 | `Ctrl + Shift + 2` | `Command + Shift + 2` |
| クリップボードの文字を読む | `Ctrl + Shift + V` | `Command + Shift + V` |

ショートカットは専用設定ページで変更できます。設定は自動保存され、外観はシステム連動またはライト・ダークから選べます。ログイン時の自動起動は初期状態ではオフで、トレイメニューから変更できます。

### デスクトップとの連携

| プラットフォーム | 文字の取得方法 |
| --- | --- |
| Windows | UI Automation を通じて、前面のアプリが公開する選択テキストを読み取ります。 |
| macOS | 選択テキストにはアクセシビリティ、画面キャプチャには画面収録の許可が必要です。 |
| Linux | X11 は PRIMARY 選択を利用します（`xclip`、`xdotool`、`xprop` が必要）。Wayland はクリップボードまたはデスクトップのスクリーンショットポータルを使用し、ショートカットは環境に依存します。 |

Windows は開発用端末で検証しています。macOS と Linux にも実装がありますが、ネイティブのデスクトップ操作は各 OS での確認が必要です。詳細は [プラットフォーム対応表](../../docs/PLATFORMS.md).

## 文字とデータの行き先を明確に

**ノートとオフライン機能は手元に。** ノート本文は端末上の SQLite に保存します。オフライン OCR とシステム音声はローカルで動作し、ローカルノート画面には端末内の内容だけを表示します。

**AI リクエストは選んだプロバイダーへ。** 翻訳やカスタム指示には必要な文字、オンライン音声には読み上げる文字を送信します。リモート画像認識では、画像と送信先を表示してから、明示的に開始したときだけ送信します。

**設定は持ち運べます。** ファイルのインポート・エクスポートと手動 WebDAV 同期に対応。プロバイダー設定、指示、ショートカット、ノートのフィールド対応を移行できます。API キーとカスタムヘッダーは端末ごとに設定し直します。ノート本文は設定同期に含まれません。

<a id="documentation"></a>

## 詳しく知る

- [アーキテクチャとソース構成](../../docs/ARCHITECTURE.md)
- [プロバイダー・モデル・機能の割り当て](../../docs/MODELS.md)
- [オフライン OCR と画像認識 API](../../docs/OCR.md)
- [設定管理と WebDAV](../../docs/CONFIGURATION.md)
- [プラットフォームと権限](../../docs/PLATFORMS.md)

技術ドキュメントは現在、中国語で管理しています。

## ReadFinch を一緒に育てる

再現できる不具合報告、操作性の改善案、翻訳の修正、プルリクエストを歓迎します。OS とアプリのバージョンを添え、認証情報や私的な文章は例から取り除いてください。 [問題を報告](https://github.com/0xlane/ReadFinch/issues) · [コードを寄稿](https://github.com/0xlane/ReadFinch/pulls).

```sh
npm run typecheck
npm test
npm run build
```

README の文面は `docs/readmes/content.json` で管理しています。翻訳を編集したら `npm run docs:readme` を実行してください。アプリの出力先言語一覧と翻訳の対応範囲をチェックします。

## ライセンスと謝辞

ReadFinch は **GPL-3.0-only** ライセンスで提供しています。選択ツールバーと指示カードの操作設計は **Read Frog** に着想を得ています。独立したデスクトッププロジェクトであり、Read Frog の公式リリースではありません。

[GPL-3.0-only](../../LICENSE) · [Read Frog](https://github.com/mengxi-ream/read-frog) · [サードパーティーの表記](../../THIRD_PARTY_NOTICES.md).

<div align="right">

[↑ 先頭へ](#readme-top)

</div>
