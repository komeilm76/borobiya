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

export const typography = {
  fontFamily: '"Vazirmatn", "Segoe UI", Tahoma, sans-serif',
  sizes: { caption: "0.75rem", body: "1rem", title: "1.25rem", heading: "2rem" },
  weights: { regular: 400, medium: 500, semibold: 600, bold: 700, heavy: 800 },
  lineHeights: { body: 1.7, heading: 1.25 }
} as const;

export const palettes = {
  light: {
    background: "#f4f7f6", surface: "#ffffff", primary: "#0e6666",
    secondary: "#e9b35a", accent: "#d77a58", error: "#b83f42",
    success: "#347c61", info: "#4a7c91",
    text: "#193536", muted: "#627a7a", onPrimary: "#ffffff", brand: "#0e6666"
  },
  dark: {
    background: "#111c1d", surface: "#1b292a", primary: "#71c7be",
    secondary: "#e9b35a", accent: "#f09a75", error: "#f37c7c",
    success: "#6bbe93", info: "#85b8d0",
    text: "#edf5f2", muted: "#afc1bc", onPrimary: "#111c1d", brand: "#0e6666"
  }
} as const;

export type DesignTheme = keyof typeof palettes;

/** Vuetify and plain CSS derive from one palette; no second palette to drift. */
export function vuetifyThemeColors(theme: DesignTheme) {
  const { background, surface, primary, secondary, accent, error, success, info } = palettes[theme];
  return { background, surface, primary, secondary, accent, error, success, info };
}

export function designTokenStylesheet(): string {
  const shared = [
    `--bb-grid-unit: ${gridUnit}px`,
    ...Object.entries(spacing).map(([key, value]) => `--bb-space-${key}: ${value}px`),
    `--bb-font-family: ${typography.fontFamily}`,
    ...Object.entries(typography.sizes).map(([key, value]) => `--bb-font-${key}: ${value}`),
    ...Object.entries(typography.weights).map(([key, value]) => `--bb-weight-${key}: ${value}`),
    ...Object.entries(typography.lineHeights).map(([key, value]) => `--bb-leading-${key}: ${value}`)
  ];
  const colors = (theme: DesignTheme) => Object.entries(palettes[theme])
    .map(([key, value]) => `--bb-color-${key}: ${value}`);
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
