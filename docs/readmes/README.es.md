<!-- Generated from docs/readmes/content.json by npm run docs:readme. -->
<div align="center">
<a id="readme-top"></a>

<img src="../../docs/assets/readfinch-banner.png" alt="ReadFinch · 伴读雀 — A little help, right beside your words." width="1280">

# ReadFinch · 伴读雀

**Un compañero de lectura, junto a tus palabras.**

Traduce un pasaje, comprende una frase difícil o mejora lo que escribes, sin salir de la aplicación que estás usando.

A desktop reading and writing companion. · 随选随用的桌面阅读与写作助手。

<p><a href="../../README.md">English</a> · <a href="../../docs/readmes/README.zh-CN.md">简体中文</a> · <a href="../../docs/readmes/README.zh-TW.md">繁體中文</a> · <a href="../../docs/readmes/README.ja.md">日本語</a> · <a href="../../docs/readmes/README.ko.md">한국어</a> · <a href="../../docs/readmes/README.fr.md">Français</a> · <a href="../../docs/readmes/README.de.md">Deutsch</a> · <strong>Español</strong></p>

<p>
<a href="../../LICENSE"><img src="https://img.shields.io/badge/License-GPL--3.0-4d443e?style=flat-square" alt="GPL-3.0-only"></a>
<img src="https://img.shields.io/badge/Version-0.12.0-4d443e?style=flat-square" alt="0.12.0">
<img src="https://img.shields.io/badge/Offline_OCR-中文_+_English-a9643f?style=flat-square" alt="Offline OCR: Simplified Chinese and English">
<img src="https://img.shields.io/badge/AI-Bring_your_own_provider-74675d?style=flat-square" alt="Bring your own AI provider">
</p>

