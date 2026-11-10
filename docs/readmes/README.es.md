<!-- Generated from docs/readmes/content.json by npm run docs:readme. -->
<div align="center">
<a id="readme-top"></a>

<img src="../../docs/assets/readfinch-banner.png" alt="ReadFinch · 伴读雀 — A little help, right beside your words." width="1280">

# ReadFinch · 伴读雀

**Un compañero de lectura, junto a tus palabras.**

ReadFinch es una aplicación de escritorio de código abierto para leer y escribir. Traduce texto seleccionado, consulta palabras, mejora tu escritura y guarda notas desde distintas aplicaciones. El OCR permite extraer el texto que no puedes seleccionar.

<p><a href="../../README.md">English</a> · <a href="../../docs/readmes/README.zh-CN.md">简体中文</a> · <a href="../../docs/readmes/README.zh-TW.md">繁體中文</a> · <a href="../../docs/readmes/README.ja.md">日本語</a> · <a href="../../docs/readmes/README.ko.md">한국어</a> · <a href="../../docs/readmes/README.fr.md">Français</a> · <a href="../../docs/readmes/README.de.md">Deutsch</a> · <strong>Español</strong></p>

<p>
<a href="../../LICENSE"><img src="https://img.shields.io/badge/License-GPL--3.0-4d443e?style=flat-square" alt="GPL-3.0-only"></a>
<img src="https://img.shields.io/badge/Version-1.2.8-4d443e?style=flat-square" alt="1.2.8">
<img src="https://img.shields.io/badge/AI-Bring_your_own_provider-74675d?style=flat-square" alt="Bring your own AI provider">
</p>

