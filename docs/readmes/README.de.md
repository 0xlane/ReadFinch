<!-- Generated from docs/readmes/content.json by npm run docs:readme. -->
<div align="center">
<a id="readme-top"></a>

<img src="../../docs/assets/readfinch-banner.png" alt="ReadFinch · 伴读雀 — A little help, right beside your words." width="1280">

# ReadFinch · 伴读雀

**Dein Lesebegleiter, direkt neben deinen Worten.**

ReadFinch ist eine Open-Source-Desktop-App zum Lesen und Schreiben. Übersetze markierten Text, schlage Wörter nach, überarbeite Formulierungen und speichere Notizen aus verschiedenen Apps. Nicht markierbaren Text kannst du per OCR aus Bildern übernehmen.

<p><a href="../../README.md">English</a> · <a href="../../docs/readmes/README.zh-CN.md">简体中文</a> · <a href="../../docs/readmes/README.zh-TW.md">繁體中文</a> · <a href="../../docs/readmes/README.ja.md">日本語</a> · <a href="../../docs/readmes/README.ko.md">한국어</a> · <a href="../../docs/readmes/README.fr.md">Français</a> · <strong>Deutsch</strong> · <a href="../../docs/readmes/README.es.md">Español</a></p>

<p>
<a href="../../LICENSE"><img src="https://img.shields.io/badge/License-GPL--3.0-4d443e?style=flat-square" alt="GPL-3.0-only"></a>
<img src="https://img.shields.io/badge/Version-1.2.6-4d443e?style=flat-square" alt="1.2.6">
<img src="https://img.shields.io/badge/AI-Bring_your_own_provider-74675d?style=flat-square" alt="Bring your own AI provider">
</p>

