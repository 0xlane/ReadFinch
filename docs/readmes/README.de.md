<!-- Generated from docs/readmes/content.json by npm run docs:readme. -->
<div align="center">
<a id="readme-top"></a>

<img src="../../docs/assets/readfinch-banner.png" alt="ReadFinch · 伴读雀 — A little help, right beside your words." width="1280">

# ReadFinch · 伴读雀

**Dein Lesebegleiter, direkt neben deinen Worten.**

Eine Passage übersetzen, einen schwierigen Satz verstehen oder einen eigenen Text verbessern – ohne die gerade verwendete App zu verlassen.

A desktop reading and writing companion. · 随选随用的桌面阅读与写作助手。

<p><a href="../../README.md">English</a> · <a href="../../docs/readmes/README.zh-CN.md">简体中文</a> · <a href="../../docs/readmes/README.zh-TW.md">繁體中文</a> · <a href="../../docs/readmes/README.ja.md">日本語</a> · <a href="../../docs/readmes/README.ko.md">한국어</a> · <a href="../../docs/readmes/README.fr.md">Français</a> · <strong>Deutsch</strong> · <a href="../../docs/readmes/README.es.md">Español</a></p>

<p>
<a href="../../LICENSE"><img src="https://img.shields.io/badge/License-GPL--3.0-4d443e?style=flat-square" alt="GPL-3.0-only"></a>
<img src="https://img.shields.io/badge/Version-0.14.0-4d443e?style=flat-square" alt="0.14.0">
<img src="https://img.shields.io/badge/Offline_OCR-中文_+_English-a9643f?style=flat-square" alt="Offline OCR: Simplified Chinese and English">
<img src="https://img.shields.io/badge/AI-Bring_your_own_provider-74675d?style=flat-square" alt="Bring your own AI provider">
</p>

