<!-- Generated from docs/readmes/content.json by npm run docs:readme. -->
<div align="center">
<a id="readme-top"></a>

<img src="../../docs/assets/readfinch-banner.png" alt="ReadFinch · 伴读雀 — A little help, right beside your words." width="1280">

# ReadFinch · 伴读雀

**글 바로 곁에서 함께하는 읽기 도우미.**

문장을 번역하고, 어려운 구문을 이해하고, 표현을 다듬으세요. 지금 쓰는 앱을 떠날 필요가 없습니다.

A desktop reading and writing companion. · 随选随用的桌面阅读与写作助手。

<p><a href="../../README.md">English</a> · <a href="../../docs/readmes/README.zh-CN.md">简体中文</a> · <a href="../../docs/readmes/README.zh-TW.md">繁體中文</a> · <a href="../../docs/readmes/README.ja.md">日本語</a> · <strong>한국어</strong> · <a href="../../docs/readmes/README.fr.md">Français</a> · <a href="../../docs/readmes/README.de.md">Deutsch</a> · <a href="../../docs/readmes/README.es.md">Español</a></p>

<p>
<a href="../../LICENSE"><img src="https://img.shields.io/badge/License-GPL--3.0-4d443e?style=flat-square" alt="GPL-3.0-only"></a>
<img src="https://img.shields.io/badge/Version-0.12.1-4d443e?style=flat-square" alt="0.12.1">
<img src="https://img.shields.io/badge/Offline_OCR-中文_+_English-a9643f?style=flat-square" alt="Offline OCR: Simplified Chinese and English">
<img src="https://img.shields.io/badge/AI-Bring_your_own_provider-74675d?style=flat-square" alt="Bring your own AI provider">
</p>

