# README media

The banner is an original asset generated with the built-in imagegen tool. See [the exact prompt](../brand/BANNER-PROMPT.md) and [brand sources](../brand/READFINCH.md).

The reading, command-layout and local-notebook screenshots come from actual ReadFinch windows. `scripts/readme-assets.mjs` creates isolated profiles and a local fixture server, exercises translation and note saving, and captures English and Simplified Chinese in light and dark themes. They contain no real account, API key, private reading material or third-party model output.

Run `npm run build` followed by `node scripts/readme-assets.mjs` to refresh these screenshots on a Windows desktop. The interface supports English and Simplified Chinese; other README translations use the English screenshots.