[Erste Schritte](#get-started) · [Funktionen](#features) · [Dokumentation](#documentation) · [Problem melden](https://github.com/0xlane/ReadFinch/issues)

</div>

## Bleib im Lesefluss

Markiere Text im Browser, PDF-Reader oder Editor. ReadFinch zeigt eine kleine Werkzeugleiste am Mauszeiger und öffnet die Antwort neben dem Original. Hefte ein Ergebnis zum Vergleichen an oder merke dir ein nützliches Wort für später.

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../docs/assets/reading-en-dark.png">
  <img src="../../docs/assets/reading-en-light.png" width="640" alt="ReadFinch zeigt eine markierte Passage, eine schrittweise erscheinende Übersetzung und Wortvorschläge für ein lokales Notizbuch.">
</picture>
<br><em>Markieren → verstehen → behalten. Von unbekannten Wörtern zu nutzbarem Wissen.</em>
</p>

<a id="features"></a>

## Hilfe dort, wo dein Text ist

| Was du vorhast | Wie ReadFinch hilft |
| --- | --- |
| **Lesen und verstehen** | Lies Übersetzungen schon während der Ausgabe, schlage Aussprache und Beispiele nach und zerlege lange Sätze in verständliche Teile. |
| **Besser formulieren** | Sieh Änderungen im ursprünglichen Satz, verstehe die Begründungen und übernimm die überarbeitete Fassung in deinen Editor. |
| **Nicht markierbaren Text lesen** | Erfasse einen Bildschirmausschnitt oder importiere ein Bild. Die integrierte OCR erkennt vereinfachtes Chinesisch und Englisch offline. Prüfe den Text, bevor du einen Befehl ausführst. |
| **Beim Lesen zuhören** | Lass dir markierten Text, Übersetzungen und Beispiele vorlesen. Wähle je Sprache lokale Systemstimmen oder kompatible Online-Stimmen und passe Tempo, Tonhöhe und Lautstärke an. |
| **Eigene KI-Befehle erstellen** | Lege Anbieter, Prompts, Symbol, Tastenkürzel und typisierte Ausgabefelder fest. Gestalte Ergebniskarten mit HTML + Liquid und ordne die Felder einem lokalen Notizbuch zu. |
| **Wichtiges behalten** | Speichere ein Ergebnis oder übernimm einen Wortschatzvorschlag. Durchsuche lokale Notizbücher und sieh den ursprünglichen Text zusammen mit der gespeicherten Antwort wieder. |

<details>
<summary><strong>Befehle und Notizbücher entdecken</strong></summary>

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../docs/assets/commands-en-dark.png">
  <img src="../../docs/assets/commands-en-light.png" width="860" alt="Layout-Einstellungen eines eigenen KI-Befehls mit Live-Vorschau einer Wörterbuchkarte.">
</picture>
<br><em>Gestalte strukturierte Antworten als gut lesbare Karten. Prüfe das Layout bei verschiedenen Breiten und im hellen oder dunklen Modus.</em>
</p>

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../docs/assets/notebook-en-dark.png">
  <img src="../../docs/assets/notebook-en-light.png" width="860" alt="Lokales ReadFinch-Notizbuch mit gespeicherten Wörtern und ihrem ursprünglichen Kontext.">
</picture>
<br><em>Behalte Entdeckungen aus deiner Lektüre griffbereit, um sie wiederzufinden und nachzulesen.</em>
</p>

</details>

### Dein Anbieter. Dein Modell. Deine Wahl.

Nutze Vorlagen für OpenAI, DeepSeek, Gemini, Alibaba Cloud, SiliconFlow und OpenRouter oder verbinde einen OpenAI-kompatiblen Chat-Completions-Endpunkt. Jeder Anbietereintrag enthält ein Modell; für ein weiteres Modell duplizierst du den Eintrag. Übersetzung, Wörterbuch, Schreiben und Bilderkennung können verschiedene Anbieter verwenden. Modellvorschläge, Verbindungstests, Temperatur und eigene Request-Header sind in den Einstellungen verfügbar.

### In deiner Sprache lesen

Die README-Übersetzungen entsprechen den acht voreingestellten Zielsprachen der App:

**English · 简体中文 · 繁體中文 · 日本語 · 한국어 · Français · Deutsch · Español**

**Die App-Oberfläche ist derzeit auf Englisch und vereinfachtem Chinesisch verfügbar** und kann automatisch der Systemsprache folgen. Übersetzungsqualität und weitere unterstützte Sprachen hängen vom Modell ab. Die integrierte Offline-OCR erkennt vereinfachtes Chinesisch und Englisch.

<a id="get-started"></a>

## Erste Schritte

Für einen lokalen Build benötigst du **Node.js 24**, npm und Git. Unter Windows wird der C#-Compiler von .NET Framework 4.8 benötigt, unter macOS die Xcode Command Line Tools.

```sh
git clone https://github.com/0xlane/ReadFinch.git
cd ReadFinch
npm ci
npm run assets:ocr
npm run build
npm start
```

`assets:ocr` lädt die Erkennungsdaten **bei der Vorbereitung des Entwicklungs-Builds** herunter. Die Daten werden mit der App ausgeliefert; nach der Installation ist kein Sprachpaket-Download nötig. Mit `npm run dist` auf dem Zielbetriebssystem entstehen Pakete im Verzeichnis `release/`.

### Die ersten Schritte in der App

1. **Anbieter verbinden.** Wähle unter API Providers eine Vorlage oder einen kompatiblen Endpunkt, trage die benötigten Zugangsdaten und das Modell ein und teste die Verbindung. Weise den Anbieter als Standard oder einer bestimmten Funktion zu.
2. **Einen Satz markieren.** Klicke in der Werkzeugleiste auf Translate und wähle die Zielsprache. Mit der Stecknadel bleibt das Ergebnis neben deiner Lektüre stehen.
3. **Eine Bildschirmaufnahme ausprobieren.** Nutze das OCR-Tastenkürzel unten, markiere einen Bereich und prüfe den erkannten Text. Offline-OCR und Systemstimmen funktionieren auch ohne eingerichteten KI-Anbieter.

### Nützliche Tastenkürzel

| Befehl | Windows / Linux | macOS |
| --- | --- | --- |
| Auswahl übersetzen | `Alt + T` | `Option + T` |
| Wörterbuch öffnen | `Alt + Shift + D` | `Option + Shift + D` |
| Text verbessern | `Alt + Shift + W` | `Option + Shift + W` |
| Befehl auswählen | `Ctrl + Shift + Space` | `Command + Shift + Space` |
| Bildschirmtext per OCR erfassen | `Ctrl + Shift + 2` | `Command + Shift + 2` |
| Text aus der Zwischenablage lesen | `Ctrl + Shift + V` | `Command + Shift + V` |

Tastenkürzel lassen sich auf einer eigenen Einstellungsseite ändern. Einstellungen werden automatisch gespeichert. Das Design folgt dem System oder deiner Wahl zwischen Hell und Dunkel. Der Start bei der Anmeldung ist standardmäßig aus und lässt sich im Tray-Menü ändern.

### Integration in den Desktop

| Plattform | Texterfassung |
| --- | --- |
| Windows | Liest die von der Vordergrund-App bereitgestellte Textauswahl über UI Automation. |
| macOS | Benötigt die Bedienungshilfen-Freigabe für markierten Text und die Bildschirmaufnahme-Berechtigung für Screenshots. |
| Linux | Verwendet unter X11 die PRIMARY-Auswahl (`xclip`, `xdotool`, `xprop`). Unter Wayland werden Zwischenablage oder Screenshot-Portal genutzt; Tastenkürzel hängen von der Desktop-Umgebung ab. |

Windows wurde auf dem Entwicklungsrechner geprüft. Implementierungen für macOS und Linux sind vorhanden; native Desktop-Abläufe müssen weiterhin auf den Zielsystemen geprüft werden. Details stehen in der [Plattformübersicht](../../docs/PLATFORMS.md).

## Klare Grenzen für deine Daten

**Notizen und Offline-Funktionen bleiben auf dem Gerät.** Notizbuchinhalte liegen in einer lokalen SQLite-Datenbank. Offline-OCR und Systemstimmen arbeiten lokal. Die lokale Notizbuchseite zeigt ausschließlich lokale Inhalte.

**KI-Anfragen gehen an deinen gewählten Anbieter.** Übersetzung und eigene Befehle senden den benötigten Text; Online-Sprachausgabe sendet den vorzulesenden Text. Bei entfernter Bilderkennung werden Bild und Empfänger zuerst angezeigt. Gesendet wird erst, wenn du die Anfrage ausdrücklich startest.

**Einstellungen lassen sich mitnehmen.** Importiere und exportiere Dateien oder synchronisiere die Konfiguration manuell per WebDAV. Anbieter, Befehle, Tastenkürzel und Feldzuordnungen der Notizbücher werden gemeinsam übertragen. API-Schlüssel und eigene Header bleiben gerätespezifisch und müssen auf einem anderen Gerät separat eingerichtet werden. Notizbuchinhalte gehören nicht zur Konfigurationssynchronisierung.

<a id="documentation"></a>

## Mehr erfahren

- [Architektur und Quellcode-Struktur](../../docs/ARCHITECTURE.md)
- [Anbieter, Modelle und Funktionszuordnung](../../docs/MODELS.md)
- [Offline-OCR und Vision-APIs](../../docs/OCR.md)
- [Konfiguration und WebDAV](../../docs/CONFIGURATION.md)
- [Plattformen und Berechtigungen](../../docs/PLATFORMS.md)

Die technische Dokumentation wird derzeit auf Chinesisch gepflegt.

## ReadFinch gemeinsam verbessern

Reproduzierbare Fehlerberichte, Verbesserungsvorschläge, Übersetzungskorrekturen und Pull Requests sind willkommen. Nenne Betriebssystem und App-Version und entferne Zugangsdaten sowie private Texte aus Beispielen. [Problem melden](https://github.com/0xlane/ReadFinch/issues) · [Code beitragen](https://github.com/0xlane/ReadFinch/pulls).

```sh
npm run typecheck
npm test
npm run build
```

Die README-Texte stehen in `docs/readmes/content.json`. Führe nach einer Übersetzungsänderung `npm run docs:readme` aus. Der Generator prüft, ob alle Zielsprachen der App abgedeckt sind.

## Lizenz und Danksagung

ReadFinch steht unter **GPL-3.0-only**. Die Bedienung der Auswahl-Werkzeugleiste und der Befehlskarten ist von **Read Frog** inspiriert. ReadFinch ist ein unabhängiges Desktop-Projekt und keine offizielle Read-Frog-Veröffentlichung.

[GPL-3.0-only](../../LICENSE) · [Read Frog](https://github.com/mengxi-ream/read-frog) · [Hinweise zu Drittanbieterkomponenten](../../THIRD_PARTY_NOTICES.md).

<div align="right">

[↑ Nach oben](#readme-top)

</div>
