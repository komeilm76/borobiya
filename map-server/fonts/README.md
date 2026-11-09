# Bundled map fonts

Martin turns these local OFL-licensed TrueType files into MapLibre glyph PBF ranges on demand; the map never fetches fonts from a third-party browser origin. These are **map-label glyphs**, separate from the client's self-hosted Vazirmatn WOFF/WOFF2 UI faces.

| Font file | Martin font name | Copyright | SHA-256 |
|---|---|---|---|
| `Vazirmatn-Regular.ttf` | `Vazirmatn Regular` | Copyright 2015 The Vazirmatn Project Authors | `b69fd4c680b8f3f225feabcc655a2c585d97627b8f5f5c0f9985e894069f3a56` |
| `NotoSans-Regular.ttf` | `Noto Sans Regular` | Copyright 2012 Google Inc. | `371924e7480d3d01807fdc1bd30442d0a6651e6b5ea546482f5883d613cf0419` |
| `NotoNaskhArabic-Regular.ttf` | `Noto Naskh Arabic Regular` | Copyright 2014 Google Inc. | `d42ab8a21585ca002cc9dc7f05145b3a432acf80b3dcf0d35a022e9f8a45a77a` |

Vazirmatn Regular comes from [the official Vazirmatn v33.003 release](https://github.com/rastikerdar/vazirmatn/blob/v33.003/fonts/ttf/Vazirmatn-Regular.ttf). The accompanying upstream license [`Vazirmatn-OFL.txt`](./Vazirmatn-OFL.txt) contains the project's copyright notice and SIL Open Font License 1.1. The TrueType family/style names embedded in that file are `Vazirmatn` / `Regular`. The source glyph coverage was checked for Persian text and digits (`تهران`, `خیابان`, `۱۲۳`) as well as Latin (`Street`, `Berlin`).

The Noto files are from [`openmaptiles/fonts`](https://github.com/openmaptiles/fonts) at commit `d48c5fce2fc58b55c98d353558d807cac45e7262`:

- [Noto Sans Regular](https://github.com/openmaptiles/fonts/blob/d48c5fce2fc58b55c98d353558d807cac45e7262/noto-sans/NotoSans-Regular.ttf)
- [Noto Naskh Arabic Regular](https://github.com/openmaptiles/fonts/blob/d48c5fce2fc58b55c98d353558d807cac45e7262/noto-sans/NotoNaskhArabic-Regular.ttf)

Their SIL Open Font License 1.1 is in [`OFL.txt`](./OFL.txt); the copyright notices are also embedded in each TTF. Martin's `Borobiya Vazirmatn` stack tries Vazirmatn first for both Persian and Latin, then Noto Sans and Noto Naskh Arabic for characters missing from that face. The **new stack name** makes MapLibre request new glyph URLs instead of using cached PBFs for the previous Noto-first `Borobiya Sans` stack. Existing cached tiles are not deleted. Rendered-device acceptance and a live Martin glyph-endpoint check remain open.
