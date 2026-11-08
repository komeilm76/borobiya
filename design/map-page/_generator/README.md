# Map-page reference generator

This generator produces the canonical PNG references for the mobile map experience. It is preserved as a design source and is not part of the production runtime. The application does not execute Python at request time; it serves deterministic SVG tiles and a dependency-free browser client generated from the same visual tokens.

## Environment

The scripts target Python 3.11 and use the local Pillow package with the bundled font assets in `_generator/assets/`. Theme values live in `_generator/bb/theme.py`, including the primary teal, surface colors, typography scale, spacing, radii, status colors and map palette. The generator draws right-to-left text with the bundled Vazirmatn font and uses logical coordinates so that the physical right and left sides match the reference composition.

## Outputs

The generator writes the navigation, bottom-sheet, SOS, mission, companions, talk, history, profile and design-system images into their corresponding folders under `design/map-page/`. Each image is a full screen or component snapshot at the mobile reference size. The files are read-only evidence for the browser implementation. Do not replace them with approximations or unrelated artwork; a visual contract change requires a deliberate generator change and a full regeneration of the affected family.

## Implementation mapping

The browser reproduces the generator tokens in `public/app.css`. The offline tile renderer in `src/domain/map.ts` uses the same land, water, park, road and route colors. Bottom-sheet detents, SOS hold timing, segmented navigation, quick chips, live markers, accuracy circles, waveform geometry and status semantics are described in `design/map-page/README.md`. The generated images are consulted when implementing or reviewing those components.

## Maintenance

Run the generator only when the design itself changes. Keep source coordinates, colors and typography in the theme module rather than scattering literals across drawing scripts. After regeneration, review every affected PNG and rerun `npm run assets` plus the automated suite. Production assets come from `scripts/build-assets.mjs`; this Python generator remains an isolated design aid.