[Neueste Version herunterladen](https://github.com/0xlane/ReadFinch/releases/latest) · [Erste Schritte](#get-started) · [Funktionen](#features) · [Dokumentation](#documentation) · [Problem melden](https://github.com/0xlane/ReadFinch/issues)

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

## Funktionen

| Was du vorhast | Wie ReadFinch hilft |
| --- | --- |
| **Lesen und verstehen** | Lies Übersetzungen schon während der Ausgabe, schlage Aussprache und Beispiele nach und zerlege lange Sätze in verständliche Teile. |
| **Besser formulieren** | Sieh Änderungen im ursprünglichen Satz, verstehe die Begründungen und übernimm die überarbeitete Fassung in deinen Editor. |
| **Nicht markierbaren Text lesen** | Erfasse einen Bildschirmausschnitt oder importiere ein Bild, um Text zu erkennen. Übersetze ihn anschließend, schlage Wörter nach oder führe einen eigenen KI-Befehl aus. |
| **Beim Lesen zuhören** | Lass dir markierten Text, Übersetzungen und Beispiele mit Offline-Systemstimmen oder Online-Sprachausgabe vorlesen. Wähle und teste Stimmen je Sprache; die Wiedergabeeinstellungen hängen vom Sprachdienst ab. |
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

### Anbieter für jede Funktion

Verbinde dein eigenes API-Konto über Vorlagen für OpenAI, Anthropic, Gemini, DeepSeek, Azure, Amazon Bedrock, OpenRouter und weitere Anbieter oder nutze eine mit Chat Completions oder Responses kompatible API. Auch reine Übersetzungsdienste werden unterstützt. Jeder KI-Anbietereintrag verwendet ein Modell; dupliziere ihn für ein weiteres. Übersetzung, Wörterbuch, Schreibverbesserung, OCR, Erkennung der Textsprache und Online-Sprachausgabe können unterschiedliche Anbieter verwenden. Je nach Dienst stehen Modellvorschläge, Verbindungstests, Temperatur, eigene Header und ein Proxy pro Anbieter zur Verfügung.

### Sprachen

Für Übersetzungen und Erklärungen stehen acht voreingestellte Zielsprachen zur Auswahl:

**English · 简体中文 · 繁體中文 · 日本語 · 한국어 · Français · Deutsch · Español**

Die **Oberfläche unterstützt Englisch und vereinfachtes Chinesisch** und folgt standardmäßig der Systemsprache. Oberflächen- und Ausgabesprache lassen sich getrennt einstellen. Übersetzungsqualität und Sprachabdeckung hängen vom gewählten Anbieter und Modell ab.

<a id="get-started"></a>

## Erste Schritte

**[Neueste Version herunterladen](https://github.com/0xlane/ReadFinch/releases/latest)**

Wähle auf der Seite der neuesten Veröffentlichung das Paket für dein Betriebssystem. Für die fertige App brauchst du keine Entwicklungswerkzeuge.

| System | Paket |
| --- | --- |
| Windows x64 | `*-setup.exe` zum Installieren oder `*-portable.exe` für die Nutzung ohne Installation. |
| macOS | `arm64` für Apple-Chips oder `x64` für Intel; als `.dmg` und `.zip` verfügbar. |
| Linux x64 | `.AppImage` zum direkten Start oder `amd64.deb` für Debian und Ubuntu. |

Die automatische Update-Suche ist standardmäßig aktiviert und lässt sich unter About einstellen. Windows-Installationen und Linux-AppImages können Updates beim Beenden installieren. Unter macOS kannst du zum Aktualisieren neu starten, wenn der Installationsort beschreibbar ist. Portable Windows-Versionen, macOS-Apps an schreibgeschützten Orten und Linux-DEB-Pakete erfordern eine manuelle Installation. Ältere macOS-Versionen müssen einmal manuell auf eine Version mit Update-Helfer aktualisiert werden.

### Erste Schritte

1. **Anbieter verbinden.** Wähle unter API Providers eine Vorlage oder einen kompatiblen Endpunkt, trage die benötigten Zugangsdaten und das Modell ein und teste die Verbindung. Weise den Anbieter als Standard oder einer bestimmten Funktion zu.
2. **Einen Satz markieren.** Klicke in der Werkzeugleiste auf Translate und wähle die Zielsprache. Mit der Stecknadel bleibt das Ergebnis neben deiner Lektüre stehen.
3. **Text aus einem Bild erfassen.** Nutze das OCR-Tastenkürzel unten, markiere einen Bereich und prüfe den erkannten Text. Wähle anschließend einen Befehl.

### Nützliche Tastenkürzel

| Befehl | Windows / Linux | macOS |
| --- | --- | --- |
| Auswahl übersetzen | `Alt + T` | `Option + D` |
| Wörterbuch öffnen | `Alt + Shift + D` | `Option + Shift + D` |
| Text verbessern | `Alt + Shift + W` | `Option + Shift + W` |
| Befehl auswählen | `Ctrl + Shift + Space` | `Command + Shift + Space` |
| Bildschirmtext per OCR erfassen | `Ctrl + Shift + 2` | `Option + Shift + S` |
| Text aus der Zwischenablage lesen | `Ctrl + Shift + V` | `Command + Shift + V` |
| Eingegebenen Text übersetzen | `Alt + A` | `Option + A` |

Tastenkürzel lassen sich auf einer eigenen Einstellungsseite ändern. Einstellungen werden automatisch gespeichert. Das Design folgt dem System oder deiner Wahl zwischen Hell und Dunkel. Der Start bei der Anmeldung ist standardmäßig aus und lässt sich im Tray-Menü ändern.

### Plattformunterstützung

| Plattform | Texterfassung |
| --- | --- |
| Windows | Liest die Textauswahl der aktiven App über UI Automation und Java Access Bridge. |
| macOS | Benötigt die Bedienungshilfen-Freigabe für markierten Text und die Bildschirmaufnahme-Berechtigung für Screenshots. |
| Linux | Verwendet unter X11 die PRIMARY-Auswahl (`xclip`, `xdotool`, `xprop`). Unter Wayland werden Zwischenablage oder Screenshot-Portal genutzt; Tastenkürzel hängen von der Desktop-Umgebung ab. |

Die automatische Auswahl setzt voraus, dass die aktive App ihren markierten Text zugänglich macht. Andernfalls kannst du OCR oder die Zwischenablage verwenden. Berechtigungen, Einschränkungen und Prüfstatus stehen in der [Plattformübersicht](../../docs/PLATFORMS.md).

## Daten und Datenschutz

**Auf deinem Gerät.** Notizbuchinhalte bleiben auf deinem Gerät. Die integrierte OCR verarbeitet Bilder lokal, und Offline-Systemstimmen benötigen keinen Online-Sprachdienst.

**Anfragen gehen an den gewählten Anbieter.** Übersetzungen und KI-Befehle senden den für die Anfrage nötigen Text; Online-Sprachausgabe sendet den vorzulesenden Text. Online-OCR überträgt den Bildschirmausschnitt oder das importierte Bild an den gewählten Vision-Anbieter. Konten, Verfügbarkeit und Nutzungsgebühren verwaltet der jeweilige Dienst.

**Einstellungen lassen sich mitnehmen.** Importiere und exportiere Dateien oder synchronisiere die Konfiguration manuell per WebDAV. Anbieter, Befehle, Tastenkürzel und Feldzuordnungen der Notizbücher werden gemeinsam übertragen. API-Schlüssel und eigene Header bleiben gerätespezifisch und müssen auf einem anderen Gerät separat eingerichtet werden. Notizbuchinhalte gehören nicht zur Konfigurationssynchronisierung.

<a id="documentation"></a>

## Dokumentation

- [Architektur und Quellcode-Struktur](../../docs/ARCHITECTURE.md)
- [Anbieter, Modelle und Funktionszuordnung](../../docs/MODELS.md)
- [Texterkennung in Screenshots und Bildern (OCR)](../../docs/OCR.md)
- [Konfiguration und WebDAV](../../docs/CONFIGURATION.md)
- [Plattformen und Berechtigungen](../../docs/PLATFORMS.md)
- [Oberflächen- und Übersetzungssprache](../../docs/LANGUAGES.md)
- [Veröffentlichungen und App-Updates](../../docs/UPDATES.md)

Die technische Dokumentation ist auf Chinesisch oder Englisch verfügbar.

## Mitwirken

Reproduzierbare Fehlerberichte, Verbesserungsvorschläge, Übersetzungskorrekturen und Pull Requests sind willkommen. Nenne Betriebssystem und App-Version und entferne Zugangsdaten sowie private Texte aus Beispielen. [Problem melden](https://github.com/0xlane/ReadFinch/issues) · [Code beitragen](https://github.com/0xlane/ReadFinch/pulls).

### Aus dem Quellcode erstellen

Für einen lokalen Build benötigst du **Node.js 24**, npm und Git. Installiere unter Windows den C#-Compiler von .NET Framework 4.8 und setze `JAVA_HOME` auf ein x64-OpenJDK wie Temurin 21. Unter macOS benötigst du die Xcode Command Line Tools.

```sh
git clone https://github.com/0xlane/ReadFinch.git
cd ReadFinch
npm ci
npm run assets:ocr
npm run build
npm start
```

`assets:ocr` lädt die Erkennungsdaten **bei der Vorbereitung des Entwicklungs-Builds** herunter. Die Daten werden mit der App ausgeliefert; nach der Installation ist kein Sprachpaket-Download nötig. Mit `npm run dist` auf dem Zielbetriebssystem entstehen Pakete im Verzeichnis `release/`.

```sh
npm run typecheck
npm test
npm run build
```

Die README-Texte stehen in `docs/readmes/content.json`. Führe nach einer Übersetzungsänderung `npm run docs:readme` aus. Der Generator prüft, ob alle Zielsprachen der App abgedeckt sind.

## Lizenz und Danksagung

ReadFinch steht unter **GPL-3.0-only**. Die Bedienung der Auswahl-Werkzeugleiste und der Befehlskarten ist von **Read Frog** inspiriert. ReadFinch ist ein unabhängiges Desktop-Projekt und keine offizielle Read-Frog-Veröffentlichung.

[GPL-3.0-only](../../LICENSE) · [Read Frog](https://github.com/mengxi-ream/read-frog) · [Hinweise zu Drittanbieterkomponenten](../../THIRD_PARTY_NOTICES.md)

<div align="right">

[↑ Nach oben](#readme-top)

</div>
