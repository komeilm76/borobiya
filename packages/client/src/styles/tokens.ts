// Shared design primitives for the client. Keep the pre-paint theme-init.js background
// constants in sync (asserted in tokens.test.ts); that static script must run before Vite.
export const gridUnit = 8;

// Major spacing follows an 8px grid; the 4px half-step is for small icons and labels.
export const spacing = {
  none: 0,
  half: 4,
  one: 8,
  two: 16,
  three: 24,
  four: 32,
  six: 48,
  eight: 64
} as const;

// Global radius configuration. Edit these numbers to update token-backed styles
// throughout the app; main.ts installs the resulting CSS variables at startup.
// Card and nested surfaces are intentionally rounder than text buttons. Compact
// buttons (such as the 28px-high refresh action) should not become pill-shaped.
export const radii = { card: 24, nested: 16, button: 12, "button-compact": 8 } as const;

export const typography = {
  fontFamily: '"Vazirmatn Variable", "Segoe UI", Tahoma, sans-serif',
  sizes: { caption: "0.75rem", body: "1rem", title: "1.25rem", heading: "2rem" },
  weights: { regular: 400, medium: 500, semibold: 600, bold: 700, heavy: 800 },
  lineHeights: { body: 1.7, heading: 1.25 }
} as const;

export const palettes = {
  light: {
    background: "#f4f7f6", surface: "#ffffff", primary: "#0e6666",
    secondary: "#e9b35a", accent: "#d77a58", error: "#b83f42",
    success: "#347c61", info: "#4a7c91", warning: "#fb8c00",
    // Small labels also sit on the pale inset, not only on white cards.
    text: "#193536", muted: "#586f6f", onPrimary: "#ffffff", brand: "#0e6666",
    inset: "#f4f7f6", outline: "#627a7a",
    // Settings/supporting copy and status colors are distinct from the base muted/error palette.
    "supporting-text": "#536d6c", "error-text": "#b3261e", "row-outline": "#629289"
  },
  dark: {
    background: "#111c1d", surface: "#294043", primary: "#71c7be",
    secondary: "#e9b35a", accent: "#f6a987", error: "#ff9999",
    success: "#79cba3", info: "#95c5da", warning: "#fbd582",
    text: "#edf5f2", muted: "#afc1bc", onPrimary: "#111c1d", brand: "#0e6666",
    // An inset row needs a visible boundary on the raised surface without
    // sacrificing 4.5:1 for muted/primary text inside it.
    inset: "#304749", outline: "#82aaa5",
    "supporting-text": "#a0b6b2", "error-text": "#ffb4ab", "row-outline": "#82aaa5"
  }
} as const;

// Separate depth tiers: content panels, selectable rows and their active/hover state.
export const shadows = {
  light: {
    surface: "0 12px 32px rgba(25, 53, 54, 0.10), 0 2px 8px rgba(25, 53, 54, 0.04)",
    overlay: "0 14px 34px rgba(16, 43, 44, 0.24), 0 3px 10px rgba(16, 43, 44, 0.10)",
    hero: "0 20px 50px rgba(14, 70, 66, 0.16)",
    feature: "0 24px 70px rgba(31, 67, 66, 0.09)",
    item: "0 4px 14px rgba(25, 53, 54, 0.09)",
    itemHover: "0 10px 24px rgba(25, 53, 54, 0.17)"
  },
  dark: {
    surface: "0 16px 38px rgba(0, 0, 0, 0.30), 0 3px 10px rgba(0, 0, 0, 0.16)",
    overlay: "0 16px 40px rgba(0, 0, 0, 0.46), 0 3px 12px rgba(0, 0, 0, 0.22)",
    hero: "0 20px 50px rgba(0, 0, 0, 0.34)",
    feature: "0 24px 70px rgba(0, 0, 0, 0.25)",
    item: "0 4px 14px rgba(0, 0, 0, 0.26)",
    itemHover: "0 10px 24px rgba(0, 0, 0, 0.40)"
  }
} as const;

