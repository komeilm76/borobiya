# Bundled map fonts

These fonts are served by Martin and turned into MapLibre glyph ranges on demand; no pre-generated glyph PBF files are needed.

| Font file | Martin font name | Copyright | SHA-256 |
|---|---|---|---|
| `NotoSans-Regular.ttf` | `Noto Sans Regular` | Copyright 2012 Google Inc. | `371924e7480d3d01807fdc1bd30442d0a6651e6b5ea546482f5883d613cf0419` |
| `NotoNaskhArabic-Regular.ttf` | `Noto Naskh Arabic Regular` | Copyright 2014 Google Inc. | `d42ab8a21585ca002cc9dc7f05145b3a432acf80b3dcf0d35a022e9f8a45a77a` |

Source files are from [`openmaptiles/fonts`](https://github.com/openmaptiles/fonts) at commit `d48c5fce2fc58b55c98d353558d807cac45e7262`:

- [Noto Sans Regular](https://github.com/openmaptiles/fonts/blob/d48c5fce2fc58b55c98d353558d807cac45e7262/noto-sans/NotoSans-Regular.ttf)
- [Noto Naskh Arabic Regular](https://github.com/openmaptiles/fonts/blob/d48c5fce2fc58b55c98d353558d807cac45e7262/noto-sans/NotoNaskhArabic-Regular.ttf)

Both font files are distributed under the SIL Open Font License 1.1; the full license is in [`OFL.txt`](./OFL.txt). The font copyright notices are also embedded in each font file. `Borobiya Sans` is a Martin font alias that tries Noto Sans first, then Noto Naskh Arabic for Arabic/Persian glyph coverage.
