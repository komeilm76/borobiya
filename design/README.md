# Borobiya canonical design contract

This directory is the authoritative visual reference for the clean rebuild. The PNG files are generated from the reference generators and are read-only inputs to implementation. The browser application in `public/` reproduces the map, authentication, administrative, icon and interaction contracts documented here. All Markdown in this directory is written in English; product copy inside the application remains right-to-left Persian as required by the reference screens.

## Shared design tokens

The mobile map is specified at 393 by 852 logical pixels at 2x density, with a 54-pixel safe top area and a 30-pixel safe bottom area. The sheet header is 44 pixels, the segmented control 44 pixels and the search field 56 pixels. Corner radii are 8, 12, 16, 20, 26, 32 and pill. Spacing uses 0, 4, 8, 12, 16, 20, 24, 32 and 40 pixels. Type roles are display 27/36, title-large 21/30, title 17/26, title-small 15/22, body 14.5/24, body-small 12.5/20, label 13/18, label-large 15/20, caption 11.5/17, caption-bold 11/16, metric 26/32, metric-small 19/24 and mono 13/20.

The light palette uses primary `#0E6666`, primary-deep `#0A4B4B`, primary-soft `#E4F0EE`, text `#122A2A`, muted `#4C5F60`, surface `#FFFFFF`, surface-2 `#F6F9F8`, success `#28724F`, warning `#8C5609`, danger `#AF3438`, info `#316D86`, mission `#8A4B0F`, amber `#B57A12`, map land `#F0F2EC`, water `#B6D7E4`, park `#D3E6C6` and route `#0E6666`. Status always combines color, icon and text. Red is reserved for SOS, incidents and errors. Muted text maintains a contrast ratio of at least 4.5:1.

The desktop console is specified at 1440 by 900 pixels with a 264-pixel right sidebar, 68-pixel top bar, 28-pixel page padding and 1176-pixel content width. Console colors include `card_edge #E3EAE8`, `table_head #F7FAF9`, `row_line #EFF4F2`, `rail_bg #FBFDFC` and `chart_grid #E8EEEC`. Chart series use `#0E6666`, `#B57A12`, `#316D86`, `#8A4B0F` and `#2C7A57`.

## Authentication

Authentication uses a 1440 by 900 right-to-left frame with a cream and light-green gradient, 88-pixel chrome and a centered 1248-pixel frame with 24-pixel rounding. The dark-teal introduction sits on the physical right; the white form sits on the left with a 440-pixel form column and 52-pixel fields. Theme selection defaults to system and resolves before first paint. Below 900 pixels the frame becomes one column; below 560 pixels the spacing tightens. Registration adds five security questions, and recovery proceeds through decoy-resistant challenge steps.

## Mobile map

The map is the primary surface. It shows a full-bleed offline vector city, a four-part top selector, POI pins, an accuracy circle, live companion markers, a scale control, recenter and radar controls, quick destination chips and a bottom search field. The SOS dock is 104 by 56 pixels and requires an 0.8-second press-and-hold. Bottom sheets use three detents: 28, 52 and 76 percent of the viewport. Ordinary panels use at most two states; the third is reserved for an active trip. The primary action is never hidden, and bottom padding includes the safe area plus 12 pixels.

The SOS compose flow has four steps: description, location, optional photo and review. Mission and SOS progress rails show explicit stages. Companion freshness rings indicate live location age. One-to-one talk uses a press-and-hold floor control with a waveform, amber microphone and an explicit no-recording note. History playback, live sharing and a fifth profile/account section complete the mobile experience.

## Administration

The console overview has four KPIs, a live operations map, group readiness, alerts and a recent-requests table. Users, groups, incident types, reports, audit, alerts, settings and a three-column dispatch board are separate first-class views. The first table column starts on the physical right; status sits on the left; row menus occupy a 48-pixel column. Card radius is 16 pixels, button radius 11 pixels and detail navigation uses a left chevron.

## Icon contract

Every icon name must exist in the shipped Material Design Icons font subset and in `design/icons/icons.json`. Standard icon sizes are 16, 18, 20, 22 and 26 pixels, with a 76-pixel display size in the overview. The generated CSS is verified by the asset test so no screen can reference a non-existent glyph.