[Descargar la última versión](https://github.com/0xlane/ReadFinch/releases/latest) · [Primeros pasos](#get-started) · [Funciones](#features) · [Documentación](#documentation) · [Informar de un problema](https://github.com/0xlane/ReadFinch/issues)

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

## Funciones

| Lo que quieres hacer | Cómo te ayuda ReadFinch |
| --- | --- |
| **Leer y comprender** | Lee las traducciones mientras se generan, consulta pronunciaciones y ejemplos, y descompón las frases largas en partes comprensibles. |
| **Mejorar tu escritura** | Ve los cambios en el texto original, entiende los motivos de la revisión y lleva la versión mejorada a tu editor. |
| **Leer texto que no se puede seleccionar** | Captura una zona de la pantalla o importa una imagen para extraer el texto y después traducirlo, consultar palabras o ejecutar una instrucción personalizada. |
| **Escuchar mientras lees** | Escucha selecciones, traducciones y ejemplos con voces del sistema sin conexión o síntesis de voz en línea. Elige y prueba voces por idioma; los ajustes de reproducción dependen del servicio de voz. |
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

### Un proveedor para cada función

Conecta tu propia cuenta de API con ajustes predefinidos para OpenAI, Anthropic, Gemini, DeepSeek, Azure, Amazon Bedrock, OpenRouter y otros, o utiliza una API compatible con Chat Completions o Responses. También se admiten servicios de traducción especializados. Cada entrada de proveedor de IA utiliza un modelo; duplícala para usar otro. Puedes asignar proveedores distintos a la traducción, el diccionario, la escritura, el OCR, la detección de idioma y la síntesis de voz en línea. Según el servicio, dispones de sugerencias de modelos, pruebas de conexión, temperatura, cabeceras personalizadas y un proxy por proveedor.

### Idiomas

Elige entre ocho idiomas predefinidos para las traducciones y las explicaciones:

**English · 简体中文 · 繁體中文 · 日本語 · 한국어 · Français · Deutsch · Español**

La **interfaz está disponible en inglés y chino simplificado** y sigue el idioma del sistema por defecto. El idioma de la interfaz y el de los resultados se configuran por separado. La calidad de la traducción y los idiomas admitidos dependen del proveedor y del modelo elegidos.

<a id="get-started"></a>

## Primeros pasos

**[Descargar la última versión](https://github.com/0xlane/ReadFinch/releases/latest)**

Elige el paquete para tu sistema operativo en la última versión publicada. No necesitas herramientas de desarrollo para utilizar la aplicación empaquetada.

| Sistema | Paquete |
| --- | --- |
| Windows x64 | `*-setup.exe` para instalar, o `*-portable.exe` para usar sin instalación. |
| macOS | `arm64` para chips de Apple o `x64` para Intel; disponible en `.dmg` y `.zip`. |
| Linux x64 | `.AppImage` para ejecutar directamente, o `amd64.deb` para Debian y Ubuntu. |

La búsqueda automática de actualizaciones está activada por defecto y se configura en About. Las instalaciones de Windows y las AppImages de Linux pueden instalar actualizaciones al salir. En macOS, reinicia para actualizar si la ubicación de la aplicación permite escritura. Las versiones portátiles de Windows, las aplicaciones macOS en ubicaciones de solo lectura y los paquetes DEB de Linux requieren instalación manual. Las versiones antiguas de macOS necesitan una actualización manual a una versión que incluya el asistente de actualización.

### Primeros pasos

1. **Conecta un proveedor.** En API Providers, elige un ajuste predefinido o un endpoint compatible, introduce las credenciales necesarias y el modelo, y prueba la conexión. Puedes asignarlo como predeterminado o a una función concreta.
2. **Selecciona una frase.** Pulsa Translate en la barra de selección, elige el idioma de destino y fija el resultado si quieres seguir leyendo junto a él.
3. **Obtén texto de una imagen.** Usa el atajo OCR indicado abajo para seleccionar una zona, revisa el texto reconocido y elige una instrucción.

### Atajos útiles

| Instrucción | Windows / Linux | macOS |
| --- | --- | --- |
| Traducir selección | `Alt + D` | `Option + D` |
| Abrir diccionario | `Alt + Shift + D` | `Option + Shift + D` |
| Mejorar escritura | `Alt + Shift + W` | `Option + Shift + W` |
| Elegir instrucción | `Ctrl + Shift + Space` | `Command + Shift + Space` |
| Capturar texto con OCR | `Alt + Shift + S` | `Option + Shift + S` |
| Leer texto del portapapeles | `Ctrl + Shift + V` | `Command + Shift + V` |
| Traducir texto escrito | `Alt + A` | `Option + A` |

Puedes cambiar los atajos en su página de ajustes. La configuración se guarda automáticamente y la apariencia sigue al sistema o a tu elección clara u oscura. El inicio al entrar en el sistema está desactivado por defecto y se cambia desde el menú de la bandeja.

### Compatibilidad con plataformas

| Plataforma | Cómo se obtiene el texto |
| --- | --- |
| Windows | Lee el texto seleccionado en la aplicación activa mediante UI Automation y Java Access Bridge. |
| macOS | Requiere permiso de Accesibilidad para leer selecciones y de Grabación de pantalla para las capturas. |
| Linux | Utiliza la selección PRIMARY en X11 (`xclip`, `xdotool`, `xprop`). En Wayland utiliza el portapapeles o el portal de capturas del escritorio; los atajos dependen del entorno. |

La detección automática requiere que la aplicación activa permita leer el texto seleccionado. Si no es posible, utiliza el OCR o el portapapeles. Los permisos, las limitaciones y el estado de validación se detallan en la [matriz de compatibilidad](../../docs/PLATFORMS.md).

## Datos y privacidad

**En tu dispositivo.** El contenido de los cuadernos se guarda en tu dispositivo. El OCR integrado procesa las imágenes localmente y las voces del sistema sin conexión no necesitan un servicio de voz en línea.

**Las solicitudes van al proveedor elegido.** Las traducciones y las instrucciones de IA envían el texto necesario para la solicitud; la síntesis de voz en línea envía el texto que se va a leer. El OCR en línea transmite la zona capturada o la imagen importada al proveedor de visión seleccionado. Cada servicio gestiona sus cuentas, disponibilidad y tarifas de uso.

**Configuración que puedes trasladar.** Importa o exporta archivos, o sincroniza manualmente los ajustes mediante WebDAV. Proveedores, instrucciones, atajos y asignaciones de campos se trasladan juntos. Las claves API y las cabeceras personalizadas son específicas de cada dispositivo y deben configurarse aparte en otro equipo. El contenido de los cuadernos no forma parte de la sincronización de ajustes.

<a id="documentation"></a>

## Documentación

- [Arquitectura y estructura del código](../../docs/ARCHITECTURE.md)
- [Proveedores, modelos y asignación de funciones](../../docs/MODELS.md)
- [Reconocimiento de texto en capturas e imágenes (OCR)](../../docs/OCR.md)
- [Configuración y WebDAV](../../docs/CONFIGURATION.md)
- [Plataformas y permisos](../../docs/PLATFORMS.md)
- [Idiomas de la interfaz y de traducción](../../docs/LANGUAGES.md)
- [Versiones y actualizaciones de la aplicación](../../docs/UPDATES.md)

La documentación técnica está disponible en chino o en inglés.

## Contribuir

Son bienvenidos los informes de errores reproducibles, las propuestas de usabilidad, las correcciones de traducción y las pull requests. Indica el sistema operativo y la versión de la aplicación, y elimina las credenciales y el texto privado de los ejemplos. [Abrir una incidencia](https://github.com/0xlane/ReadFinch/issues) · [Contribuir código](https://github.com/0xlane/ReadFinch/pulls).

### Compilar desde el código fuente

Para compilar en tu equipo necesitas **Node.js 24**, npm y Git. En Windows, instala el compilador de C# de .NET Framework 4.8 y configura `JAVA_HOME` con la ruta de un OpenJDK x64 como Temurin 21. En macOS, instala las herramientas de línea de comandos de Xcode.

```sh
git clone https://github.com/0xlane/ReadFinch.git
cd ReadFinch
npm ci
npm run assets:ocr
npm run build
npm start
```

`assets:ocr` descarga los datos de reconocimiento **al preparar la compilación de desarrollo**. Los datos se incluyen en la aplicación, por lo que no hay que descargar paquetes de idiomas después de instalarla. Ejecuta `npm run dist` en el sistema de destino para generar los paquetes en `release/`.

```sh
npm run typecheck
npm test
npm run build
```

Los textos del README están en `docs/readmes/content.json`. Después de editar una traducción, ejecuta `npm run docs:readme`; el generador comprueba que se cubran los idiomas de destino de la aplicación.

## Licencia y agradecimientos

ReadFinch se distribuye bajo **GPL-3.0-only**. Las interacciones de la barra de selección y las tarjetas se inspiran en **Read Frog**. ReadFinch es un proyecto de escritorio independiente y no una versión oficial de Read Frog.

[GPL-3.0-only](../../LICENSE) · [Read Frog](https://github.com/mengxi-ream/read-frog) · [Avisos de terceros](../../THIRD_PARTY_NOTICES.md)

<div align="right">

[↑ Volver arriba](#readme-top)

</div>
