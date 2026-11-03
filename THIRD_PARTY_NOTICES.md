# Third-party notices

ReadFinch is distributed under GPL-3.0-only. See LICENSE. Its desktop application code is developed independently except for the explicitly attributed adaptations below.

## Read Frog reference

Read Frog, copyright its respective contributors, GPL-3.0. Inspected version 1.54.1, commit `15c0cc56cfeb476c527cd57abfbfe8f03f2d6110`.

Source: https://github.com/mengxi-ream/read-frog

The provider defaults and ordered text-model lists in `src/shared/provider-catalog.json` are extracted from Read Frog commit `96083134b111e56762f578b143bcd48e85058ba3` (GPL-3.0), with local provider ID aliases. `scripts/sync-provider-catalog.mjs` records and reproduces this data snapshot. Desktop speech models and capability metadata are maintained separately.

The morphing thinking-icon paths in `src/renderer/Thinking.tsx` are adapted from `src/components/icons/thinking-icon.tsx` in that Read Frog commit, copyright the Read Frog contributors, GPL-3.0. ReadFinch implements the animation with the Web Animations API and follows the reference thinking panel's labels, collapsed default, and scroll behavior.

Read Frog's interface screenshots, GPL selection components and custom-action prompts were studied to reproduce its selection toolbar and action-card behavior. ReadFinch implements these desktop components independently and uses the same publicly available icon sets listed below. No Read Frog brand logo, extension packaging or content scripts are included. The separately licensed proprietary `@read-frog/layout-engine` is not used or bundled. The local `.reference/` research directory is excluded from packaging and version control. The GPL license text is retained in LICENSE.

## Reference UI icons

Local SVG paths are sourced without modification from the following public Iconify packages. They are included under `dist/renderer/reference-icons/`, together with `NOTICE.txt` and the Apache-2.0 license text. Labels, layout and surrounding components are ReadFinch implementations.

- Streamline Color 1.2.2, Streamline / Webalys, **CC BY 4.0**: `dictionary-language-book-flat` and `ai-edit-spark-flat`. Source: https://github.com/webalys-hq/streamline-vectors . License: https://creativecommons.org/licenses/by/4.0/ . No endorsement is implied.
- Remix Icon (`@iconify-json/ri` 1.2.10), Remix Design, **Apache-2.0**: `translate`. Source: https://github.com/Remix-Design/RemixIcon . The specific source package's license is recorded in the bundled notice.
- ReadFinch also bundles all 6,305 Tabler, 3,229 Remix Icon and 2,000 Streamline color glyphs from these same packages for the offline command icon picker. Their original SVG geometry is arranged into local sheets under `dist/renderer/command-icons`. The licenses and credits below apply to these sheets.
- Tabler Icons 1.2.43, copyright Paweł Kuna, **MIT**: pin, pinned-filled, close, copy, volume, chevrons, grip, context, tool and refresh. Source: https://github.com/tabler/tabler-icons . The full MIT notice is bundled.

## Provider marks

The bundled provider marks come from [LobeHub Icons](https://github.com/lobehub/lobe-icons), package `@lobehub/icons-static-webp` 2.6.0 (light and dark variants), and the retained SVG package 1.102.0. Copyright 2023 LobeHub. The MIT license is included in `dist/renderer/provider-icons/LICENSE.txt`. Jalapeno Cloud and Tensdaq marks are sourced from the pinned Read Frog GPL-3.0 tree identified above; their provenance is recorded in `provider-icons/NOTICE.txt`. These marks identify supported services and do not imply endorsement.

## Runtime dependencies and assets

- franc 6.2.0 and its language-model dependencies retain their MIT notices.
- Electron: MIT (Chromium and bundled components retain their own notices in the Electron distribution).
- React and React DOM: MIT.
- Vercel AI SDK provider adapters for Anthropic, Google, Azure, Amazon Bedrock, Cohere and Open Responses: Apache-2.0. `ai-sdk-ollama`: MIT. Their exact versions and transitive dependency licenses are retained in the package lock and installed packages.
- Lucide: ISC.
- Zod: MIT.
- LiquidJS (MIT) evaluates local HTML + Liquid layouts. DOMPurify (Apache-2.0 or MPL-2.0) sanitizes the resulting markup.
- CodeMirror and its Liquid language support (MIT) power the layout source editor.
- Tesseract.js and Tesseract.js-core: Apache-2.0. Upstream engine components retain their included license files.
- `eng.traineddata` and `chi_sim.traineddata`: tesseract-ocr/tessdata_fast 4.1.0, Apache-2.0. https://github.com/tesseract-ocr/tessdata_fast
- react-markdown, remark-gfm and diff: MIT. Transitive dependency licenses are shipped with their packages.

Exact installed runtime dependency versions are recorded in package-lock.json; static reference icon package versions are recorded above and in their bundled notice. Other UI icons are Lucide and the original ReadFinch mark. No remotely hosted fonts or stock illustrations are loaded.