// Shared application chrome and the legacy workspace welcome surface. Keep
// route-specific map geometry and touch-target dimensions in their owners.
// These names describe roles rather than individual CSS declarations so editing
// either theme here updates topbar, footer, welcome state and alert treatments.
export const shellColors = {
  light: {
    topbarEdge: "rgba(26, 67, 68, 0.08)", topbarFill: "rgba(255, 255, 255, 0.9)",
    navInk: "#527071", brandInk: "#ffffff", brandShadow: "0 7px 18px rgba(14, 102, 102, 0.2)",
    brandTagline: "var(--bb-color-muted)", alertFill: "#fff0ee",
    mainBackdrop: "radial-gradient(ellipse at 8% 7%, rgba(233, 179, 90, 0.12), transparent 30%), radial-gradient(ellipse at 92% 72%, rgba(14, 102, 102, 0.08), transparent 34%), var(--bb-color-background)",
    eyebrowInk: "#537879", eyebrowSeparator: "#bdc9c7", heroInk: "#173b3c",
    statusDot: "#35a176", statusHalo: "0 0 0 4px rgba(53, 161, 118, 0.12)",
    welcomeEdge: "rgba(34, 75, 75, 0.08)",
    welcomeBackdrop: "radial-gradient(circle at 80% 2%, rgba(233, 179, 90, 0.14), transparent 37%), rgba(255, 255, 255, 0.94)",
    symbolEdge: "rgba(14, 102, 102, 0.1)", symbolInk: "#0e6666",
    symbolFill: "linear-gradient(145deg, #e8f4f0, #f8fbf9 70%)",
    orbitEdge: "rgba(14, 102, 102, 0.12)", orbitAccent: "rgba(233, 179, 90, 0.16)",
    sparkEdge: "#ffffff", sparkFill: "#e9b35a", sparkShadow: "0 3px 10px rgba(141, 99, 28, 0.2)",
    statusEdge: "rgba(53, 161, 118, 0.12)", statusInk: "#39765f", statusFill: "#eff8f3",
    welcomeInk: "#1a3b3c", welcomeCopy: "var(--bb-color-muted)",
    noteEdge: "rgba(34, 75, 75, 0.08)", noteFill: "rgba(255, 255, 255, 0.64)",
    noteIconInk: "#9a6a19", noteIconFill: "#fff3d9", noteHeading: "#365b5c",
    noteCopy: "var(--bb-color-muted)", footerEdge: "rgba(26, 67, 68, 0.07)",
    footerInk: "var(--bb-color-muted)", footerFill: "rgba(255, 255, 255, 0.76)"
  },
  dark: {
    topbarEdge: "var(--bb-color-outline)", topbarFill: "rgba(var(--v-theme-surface), 0.96)",
    navInk: "#b6cbc5", brandInk: "#ffffff", brandShadow: "0 7px 18px rgba(14, 102, 102, 0.2)",
    brandTagline: "#9cb1ac", alertFill: "#422f35",
    mainBackdrop: "radial-gradient(ellipse at 8% 7%, rgba(233, 179, 90, 0.07), transparent 30%), radial-gradient(ellipse at 92% 72%, rgba(113, 199, 190, 0.08), transparent 34%), var(--bb-color-background)",
    eyebrowInk: "#9fc4bc", eyebrowSeparator: "#526968", heroInk: "#e5f0ec",
    statusDot: "#35a176", statusHalo: "0 0 0 4px rgba(53, 161, 118, 0.12)",
    welcomeEdge: "var(--bb-color-outline)",
    welcomeBackdrop: "radial-gradient(circle at 80% 2%, rgba(233, 179, 90, 0.08), transparent 37%), rgba(var(--v-theme-surface), 0.96)",
    symbolEdge: "rgba(133, 202, 191, 0.18)", symbolInk: "#8bd2c8",
    symbolFill: "linear-gradient(145deg, #203b39, var(--bb-color-surface) 70%)",
    orbitEdge: "rgba(139, 210, 200, 0.18)", orbitAccent: "rgba(233, 179, 90, 0.24)",
    sparkEdge: "#203b39", sparkFill: "#e9b35a", sparkShadow: "0 3px 10px rgba(141, 99, 28, 0.2)",
    statusEdge: "rgba(107, 190, 147, 0.2)", statusInk: "#a6dfbd", statusFill: "#1c352b",
    welcomeInk: "#e1eeea", welcomeCopy: "#a9bcb7",
    noteEdge: "var(--bb-color-outline)", noteFill: "rgba(var(--v-theme-surface), 0.78)",
    noteIconInk: "#e6bd72", noteIconFill: "#3a321f", noteHeading: "#d8e7e2",
    noteCopy: "#a7bab5", footerEdge: "rgba(190, 221, 213, 0.1)",
    footerInk: "#9aafaa", footerFill: "rgba(var(--v-theme-surface), 0.82)"
  }
} as const;