[Primeros pasos](#get-started) · [Funciones](#features) · [Documentación](#documentation) · [Informar de un problema](https://github.com/0xlane/ReadFinch/issues)

</div>

## Sigue el hilo de tu lectura

Selecciona texto en un navegador, lector de PDF o editor. ReadFinch muestra una pequeña barra junto al cursor y abre la respuesta al lado del original. Fija un resultado para compararlo o guarda una palabra útil para más adelante.

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../docs/assets/reading-en-dark.png">
  <img src="../../docs/assets/reading-en-light.png" width="640" alt="ReadFinch muestra un pasaje seleccionado, su traducción progresiva y palabras sugeridas para un cuaderno local.">
</picture>
<br><em>Seleccionar → comprender → guardar. De un texto desconocido a algo que puedes aprovechar.</em>
</p>

<a id="features"></a>

## Una ayuda allí donde está tu texto

| Lo que quieres hacer | Cómo te ayuda ReadFinch |
| --- | --- |
| **Leer y comprender** | Lee las traducciones mientras se generan, consulta pronunciaciones y ejemplos, y descompón las frases largas en partes comprensibles. |
| **Mejorar tu escritura** | Ve los cambios en el texto original, entiende los motivos de la revisión y lleva la versión mejorada a tu editor. |
| **Leer texto que no se puede seleccionar** | Captura una zona de la pantalla o importa una imagen. El OCR integrado reconoce chino simplificado e inglés sin conexión. Revisa el texto antes de ejecutar una instrucción. |
| **Escuchar mientras lees** | Escucha selecciones, traducciones y ejemplos. Elige por idioma voces del sistema sin conexión o voces en línea compatibles, y ajusta la velocidad, el tono y el volumen. |
| **Crear tus propias instrucciones de IA** | Configura el proveedor, los prompts, el icono, el atajo y los campos de salida con tipo. Diseña las tarjetas con HTML + Liquid y vincula los campos a un cuaderno local. |
| **Conservar lo importante** | Guarda un resultado o acepta una sugerencia de vocabulario. Busca en tus cuadernos locales y vuelve al pasaje original junto con la respuesta guardada. |

<details>
<summary><strong>Explora las instrucciones y los cuadernos</strong></summary>

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../docs/assets/commands-en-dark.png">
  <img src="../../docs/assets/commands-en-light.png" width="860" alt="Ajustes de diseño de un comando de IA personalizado, con vista previa de una ficha de diccionario.">
</picture>
<br><em>Convierte las respuestas estructuradas en fichas fáciles de leer. Comprueba el diseño con distintos anchos y en modo claro u oscuro.</em>
</p>

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../docs/assets/notebook-en-dark.png">
  <img src="../../docs/assets/notebook-en-light.png" width="860" alt="Cuaderno local de ReadFinch con vocabulario guardado y su contexto original.">
</picture>
<br><em>Ten a mano lo que descubres al leer, para encontrarlo y repasarlo.</em>
</p>

</details>

### Tu proveedor. Tu modelo. Tú decides.

Usa los ajustes predefinidos de OpenAI, DeepSeek, Gemini, Alibaba Cloud, SiliconFlow y OpenRouter, o conecta un endpoint Chat Completions compatible con OpenAI. Cada entrada de proveedor contiene un modelo; duplícala para usar otro. Traducción, diccionario, escritura y reconocimiento de imágenes pueden utilizar proveedores distintos. Los ajustes incluyen sugerencias de modelos, pruebas de conexión, temperatura y cabeceras personalizadas.

### Lee en tu idioma

Las traducciones del README coinciden con los ocho idiomas de destino predefinidos de la aplicación:

**English · 简体中文 · 繁體中文 · 日本語 · 한국어 · Français · Deutsch · Español**

**La interfaz de la aplicación está disponible actualmente en inglés y chino simplificado**, con selección automática según el sistema. La calidad de la traducción y los idiomas adicionales dependen del modelo. El OCR integrado sin conexión reconoce chino simplificado e inglés.

<a id="get-started"></a>

## Primeros pasos

Para compilar en tu equipo necesitas **Node.js 24**, npm y Git. En Windows se requiere el compilador de C# de .NET Framework 4.8; en macOS, las herramientas de línea de comandos de Xcode.

```sh
git clone https://github.com/0xlane/ReadFinch.git
cd ReadFinch
npm ci
npm run assets:ocr
npm run build
npm start
```

`assets:ocr` descarga los datos de reconocimiento **al preparar la compilación de desarrollo**. Los datos se incluyen en la aplicación, por lo que no hay que descargar paquetes de idiomas después de instalarla. Ejecuta `npm run dist` en el sistema de destino para generar los paquetes en `release/`.

### Tu primer uso

1. **Conecta un proveedor.** En API Providers, elige un ajuste predefinido o un endpoint compatible, introduce las credenciales necesarias y el modelo, y prueba la conexión. Puedes asignarlo como predeterminado o a una función concreta.
2. **Selecciona una frase.** Pulsa Translate en la barra de selección, elige el idioma de destino y fija el resultado si quieres seguir leyendo junto a él.
3. **Prueba una captura.** Utiliza el atajo OCR indicado abajo, selecciona una zona y revisa el texto reconocido. El OCR sin conexión y las voces del sistema funcionan antes de configurar un proveedor de IA.

### Atajos útiles

| Instrucción | Windows / Linux | macOS |
| --- | --- | --- |
| Traducir selección | `Alt + T` | `Option + T` |
| Abrir diccionario | `Alt + Shift + D` | `Option + Shift + D` |
| Mejorar escritura | `Alt + Shift + W` | `Option + Shift + W` |
| Elegir instrucción | `Ctrl + Shift + Space` | `Command + Shift + Space` |
| Capturar texto con OCR | `Ctrl + Shift + 2` | `Command + Shift + 2` |
| Leer texto del portapapeles | `Ctrl + Shift + V` | `Command + Shift + V` |

Puedes cambiar los atajos en su página de ajustes. La configuración se guarda automáticamente y la apariencia sigue al sistema o a tu elección clara u oscura. El inicio al entrar en el sistema está desactivado por defecto y se cambia desde el menú de la bandeja.

### Integración con el escritorio

| Plataforma | Cómo se obtiene el texto |
| --- | --- |
| Windows | Lee las selecciones que expone la aplicación en primer plano mediante UI Automation. |
| macOS | Requiere permiso de Accesibilidad para leer selecciones y de Grabación de pantalla para las capturas. |
| Linux | Utiliza la selección PRIMARY en X11 (`xclip`, `xdotool`, `xprop`). En Wayland utiliza el portapapeles o el portal de capturas del escritorio; los atajos dependen del entorno. |

Windows se ha comprobado en el equipo de desarrollo. Hay implementaciones para macOS y Linux, aunque la interacción nativa todavía requiere validación en los sistemas de destino. Consulta la [matriz de compatibilidad](../../docs/PLATFORMS.md).

## Límites claros para tus datos

**Notas y funciones sin conexión en tu dispositivo.** El contenido de los cuadernos se guarda en una base SQLite local. El OCR sin conexión y las voces del sistema se ejecutan localmente. La página de cuadernos locales solo muestra contenido local.

**Las solicitudes de IA van al proveedor que elijas.** La traducción y las instrucciones envían el texto necesario; la voz en línea envía el texto que debe leer. El reconocimiento remoto de imágenes muestra primero la imagen y el destino, y solo envía la solicitud cuando la inicias expresamente.

**Configuración que puedes trasladar.** Importa o exporta archivos, o sincroniza manualmente los ajustes mediante WebDAV. Proveedores, instrucciones, atajos y asignaciones de campos se trasladan juntos. Las claves API y las cabeceras personalizadas son específicas de cada dispositivo y deben configurarse aparte en otro equipo. El contenido de los cuadernos no forma parte de la sincronización de ajustes.

<a id="documentation"></a>

## Más información

- [Arquitectura y estructura del código](../../docs/ARCHITECTURE.md)
- [Proveedores, modelos y asignación de funciones](../../docs/MODELS.md)
- [OCR sin conexión y API de visión](../../docs/OCR.md)
- [Configuración y WebDAV](../../docs/CONFIGURATION.md)
- [Plataformas y permisos](../../docs/PLATFORMS.md)

La documentación técnica se mantiene actualmente en chino.

## Ayuda a mejorar ReadFinch

Son bienvenidos los informes de errores reproducibles, las propuestas de usabilidad, las correcciones de traducción y las pull requests. Indica el sistema operativo y la versión de la aplicación, y elimina las credenciales y el texto privado de los ejemplos. [Abrir una incidencia](https://github.com/0xlane/ReadFinch/issues) · [Contribuir código](https://github.com/0xlane/ReadFinch/pulls).

```sh
npm run typecheck
npm test
npm run build
```

Los textos del README están en `docs/readmes/content.json`. Después de editar una traducción, ejecuta `npm run docs:readme`; el generador comprueba que se cubran los idiomas de destino de la aplicación.

## Licencia y agradecimientos

ReadFinch se distribuye bajo **GPL-3.0-only**. Las interacciones de la barra de selección y las tarjetas se inspiran en **Read Frog**. ReadFinch es un proyecto de escritorio independiente y no una versión oficial de Read Frog.

[GPL-3.0-only](../../LICENSE) · [Read Frog](https://github.com/mengxi-ream/read-frog) · [Avisos de terceros](../../THIRD_PARTY_NOTICES.md).

<div align="right">

[↑ Volver arriba](#readme-top)

</div>