[시작하기](#get-started) · [기능](#features) · [문서](#documentation) · [문제 신고](https://github.com/0xlane/ReadFinch/issues)

</div>

## 읽던 흐름을 그대로

브라우저, PDF 리더, 편집기에서 텍스트를 선택하면 커서 옆에 작은 도구 모음이 나타나고 원문 가까이에 결과가 표시됩니다. 결과를 고정해 비교하며 읽거나, 기억하고 싶은 단어를 저장할 수 있습니다.

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../docs/assets/reading-en-dark.png">
  <img src="../../docs/assets/reading-en-light.png" width="640" alt="ReadFinch가 선택한 원문 옆에 번역을 스트리밍하고 로컬 노트에 저장할 단어를 제안하는 화면.">
</picture>
<br><em>선택 → 이해 → 저장. 낯선 글을 이해하고 다시 활용하기까지.</em>
</p>

<a id="features"></a>

## 텍스트가 있는 곳에서 필요한 도움을

| 하고 싶은 일 | ReadFinch가 돕는 방법 |
| --- | --- |
| **글 이해하기** | 번역을 스트리밍으로 읽고, 발음·뜻·예문을 찾아보고, 긴 문장의 구조를 이해하기 쉽게 나눕니다. |
| **표현 다듬기** | 원문에서 수정 위치를 확인하고, 수정 이유와 개선된 문장을 비교한 다음 편집기로 가져갈 수 있습니다. |
| **선택할 수 없는 글 읽기** | 화면 영역을 캡처하거나 이미지를 불러오세요. 내장 OCR이 중국어 간체와 영어를 오프라인으로 인식합니다. 인식된 글을 확인한 뒤 명령을 실행합니다. |
| **읽으면서 듣기** | 선택한 글, 번역, 예문을 음성으로 들을 수 있습니다. 언어별로 시스템 오프라인 음성이나 호환 온라인 음성을 고르고 속도·높낮이·음량을 조절합니다. |
| **나만의 AI 명령 만들기** | 제공업체, 프롬프트, 아이콘, 단축키, 형식이 지정된 출력 필드를 설정합니다. HTML + Liquid로 결과 카드를 구성하고 필드를 로컬 노트에 연결합니다. |
| **기억할 내용 남기기** | 결과를 저장하거나 추천 단어를 선택하세요. 로컬 노트를 검색해 저장 당시의 원문과 답변을 함께 다시 볼 수 있습니다. |

<details>
<summary><strong>AI 명령과 노트 살펴보기</strong></summary>

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../docs/assets/commands-en-dark.png">
  <img src="../../docs/assets/commands-en-light.png" width="860" alt="사용자 지정 AI 명령의 레이아웃 설정과 사전 카드 실시간 미리보기.">
</picture>
<br><em>구조화된 답변을 읽기 쉬운 카드로 꾸미세요. 다양한 너비와 밝은 모드·어두운 모드에서 확인할 수 있습니다.</em>
</p>

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../docs/assets/notebook-en-dark.png">
  <img src="../../docs/assets/notebook-en-light.png" width="860" alt="저장한 단어와 원문을 보여 주는 ReadFinch 로컬 노트.">
</picture>
<br><em>읽다가 발견한 내용을 가까이 두고, 검색하고 되짚어 보세요.</em>
</p>

</details>

### 제공업체와 모델을 직접 선택

OpenAI, DeepSeek, Gemini, Alibaba Cloud, SiliconFlow, OpenRouter 프리셋을 사용하거나 OpenAI 호환 Chat Completions 엔드포인트를 연결할 수 있습니다. 제공업체 항목 하나에는 모델 하나를 설정하며, 다른 모델을 쓰려면 항목을 복제합니다. 번역·사전·글쓰기·이미지 인식에 각각 다른 제공업체를 지정할 수 있습니다. 모델 제안, 연결 테스트, temperature, 사용자 지정 요청 헤더도 지원합니다.

### 익숙한 언어로 읽기

README는 앱에 기본 제공되는 다음 8가지 대상 언어와 일치합니다.

**English · 简体中文 · 繁體中文 · 日本語 · 한국어 · Français · Deutsch · Español**

**앱 인터페이스는 현재 영어와 중국어 간체를 지원**하며 시스템 언어에 맞춰 자동으로 선택할 수 있습니다. 번역 품질과 추가 언어 지원은 선택한 모델에 따라 달라집니다. 내장 오프라인 OCR은 중국어 간체와 영어를 인식합니다.

<a id="get-started"></a>

## 시작하기

로컬 빌드에는 **Node.js 24**, npm, Git이 필요합니다. Windows에서는 .NET Framework 4.8 C# 컴파일러가, macOS에서는 Xcode Command Line Tools가 추가로 필요합니다.

```sh
git clone https://github.com/0xlane/ReadFinch.git
cd ReadFinch
npm ci
npm run assets:ocr
npm run build
npm start
```

`assets:ocr`는 **개발 빌드 준비 과정에서** 인식 데이터를 다운로드합니다. 데이터가 앱에 포함되므로 설치 후 언어 팩을 내려받을 필요가 없습니다. 대상 운영체제에서 `npm run dist`를 실행하면 `release/`에 패키지가 생성됩니다.

### 처음 사용하기

1. **제공업체 연결.** API Providers에서 프리셋이나 호환 엔드포인트를 고르고, 필요한 인증 정보와 모델을 입력한 뒤 연결을 테스트합니다. 기본 제공업체로 지정하거나 특정 기능에 연결할 수 있습니다.
2. **문장 선택.** 선택 도구 모음에서 Translate를 누르고 대상 언어를 고르세요. 원문과 비교하며 읽으려면 압정 버튼으로 결과를 고정합니다.
3. **캡처로 글 가져오기.** 아래 OCR 단축키로 영역을 선택하고 인식 결과를 확인하세요. 오프라인 OCR과 시스템 음성은 AI 제공업체 설정 전에도 사용할 수 있습니다.

### 유용한 단축키

| 명령 | Windows / Linux | macOS |
| --- | --- | --- |
| 선택 영역 번역 | `Alt + T` | `Option + T` |
| 사전 열기 | `Alt + Shift + D` | `Option + Shift + D` |
| 글쓰기 개선 | `Alt + Shift + W` | `Option + Shift + W` |
| 명령 선택 | `Ctrl + Shift + Space` | `Command + Shift + Space` |
| OCR로 화면 글 가져오기 | `Ctrl + Shift + 2` | `Command + Shift + 2` |
| 클립보드 글 읽기 | `Ctrl + Shift + V` | `Command + Shift + V` |

단축키는 전용 설정 페이지에서 바꿀 수 있습니다. 설정은 자동 저장되며, 테마는 시스템 설정을 따르거나 밝게·어둡게 지정할 수 있습니다. 로그인 시 자동 시작은 기본적으로 꺼져 있으며 트레이 메뉴에서 변경합니다.

### 데스크톱 연동

| 플랫폼 | 텍스트를 가져오는 방법 |
| --- | --- |
| Windows | UI Automation으로 전경 앱이 제공하는 선택 텍스트를 읽습니다. |
| macOS | 선택 텍스트에는 손쉬운 사용 권한이, 화면 캡처에는 화면 기록 권한이 필요합니다. |
| Linux | X11에서는 PRIMARY 선택 영역을 사용합니다(`xclip`, `xdotool`, `xprop` 필요). Wayland에서는 클립보드 또는 데스크톱 스크린샷 포털을 사용하며 단축키 지원은 데스크톱 환경에 따라 달라집니다. |

Windows는 개발 컴퓨터에서 검증했습니다. macOS와 Linux 구현도 제공되지만 실제 데스크톱 동작은 해당 시스템에서 확인해야 합니다. 자세한 내용은 [플랫폼 지원표](../../docs/PLATFORMS.md).

## 텍스트와 데이터의 경계를 분명하게

**노트와 오프라인 기능은 내 기기에.** 노트 본문은 기기의 SQLite 데이터베이스에 저장됩니다. 오프라인 OCR과 시스템 음성은 로컬에서 동작합니다. 로컬 노트 화면에는 로컬 콘텐츠만 표시합니다.

**AI 요청은 선택한 제공업체로.** 번역과 사용자 지정 명령은 필요한 텍스트를, 온라인 음성은 읽어 줄 텍스트를 보냅니다. 원격 이미지 인식은 이미지와 전송 대상을 먼저 보여 주며, 직접 시작해야 전송합니다.

**설정은 다른 기기로.** 파일 가져오기·내보내기와 수동 WebDAV 동기화를 지원합니다. 제공업체 설정, 명령, 단축키, 노트 필드 매핑을 함께 옮길 수 있습니다. API 키와 사용자 지정 요청 헤더는 기기별로 저장되므로 새 기기에서 다시 설정해야 합니다. 노트 본문은 설정 동기화에 포함되지 않습니다.

<a id="documentation"></a>

## 더 알아보기

- [아키텍처와 소스 구조](../../docs/ARCHITECTURE.md)
- [제공업체·모델·기능 할당](../../docs/MODELS.md)
- [오프라인 OCR과 비전 API](../../docs/OCR.md)
- [설정 관리와 WebDAV](../../docs/CONFIGURATION.md)
- [플랫폼 지원과 권한](../../docs/PLATFORMS.md)

기술 문서는 현재 중국어로 관리합니다.

## ReadFinch를 함께 개선해 주세요

재현 가능한 버그 보고, 사용성 제안, 번역 수정, 풀 리퀘스트를 환영합니다. 운영체제와 앱 버전을 적고, 예제에서 인증 정보와 개인 텍스트를 제거해 주세요. [문제 신고](https://github.com/0xlane/ReadFinch/issues) · [코드 기여](https://github.com/0xlane/ReadFinch/pulls).

```sh
npm run typecheck
npm test
npm run build
```

README 문구는 `docs/readmes/content.json`에서 관리합니다. 번역을 수정한 뒤 `npm run docs:readme`를 실행하면 앱의 대상 언어 목록과 번역 범위가 일치하는지 확인합니다.

## 라이선스와 감사의 말

ReadFinch는 **GPL-3.0-only** 라이선스로 제공됩니다. 선택 도구 모음과 명령 카드의 상호작용은 **Read Frog**에서 영감을 받았습니다. 독립적인 데스크톱 프로젝트이며 Read Frog의 공식 배포판이 아닙니다.

[GPL-3.0-only](../../LICENSE) · [Read Frog](https://github.com/mengxi-ream/read-frog) · [서드파티 고지](../../THIRD_PARTY_NOTICES.md).

<div align="right">

[↑ 맨 위로](#readme-top)

</div>