export const shellTypography = {
  brandName: "1.1rem", supporting: "0.82rem", eyebrow: "0.83rem",
  heroTitle: "clamp(1.65rem, 2.5vw, 2.15rem)", heroTitlePhone: "clamp(1.65rem, 5vw, 2rem)",
  heroCopy: "clamp(1rem, 1.5vw, 1.12rem)", welcomeTitle: "1.22rem",
  welcomeCopy: "0.9rem", noteHeading: "0.84rem", alert: "0.9rem",
  profileName: "1.08rem", profileRole: "0.8rem", profileGuest: "0.95rem",
  profileTheme: "0.85rem", profilePortrait: "1.2rem", toastTitle: "0.85rem",
  toastSmall: "0.8rem"
} as const;

// Presentational spacing/blur shared by the non-map application shell.
// Keep viewport cutoffs, measured map clearances and 44/48px targets local.
export const shellLayout = {
  topbarBlur: "16px", heroGap: "clamp(2rem, 6vw, 5.5rem)",
  heroGapPhone: "1.5rem", heroPadding: "1.5rem 2.5rem",
  heroPaddingPhone: "1.1rem 1.5rem", welcomePadding: "clamp(1.5rem, 4vw, 2.5rem)",
  notePadding: "1rem 1.2rem",
  footerPadding: "0.75rem clamp(var(--bb-space-two, 1rem), 4vw, var(--bb-space-six, 3rem))"
} as const;

export const shellRadii = { brand: 15, symbol: 34, pill: 999, noteIcon: 12, focus: 2,
  profileChip: 10.4, profileTheme: 12, toastAction: 11.2 } as const;

export type DesignTheme = keyof typeof palettes;

/** Vuetify and plain CSS derive from one palette; no second palette to drift. */
export function vuetifyThemeColors(theme: DesignTheme) {
  const { background, surface, primary, secondary, accent, error, success, info, warning } = palettes[theme];
  return { background, surface, primary, secondary, accent, error, success, info, warning };
}

export function designTokenStylesheet(): string {
  const shared = [
    `--bb-grid-unit: ${gridUnit}px`,
    ...Object.entries(spacing).map(([key, value]) => `--bb-space-${key}: ${value}px`),
    ...Object.entries(radii).map(([key, value]) => `--bb-radius-${key}: ${value}px`),
    ...Object.entries(shellRadii).map(([key, value]) => `--bb-shell-radius-${key}: ${value}px`),
    ...Object.entries(shellTypography).map(([key, value]) => `--bb-shell-font-${key}: ${value}`),
    ...Object.entries(shellLayout).map(([key, value]) => `--bb-shell-layout-${key}: ${value}`),
    `--bb-font-family: ${typography.fontFamily}`,
    ...Object.entries(typography.sizes).map(([key, value]) => `--bb-font-${key}: ${value}`),
    ...Object.entries(typography.weights).map(([key, value]) => `--bb-weight-${key}: ${value}`),
    ...Object.entries(typography.lineHeights).map(([key, value]) => `--bb-leading-${key}: ${value}`)
  ];
  const colors = (theme: DesignTheme) => [
    ...Object.entries(palettes[theme]).map(([key, value]) => `--bb-color-${key}: ${value}`),
    ...Object.entries(shellColors[theme]).map(([key, value]) => `--bb-shell-${key}: ${value}`),
    `--bb-shadow-surface: ${shadows[theme].surface}`,
    `--bb-shadow-overlay: ${shadows[theme].overlay}`,
    `--bb-shadow-hero: ${shadows[theme].hero}`,
    `--bb-shadow-feature: ${shadows[theme].feature}`,
    `--bb-shadow-item: ${shadows[theme].item}`,
    `--bb-shadow-item-hover: ${shadows[theme].itemHover}`
  ];
  return `:root { ${[...shared, ...colors("light")].join("; ")} }\n:root.dark { ${colors("dark").join("; ")} }`;
}

/** Idempotent across HMR and repeat app entry; no global document needed in tests/SSR. */
export function installDesignTokenStyles(documentRoot: Pick<Document, "getElementById" | "createElement" | "head">): void {
  const id = "borobiya-design-tokens";
  let sheet = documentRoot.getElementById(id);
  if (!sheet) {
    sheet = documentRoot.createElement("style");
    sheet.id = id;
    documentRoot.head.appendChild(sheet);
  }
  sheet.textContent = designTokenStylesheet();
}
