# Design system

The design system is derived from the canonical images and generator theme files under `design/`. It is implemented in `public/app.css` with CSS custom properties, native browser modules and self-hosted fonts. No external stylesheet, icon CDN or component framework is used.

## Color and status

Primary is `#0E6666`, primary-deep `#0A4B4B`, primary-soft `#E4F0EE`, text `#122A2A`, muted `#4C5F60`, surface `#FFFFFF`, surface-2 `#F6F9F8`, success `#28724F`, warning `#8C5609`, danger `#AF3438`, info `#316D86`, mission `#8A4B0F` and amber `#B57A12`. Map colors are land `#F0F2EC`, water `#B6D7E4`, park `#D3E6C6` and route `#0E6666`. Dark mode overrides surfaces and text while preserving teal identity and semantic contrast.

Status is always color plus icon plus text. Red is reserved for SOS, incidents and errors. Success green, warning amber, information blue and neutral gray each have a tinted pill background with a matching dot and label. Muted text meets a 4.5:1 contrast target on light surfaces.

## Typography and spacing

Vazirmatn is self-hosted at regular, medium, semi-bold, bold and black weights. Type roles are display 27/36, title-large 21/30, title 17/26, title-small 15/22, body 14.5/24, body-small 12.5/20, label 13/18, label-large 15/20, caption 11.5/17, caption-bold 11/16, metric 26/32, metric-small 19/24 and mono 13/20. Spacing uses 0, 4, 8, 12, 16, 20, 24, 32 and 40 pixels. Radii use 8, 12, 16, 20, 26, 32 and pill values.

## Components

Authentication frames use a two-column 1248-pixel card with a 500-pixel teal introduction and a 440-pixel form. Fields are 52 pixels tall; primary buttons are 44 pixels tall with 8-pixel radius. The mobile shell is 393 by 852 with a 54-pixel status area and safe-area bottom padding. The SOS dock is 104 by 56 with a progress bar driven by an 0.8-second hold. Bottom sheets have 28, 52 and 76 percent detents and a 32-pixel top radius.

Desktop cards use a 16-pixel radius and 1-pixel border; buttons use 11-pixel radius. KPI cards include a 40-pixel icon, large metric and semantic trend note. Tables use a tinted head, subtle row lines, 34-pixel avatars and a 48-pixel action column. Modal dialogs use a 20-pixel radius and a dimmed backdrop. Toasts appear at the top center with semantic icons.

## Interaction and accessibility

Interactive controls have visible focus outlines and at least 38-pixel targets, with 44 pixels for primary form controls. Transitions are short and use a shared easing curve. A reduced-motion media query disables animation and transitions. Sheets close by drag or Escape; modals close by backdrop, close button or Escape; command search opens with Ctrl K. All decorative icons are hidden from assistive technology, while icon-only buttons have labels. Text remains readable at the smallest 11.5-pixel caption size.

## Responsive behavior

Authentication collapses to one column below 900 pixels and becomes compact below 560. The mobile map fills the viewport on small screens. The desktop sidebar becomes a horizontal icon rail below 900; grids collapse below 620 while tables retain horizontal scrolling. Dark mode, safe areas and right-to-left direction are applied globally, not per component.
