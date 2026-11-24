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
export const radii = { card: 24, nested: 16, hero: 32, button: 12, "button-compact": 8 } as const;

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

// Guest entry chrome and sharing feedback have different semantic foregrounds
// from the signed-in shell. Keep light/dark pairs here so all consuming routes
// can be rethemed together without changing per-page CSS.
export const audienceColors = {
  light: {
    authCanvas: "radial-gradient(ellipse at 5% 8%, rgba(233, 179, 90, 0.18), transparent 34%), radial-gradient(ellipse at 92% 92%, rgba(14, 102, 102, 0.12), transparent 38%), #eef5f1",
    authBrand: "#173b3c", authTheme: "#214c49", authFocus: "#0e6666",
    authMarkInk: "#fff", authMarkFill: "#0e6666", authHomeEdge: "#b9d1ca",
    authHomeFill: "rgba(255, 255, 255, 0.75)", authHomeHover: "#fff",
    authIntro: "linear-gradient(155deg, #0c5154 0%, #164c4b 55%, #193c42 100%)",
    publicCanvas: "#f6f5ef", publicInk: "#193536", publicBrand: "#163c3b",
    publicCaption: "#687f78", publicNav: "#45645f", publicNavActive: "#0c5553",
    publicThemeEdge: "#cadbd4", publicThemeInk: "#214c49",
    publicMarkInk: "#fff", publicMarkFill: "#0d5c5b", publicLoginInk: "#164d4a",
    publicJoinInk: "#fff", publicJoinFill: "#0d5c5b", publicJoinHover: "#124c4b",
    publicThemeHover: "#e4f0eb", publicFocus: "#bb7b2e",
    shareSuccess: "#195e46",
    broadcastIdle: "#7d9291", broadcastActive: "#1f8a5b",
    broadcastHalo: "0 0 0 4px rgba(31, 138, 91, 0.18)",
    broadcastWarn: "#c57b14", broadcastError: "#b3261e",
    broadcastTitle: "#173b3c", broadcastDetail: "#536d6c",
    shareChipOn: "#2f6b46", shareChipInk: "#ffffff",
    shareRating: "#986000", shareDotIdle: "#758989", shareDotOnline: "#268251",
    shareWarning: "#a8560e", shareSelected: "#1d4038"
  },
  dark: {
    authCanvas: "radial-gradient(ellipse at 5% 8%, rgba(233, 179, 90, 0.08), transparent 34%), radial-gradient(ellipse at 92% 92%, rgba(113, 199, 190, 0.1), transparent 38%), #101d1e",
    authBrand: "#edf5f2", authTheme: "#edf5f2", authFocus: "#71c7be",
    authMarkInk: "#fff", authMarkFill: "#0e6666", authHomeEdge: "var(--bb-color-outline)",
    authHomeFill: "var(--bb-color-surface)", authHomeHover: "#2c4a49",
    authIntro: "linear-gradient(155deg, #103b3c 0%, #1b3535 55%, #282f35 100%)",
    publicCanvas: "#111c1d", publicInk: "#edf5f2", publicBrand: "#edf5f2",
    publicCaption: "#aec2bc", publicNav: "#d0e8de", publicNavActive: "#9be1d1",
    publicThemeEdge: "var(--bb-color-outline)", publicThemeInk: "#e2f0e9",
    publicMarkInk: "#fff", publicMarkFill: "#0d5c5b", publicLoginInk: "#d0e8de",
    publicJoinInk: "#111c1d", publicJoinFill: "#91d9c7", publicJoinHover: "#b4ecdc",
    publicThemeHover: "#24403c", publicFocus: "#f4d796",
    shareSuccess: "#7fdcb2",
    broadcastIdle: "#7d9291", broadcastActive: "#1f8a5b",
    broadcastHalo: "0 0 0 4px rgba(31, 138, 91, 0.18)",
    broadcastWarn: "#c57b14", broadcastError: "#b3261e",
    broadcastTitle: "#edf5f2", broadcastDetail: "var(--bb-color-muted)",
    shareChipOn: "#2f6b46", shareChipInk: "#ffffff",
    shareRating: "#986000", shareDotIdle: "#758989", shareDotOnline: "#268251",
    shareWarning: "#a8560e", shareSelected: "#1d4038"
  }
} as const;

export const audienceTypography = {
  chromeBrand: "1.05rem", chromeAction: "0.88rem", publicCaption: "0.8rem",
  publicNav: "0.9rem", broadcastTitle: "0.86rem", broadcastDetail: "0.82rem"
} as const;
export const audienceRadii = { authMark: 13, publicMark: 14 } as const;

// Form, health and footer roles are separate from the outer guest chrome.
// Avoid replacing colors with near-matches: the contrast and light/dark meanings
// of each role have been reviewed independently.
export const audienceDetails = {
  light: {
    publicHeroEdge: "#d8e5de",
    authDividerRule: "rgba(26, 67, 68, 0.1)", authDivider: "var(--bb-color-muted)",
    authSwitch: "var(--bb-color-muted)", authPrivacy: "var(--bb-color-muted)",
    publicEyebrow: "#0d6963", publicEyebrowRule: "#d6984e",
    publicHeroAssurance: "#49635e", publicHeroAssuranceIcon: "#0d6963",
    publicValueIcon: "#0d6963", publicValueIconFill: "#e9f5ef",
    publicStepsFill: "#edf5ee", publicStepsLine: "#cddfd3",
    publicStepsNumberInk: "#fff", publicStepsNumberFill: "#0d5c5b",
    publicTextLink: "#0d6660", publicFinalFill: "#183f40",
    publicFinalInk: "#fff", publicFinalEyebrow: "#f4d796",
    publicFinalButtonInk: "#173b3a", publicFinalButtonFill: "#f4d796",
    publicFinalButtonHover: "#ffe4ad", publicHealthHeading: "#193e3c",
    publicNotFoundEdge: "#cde3d8", publicNotFoundInk: "#0d6963",
    publicNotFoundFill: "#e6f3ec", publicNotFoundCopy: "#506b65",
    authHeading: "#1a3b3c", authEyebrow: "#6d8985",
    authLink: "#0e7772", authLinkHover: "#084e4c",
    authField: "#fff", authCardIcon: "#0e6666",
    authCardIconFill: "linear-gradient(145deg, #e4f3ee, #f8fbf9)",
    authQuestionHeading: "#244748", authQuestionIndex: "#0e6666",
    authQuestionIndexFill: "#edf7f3", authRecoveryStep: "#849695",
    authRecoveryQuestion: "#35595a", authRecoveryFill: "#fbfdfc",
    authSuccess: "#347c61", authSuccessFill: "#eff8f3",
    publicHeroInk: "#173b3a", publicHeroAccent: "#0e7772",
    publicHeroFill: "radial-gradient(circle at 18% 6%, #fffdf4, transparent 47%), linear-gradient(145deg, #f4f7ef, #e9f2ec)",
    publicHeroCopy: "#45645e", publicHeading: "#173b3a",
    publicButtonEdge: "#b8d1c7", publicButtonInk: "#1d5752",
    publicButtonFill: "rgba(255, 255, 255, 0.65)", publicButtonHover: "#fff",
    publicSectionCopy: "#526c65", publicValueEdge: "#bfd4ca",
    publicValueFill: "#fff", publicValueHeading: "#1b4442", publicValueCopy: "#556e68",
    publicHealthEdge: "#dae8df", publicHealthFill: "#fff",
    publicHealthIntro: "#506b65", publicHealthCopy: "#506b65", publicHealthSmall: "#4c6962",
    publicHealthBadge: "#765818", publicHealthBadgeFill: "#fff1d2",
    publicHealthOnline: "#165741", publicHealthOnlineFill: "#e2f4e9",
    publicHealthOffline: "#8c3135", publicHealthOfflineFill: "#fbe9e9",
    publicRetryEdge: "#b5d2c4", publicRetryInk: "#1a5953",
    publicRetryFill: "#f3f8f4", publicRetryHover: "#e1f1e8",
    publicHealthNoteInk: "#385e57", publicHealthNoteFill: "#eaf3ea",
    publicFooterEdge: "#dce7df", publicFooterFill: "#edf3ed",
    publicFooterCopy: "#547069", publicFooterHeading: "#1d4946", publicFooterNav: "#28534e"
  },
  dark: {
    publicHeroEdge: "var(--bb-color-outline)",
    authDividerRule: "rgba(190, 221, 213, 0.14)", authDivider: "#91a7a2",
    authSwitch: "#aec1bc", authPrivacy: "#9fb3ae",
    publicEyebrow: "#9be1d1", publicEyebrowRule: "#d6984e",
    publicHeroAssurance: "#c0d6cc", publicHeroAssuranceIcon: "#91d9c7",
    publicValueIcon: "#9be1d1", publicValueIconFill: "#284840",
    publicStepsFill: "var(--bb-color-surface)", publicStepsLine: "#3d5650",
    publicStepsNumberInk: "#102221", publicStepsNumberFill: "#91d9c7",
    publicTextLink: "#9be1d1", publicFinalFill: "#234541",
    publicFinalInk: "#fff", publicFinalEyebrow: "#f4d796",
    publicFinalButtonInk: "#173b3a", publicFinalButtonFill: "#f4d796",
    publicFinalButtonHover: "#ffe4ad", publicHealthHeading: "#edf5f2",
    publicNotFoundEdge: "#41655a", publicNotFoundInk: "#91d9c7",
    publicNotFoundFill: "#264039", publicNotFoundCopy: "#c0d6cc",
    authHeading: "#e3efeb", authEyebrow: "#9abdb5",
    authLink: "#8bd2c8", authLinkHover: "#b9e8e1",
    authField: "var(--bb-color-inset)", authCardIcon: "#8bd2c8",
    authCardIconFill: "linear-gradient(145deg, #24413e, var(--bb-color-surface))",
    authQuestionHeading: "#d5e5df", authQuestionIndex: "#8bd2c8",
    authQuestionIndexFill: "#213a38", authRecoveryStep: "#98aca7",
    authRecoveryQuestion: "#d5e5df", authRecoveryFill: "#192728",
    authSuccess: "#8bd7aa", authSuccessFill: "#1d382d",
    publicHeroInk: "#edf5f2", publicHeroAccent: "#9be1d1",
    publicHeroFill: "radial-gradient(circle at 18% 6%, #28443e, transparent 47%), #1c3331",
    publicHeroCopy: "#c0d6cc", publicHeading: "#edf5f2",
    publicButtonEdge: "var(--bb-color-outline)", publicButtonInk: "#e4f4ec",
    publicButtonFill: "#2a4842", publicButtonHover: "#37564d",
    publicSectionCopy: "#c0d6cc", publicValueEdge: "var(--bb-color-outline)",
    publicValueFill: "var(--bb-color-surface)", publicValueHeading: "#edf5f2", publicValueCopy: "#c0d6cc",
    publicHealthEdge: "var(--bb-color-outline)", publicHealthFill: "var(--bb-color-surface)",
    publicHealthIntro: "#aec2bc", publicHealthCopy: "#c0d6cc", publicHealthSmall: "#c0d6cc",
    publicHealthBadge: "#f5dea4", publicHealthBadgeFill: "#403720",
    publicHealthOnline: "#a5e6bc", publicHealthOnlineFill: "#224334",
    publicHealthOffline: "#ffc3c4", publicHealthOfflineFill: "#452a2d",
    publicRetryEdge: "var(--bb-color-outline)", publicRetryInk: "#dcf4e9",
    publicRetryFill: "#28453d", publicRetryHover: "#35584c",
    publicHealthNoteInk: "#d6e7da", publicHealthNoteFill: "var(--bb-color-inset)",
    publicFooterEdge: "var(--bb-color-outline)", publicFooterFill: "#192a29",
    publicFooterCopy: "#c0d6cc", publicFooterHeading: "#edf5f2", publicFooterNav: "#c0d6cc"
  }
} as const;

export const audienceDetailRadii = {
  step: 13, notFound: 26, trustIcon: 14, decorCross: 30,
  featureIndex: 10, cardIcon: 17, questionIndex: 10, recoveryIndex: 10, successIcon: 23,
  authMobileCard: 20, networkNode: 20, healthBadge: 20
} as const;

// Large insets and repeated row rhythm are presentation, unlike minimum touch
// areas, responsive cutoffs and diagram coordinates (which remain local).
// A shared rem rhythm retains root-font scaling in legacy guest/sharing CSS.
// Keys express hundredths of a rem (n = negative optical overlap). Isolated
// optical choices instead get named roles in audienceContentLayout below.
export const audienceRhythm = {
  n040: "-0.4rem",
  r010: "0.1rem",
  r012: "0.12rem",
  r015: "0.15rem",
  r018: "0.18rem",
  r020: "0.2rem",
  r025: "0.25rem",
  r030: "0.3rem",
  r035: "0.35rem",
  r040: "0.4rem",
  r045: "0.45rem",
  r050: "0.5rem",
  r055: "0.55rem",
  r060: "0.6rem",
  r065: "0.65rem",
  r070: "0.7rem",
  r075: "0.75rem",
  r080: "0.8rem",
  r085: "0.85rem",
  r090: "0.9rem",
  r100: "1rem",
  r110: "1.1rem",
  r120: "1.2rem",
  r125: "1.25rem",
  r140: "1.4rem",
  r145: "1.45rem",
  r150: "1.5rem",
  r160: "1.6rem",
  r170: "1.7rem",
  r200: "2rem",
  r250: "2.5rem",
  r300: "3rem",
  r500: "5rem",
} as const;

export const audienceContentLayout = {
  authHeroTop: "1.75rem",
  authDividerTop: "1.3rem",
  authPasswordRevealTop: "-0.85rem",
  authFormIntroTop: "-0.3rem",
  authTrustPhoneTop: "1.15rem",
  publicActionInline: "0.95rem",
  publicHeroTitleTop: "1.35rem",
  publicNetworkTagBlock: "0.62rem",
  publicStepsWideGap: "6rem",
  publicFinalTop: "4rem",

  authColumnsGap: "clamp(1.25rem, 4vw, 3.5rem)",
  authIntroInset: "clamp(2rem, 5vw, 3.5rem)",
  authCardInset: "clamp(1.4rem, 4vw, 2.4rem)",
  authRegisterInset: "clamp(1.3rem, 3vw, 2rem)",
  authOverlayCardInset: "clamp(2rem, 5vw, 4rem)",
  publicChromeGap: "clamp(1rem, 3vw, 3rem)",
  publicChromeInset: "0.8rem clamp(1rem, 4vw, 2.5rem)",
  publicHeroInset: "clamp(2rem, 6vw, 5.5rem)",
  publicHeroTabletInset: "clamp(2rem, 6vw, 4rem)",
  publicHeroPhoneInset: "2rem 1.3rem",
  publicSectionInset: "clamp(4rem, 7vw, 7rem)",
  publicStepsInset: "clamp(2rem, 5vw, 4rem)",
  publicFinalInset: "clamp(2rem, 5vw, 3.5rem)",
  publicHealthInset: "clamp(2rem, 6vw, 5rem) 1rem 5rem",
  publicHealthCardInset: "clamp(1.5rem, 4vw, 2.5rem)",
  publicValueInset: "1.7rem",
  sharingDialogInset: "clamp(0.9rem, 2.8vw, 1.6rem)",
  sharingListInset: "clamp(1rem, 2.5vw, 1.5rem)",
  sharingResultInset: "0.55rem 0.7rem",
  sharingRowInset: "0.55rem 0.65rem",
  sharingRowGap: "0.6rem"
} as const;
// Content measures and decorative badges are design choices; control minimum
// sizes, responsive thresholds and the illustration's coordinates remain local.
export const audienceContentWidths = {
  authCopy: "33rem", authChrome: "min(100%, 78rem)",
  publicPage: "80rem", publicHeroCopy: "35rem", publicSectionHeading: "42rem",
  publicHealth: "52rem", publicNotFound: "45rem", sharingDialog: "45rem"
} as const;
export const audienceIconSizes = {
  authMark: "42px", publicMark: "44px", authTrust: "42px",
  broadcastDot: "0.65rem",
  authFeature: "32px", authCard: "52px", authQuestion: "32px",
  authRecovery: "30px", authSuccess: "70px",
  publicValue: "52px", publicStep: "40px", publicHealth: "64px",
  publicNotFound: "88px", eyebrowRuleWidth: "21px",
  eyebrowRuleHeight: "2px", presenceDot: "0.42rem"
} as const;
export const audienceContentOptics = {
  authUnderlineOffset: "3px", publicUnderlineOffset: "4px",
  networkGridStep: "39px", authDividerThickness: "1px",
  networkPathThickness: "2px"
} as const;
export const audienceContentRadii = { networkTag: "0.8rem", mobilePanel: "1.4rem" } as const;
export const audienceContentMotion = { hover: "0.16s", lift: "0.18s" } as const;

// Guest content type preserves the existing Persian reading hierarchy, including
// optical weights between the usual 700/800/900 primitives.
// Guest decorative and sharing surface treatments. Exact values matter for the
// dark overrides; keep both theme entries in sync when adding a role.
export const audienceFinishes = {
  light: {
    broadcastEdge: "rgba(25, 53, 54, 0.09)",
    broadcastFill: "rgba(var(--v-theme-surface), 0.95)",
    broadcastBlur: "blur(10px)",
    profileFactCaptionOpacity: "0.72",
    publicDisabledOpacity: "0.6",
    publicFinalCopyOpacity: "0.82",
    publicGridOpacity: "0.28",
    authPhoneDecorOpacity: "0.4",
    authDecorOpacity: "0.78",
    authTrustBlur: "blur(10px)",
    authIntroEdge: "rgba(14, 102, 102, 0.12)",
    authIntroFill: "radial-gradient(circle at 9% 88%, rgba(233, 179, 90, 0.23), transparent 36%), linear-gradient(148deg, #e2f2ed 0%, #edf6f1 49%, #fff7e9 100%)",
    authKickerEdge: "rgba(14, 102, 102, 0.1)",
    authKickerInk: "#386d69",
    authKickerFill: "rgba(255, 255, 255, 0.62)",
    authTitleInk: "#193d3d",
    authTitleAccent: "#0e7772",
    authCopy: "#637c79",
    authTrustEdge: "rgba(26, 67, 68, 0.08)",
    authTrustFill: "rgba(255, 255, 255, 0.72)",
    authTrustIconInk: "#0e6666",
    authTrustIconFill: "#e5f3ef",
    authStrong: "#31595a",
    authFeatureCopy: "#7c9090",
    authDecorEdge: "rgba(14, 102, 102, 0.12)",
    authDecorAccent: "rgba(233, 179, 90, 0.34)",
    authCrossInk: "rgba(14, 102, 102, 0.5)",
    authCrossFill: "rgba(255, 255, 255, 0.44)",
    authSparkEdge: "#f4fbf8",
    authSparkFill: "#e9b35a",
    authSparkShadow: "0 3px 12px rgba(141, 99, 28, 0.18)",
    authSparkSecond: "#43a18a",
    authFeatureIndexInk: "#8a631e",
    authFeatureIndexFill: "rgba(233, 179, 90, 0.22)",
    authCardEdge: "rgba(34, 75, 75, 0.08)",
    authCardFill: "rgba(255, 255, 255, 0.96)",
    authFieldEdge: "rgba(14, 102, 102, 0.1)",
    authQuestionEdge: "rgba(14, 102, 102, 0.1)",
    authLinkUnderline: "rgba(14, 119, 114, 0.28)",
    authRecoveryIndexEdge: "rgba(14, 102, 102, 0.12)",
    authRecoveryIndexInk: "#6e8583",
    authRecoveryIndexFill: "rgba(255, 255, 255, 0.6)",
    authRecoveryCurrent: "#0e6666",
    authRecoveryCurrentInk: "#fff",
    authRecoveryCurrentFill: "#0e7772",
    authRecoveryEdge: "rgba(26, 67, 68, 0.08)",
    authSuccessEdge: "rgba(53, 161, 118, 0.16)",
    authLayoutEdge: "rgba(14, 102, 102, 0.16)",
    authLayoutFill: "#fff",
    authOverlayKickerEdge: "rgba(255, 255, 255, 0.25)",
    authOverlayKickerInk: "#fff",
    authOverlayKickerFill: "rgba(255, 255, 255, 0.13)",
    authOverlayTitleInk: "#fff",
    authOverlayTitleAccent: "#f4d796",
    authOverlayCopy: "#d9eeea",
    authOverlayTrustEdge: "rgba(255, 255, 255, 0.2)",
    authOverlayTrustFill: "rgba(255, 255, 255, 0.1)",
    authOverlayStrong: "#fff",
    authOverlaySupporting: "#d4e9e4",
    authOverlayIndexInk: "#ffdfa1",
    authOverlayIndexFill: "rgba(255, 255, 255, 0.12)",
    authOverlayStep: "#c8e0dc",
    authOverlayStepCurrent: "#fff",
    authOverlayStepEdge: "rgba(255, 255, 255, 0.3)",
    authOverlayStepFill: "rgba(255, 255, 255, 0.13)",
    authOverlayStepActiveInk: "#143f3f",
    authOverlayStepActiveFill: "#f4d796",
    publicNetworkFill: "radial-gradient(circle at 48% 47%, #245f59 0%, #174547 42%, #0d3035 90%)",
    publicNetworkGrid: "linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px)",
    publicNetworkMask: "radial-gradient(circle, #000 20%, transparent 85%)",
    publicNetworkOrbit: "rgba(211, 239, 226, 0.24)",
    publicNetworkOrbitInner: "rgba(211, 239, 226, 0.35)",
    publicNetworkCoreEdge: "rgba(227, 247, 237, 0.15)",
    publicNetworkCoreInk: "#fff",
    publicNetworkCoreFill: "#0d7770",
    publicNetworkCoreShadow: "0 16px 42px rgba(4, 30, 30, 0.35)",
    publicNetworkNodeEdge: "#275e5b",
    publicNetworkNodeInk: "#154443",
    publicNetworkNodeFill: "#e8f5eb",
    publicNetworkNodeShadow: "0 12px 30px rgba(4, 30, 30, 0.28)",
    publicNetworkNodeAccent: "#f7deb0",
    publicNetworkPath: "linear-gradient(90deg, rgba(171,227,208,.8), rgba(171,227,208,.1))",
    publicNetworkTagEdge: "rgba(255,255,255,.24)",
    publicNetworkTagInk: "#fff",
    publicNetworkTagFill: "rgba(15, 59, 58, 0.93)",
    publicNetworkTagShadow: "0 10px 26px rgba(4,30,30,.2)",
    publicValueNumber: "var(--bb-color-muted)",
    shareResultsEdge: "rgba(var(--v-theme-on-surface), 0.12)",
    shareResultsFill: "rgb(var(--v-theme-surface))",
    shareResultDivider: "rgba(var(--v-theme-on-surface), 0.08)",
    shareResultSelected: "rgba(var(--v-theme-success), 0.07)",
    shareChipEdge: "rgba(var(--v-theme-on-surface), 0.18)",
    shareChipFill: "rgba(var(--v-theme-on-surface), 0.03)",
    shareChipHoverEdge: "rgba(var(--v-theme-on-surface), 0.34)",
    shareListRowEdge: "rgba(var(--v-theme-on-surface), 0.08)",
    shareListRule: "rgba(var(--v-theme-on-surface), 0.1)",
    shareListDeviceRule: "rgba(var(--v-theme-on-surface), 0.08)",
    shareListRowFill: "transparent",
    shareSelectedEdge: "var(--bb-color-success)",
  },
  dark: {
    broadcastEdge: "rgba(25, 53, 54, 0.09)",
    broadcastFill: "rgba(var(--v-theme-surface), 0.95)",
    broadcastBlur: "blur(10px)",
    profileFactCaptionOpacity: "0.72",
    publicDisabledOpacity: "0.6",
    publicFinalCopyOpacity: "0.82",
    publicGridOpacity: "0.28",
    authPhoneDecorOpacity: "0.4",
    authDecorOpacity: "0.78",
    authTrustBlur: "blur(10px)",
    authIntroEdge: "rgba(164, 211, 199, 0.16)",
    authIntroFill: "radial-gradient(circle at 9% 88%, rgba(233, 179, 90, 0.1), transparent 36%), linear-gradient(148deg, #1d3534 0%, #203132 49%, #302b21 100%)",
    authKickerEdge: "rgba(164, 211, 199, 0.16)",
    authKickerInk: "#b5d9d1",
    authKickerFill: "rgba(var(--v-theme-surface), 0.72)",
    authTitleInk: "#e3efeb",
    authTitleAccent: "#8bd2c8",
    authCopy: "#aec1bc",
    authTrustEdge: "rgba(190, 221, 213, 0.12)",
    authTrustFill: "rgba(var(--v-theme-surface), 0.78)",
    authTrustIconInk: "#8bd2c8",
    authTrustIconFill: "linear-gradient(145deg, #24413e, var(--bb-color-surface))",
    authStrong: "#d5e5df",
    authFeatureCopy: "#aec1bc",
    authDecorEdge: "rgba(139, 210, 200, 0.16)",
    authDecorAccent: "rgba(233, 179, 90, 0.25)",
    authCrossInk: "rgba(139, 210, 200, 0.56)",
    authCrossFill: "rgba(var(--v-theme-surface), 0.5)",
    authSparkEdge: "#1d3534",
    authSparkFill: "#e9b35a",
    authSparkShadow: "0 3px 12px rgba(141, 99, 28, 0.18)",
    authSparkSecond: "#43a18a",
    authFeatureIndexInk: "#f0cb83",
    authFeatureIndexFill: "rgba(233, 179, 90, 0.13)",
    authCardEdge: "var(--bb-color-outline)",
    authCardFill: "rgba(var(--v-theme-surface), 0.98)",
    authFieldEdge: "rgba(139, 210, 200, 0.16)",
    authQuestionEdge: "rgba(139, 210, 200, 0.17)",
    authLinkUnderline: "rgba(14, 119, 114, 0.28)",
    authRecoveryIndexEdge: "rgba(139, 210, 200, 0.16)",
    authRecoveryIndexInk: "#a9bfba",
    authRecoveryIndexFill: "rgba(var(--v-theme-surface), 0.78)",
    authRecoveryCurrent: "#8bd2c8",
    authRecoveryCurrentInk: "#fff",
    authRecoveryCurrentFill: "#0e7772",
    authRecoveryEdge: "var(--bb-color-outline)",
    authSuccessEdge: "rgba(107, 190, 147, 0.2)",
    authLayoutEdge: "var(--bb-color-outline)",
    authLayoutFill: "var(--bb-color-surface)",
    authOverlayKickerEdge: "rgba(255, 255, 255, 0.25)",
    authOverlayKickerInk: "#fff",
    authOverlayKickerFill: "rgba(255, 255, 255, 0.13)",
    authOverlayTitleInk: "#fff",
    authOverlayTitleAccent: "#f4d796",
    authOverlayCopy: "#d9eeea",
    authOverlayTrustEdge: "rgba(255, 255, 255, 0.2)",
    authOverlayTrustFill: "rgba(255, 255, 255, 0.1)",
    authOverlayStrong: "#fff",
    authOverlaySupporting: "#d4e9e4",
    authOverlayIndexInk: "#ffdfa1",
    authOverlayIndexFill: "rgba(255, 255, 255, 0.12)",
    authOverlayStep: "#c8e0dc",
    authOverlayStepCurrent: "#fff",
    authOverlayStepEdge: "rgba(255, 255, 255, 0.3)",
    authOverlayStepFill: "rgba(255, 255, 255, 0.13)",
    authOverlayStepActiveInk: "#143f3f",
    authOverlayStepActiveFill: "#f4d796",
    publicNetworkFill: "radial-gradient(circle at 48% 47%, #245f59 0%, #174547 42%, #0d3035 90%)",
    publicNetworkGrid: "linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px)",
    publicNetworkMask: "radial-gradient(circle, #000 20%, transparent 85%)",
    publicNetworkOrbit: "rgba(211, 239, 226, 0.24)",
    publicNetworkOrbitInner: "rgba(211, 239, 226, 0.35)",
    publicNetworkCoreEdge: "rgba(227, 247, 237, 0.15)",
    publicNetworkCoreInk: "#fff",
    publicNetworkCoreFill: "#0d7770",
    publicNetworkCoreShadow: "0 16px 42px rgba(4, 30, 30, 0.35)",
    publicNetworkNodeEdge: "#275e5b",
    publicNetworkNodeInk: "#154443",
    publicNetworkNodeFill: "#e8f5eb",
    publicNetworkNodeShadow: "0 12px 30px rgba(4, 30, 30, 0.28)",
    publicNetworkNodeAccent: "#f7deb0",
    publicNetworkPath: "linear-gradient(90deg, rgba(171,227,208,.8), rgba(171,227,208,.1))",
    publicNetworkTagEdge: "rgba(255,255,255,.24)",
    publicNetworkTagInk: "#fff",
    publicNetworkTagFill: "rgba(15, 59, 58, 0.93)",
    publicNetworkTagShadow: "0 10px 26px rgba(4,30,30,.2)",
    publicValueNumber: "#b0c5bc",
    shareResultsEdge: "var(--bb-color-outline)",
    shareResultsFill: "rgb(var(--v-theme-surface))",
    shareResultDivider: "var(--bb-color-outline)",
    shareResultSelected: "var(--bb-audience-shareSelected)",
    shareChipEdge: "var(--bb-color-outline)",
    shareChipFill: "var(--bb-color-inset)",
    shareChipHoverEdge: "rgba(var(--v-theme-on-surface), 0.34)",
    shareListRowEdge: "var(--bb-color-outline)",
    shareListRule: "rgba(var(--v-theme-on-surface), 0.1)",
    shareListDeviceRule: "var(--bb-color-outline)",
    shareListRowFill: "var(--bb-color-inset)",
    shareSelectedEdge: "var(--bb-color-success)",
  }
} as const;

// Rescue flow presentation roles: mission member identities, timeline/rating
// feedback and SOS urgency share meaning across light/dark surfaces. Keep
// status/API values and functional touch geometry in the owning components.
export const rescueColors = {
  light: {
    panelEdge: "rgba(28,112,95,.22)",
    livePanelEdge: "rgba(31,121,102,.25)",
    membersFill: "rgba(var(--v-theme-surface), .95)",
    avatarDefaultFill: "rgba(var(--v-theme-primary), .12)",
    avatarRequesterFill: "rgba(220,89,59,.13)",
    avatarRequesterInk: "#dc593b",
    avatarRescuerFill: "rgba(22,130,108,.13)",
    avatarRescuerInk: "#16826c",
    avatarAdminFill: "rgba(85,85,174,.13)",
    avatarAdminInk: "#5555ae",
    timelineRail: "rgba(28,112,95,.23)",
    timelineDot: "#1b9479",
    timelineTerminal: "#b35342",
    ratingStar: "#915800",
    ratingFocus: "#26977b",
    sosFabEdge: "rgba(255, 255, 255, 0.92)",
    sosFabFill: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)",
    sosFabInk: "#ffffff",
    sosFabShadow: "0 0.75rem 1.9rem rgba(185, 28, 28, 0.45)",
    sosFabHoverShadow: "0 1rem 2.2rem rgba(185, 28, 28, 0.58)",
    sosFabFocus: "#fecaca",
    sosFabRing: "rgba(220, 38, 38, 0.55)",
    sosBadgeInk: "#dc2626",
    sosBadgeFill: "rgba(220, 38, 38, 0.14)",
    sosSelectedFill: "rgba(220, 38, 38, 0.06)",
    sosReadinessEdge: "rgba(var(--v-theme-warning), .45)",
    sosReadinessFill: "rgba(var(--v-theme-warning), .1)",
    sosReadyEdge: "rgba(var(--v-theme-success), .4)",
    sosReadyFill: "rgba(var(--v-theme-success), .1)",
    sosSeverityEdge: "rgba(120, 140, 140, 0.28)",
    sosSelectedEdge: "rgba(120, 140, 140, 0.28)",
    sosMapEdge: "rgba(120, 140, 140, 0.25)",
    historyCanvas: "radial-gradient(ellipse at 80% 0%,rgba(44,132,113,.1),transparent 52%),rgb(var(--v-theme-background))",
    historyHero: "linear-gradient(120deg,#143d42,#226e6a)",
    historyHeroInk: "white",
    historyHeroEyebrow: "#ace7d6",
    historyHeroCopy: "#dcf3e9",
    historyRowEdge: "rgba(98,146,137,.25)",
    historyRowFocus: "#26977b",
    historyRowSelected: "#269b7c",
    historyRowSelectedHalo: "0 0 0 2px rgba(38,155,124,.22), var(--bb-shadow-item)",
    historyPanelEdge: "rgba(98,146,137,.23)",
    historyDivider: "rgba(98,146,137,.18)",
    historyPanelAccent: "linear-gradient(108deg,rgba(40,147,117,.12),transparent)",
    historyIconFill: "rgba(38,155,124,.12)",
    historyEvidenceFill: "rgba(98,146,137,.09)",
    historySelectEdge: "rgba(98,146,137,.4)",
    historyStars: "#ad6800",
  },
  dark: {
    panelEdge: "rgba(28,112,95,.22)",
    livePanelEdge: "rgba(31,121,102,.25)",
    membersFill: "rgba(var(--v-theme-surface), .95)",
    avatarDefaultFill: "rgba(var(--v-theme-primary), .12)",
    avatarRequesterFill: "rgba(220,89,59,.13)",
    avatarRequesterInk: "#dc593b",
    avatarRescuerFill: "rgba(22,130,108,.13)",
    avatarRescuerInk: "#16826c",
    avatarAdminFill: "rgba(85,85,174,.13)",
    avatarAdminInk: "#5555ae",
    timelineRail: "var(--bb-color-outline)",
    timelineDot: "var(--bb-color-primary)",
    timelineTerminal: "var(--bb-color-error)",
    ratingStar: "var(--bb-color-secondary)",
    ratingFocus: "#26977b",
    sosFabEdge: "rgba(255, 255, 255, 0.92)",
    sosFabFill: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)",
    sosFabInk: "#ffffff",
    sosFabShadow: "0 0.75rem 1.9rem rgba(185, 28, 28, 0.45)",
    sosFabHoverShadow: "0 1rem 2.2rem rgba(185, 28, 28, 0.58)",
    sosFabFocus: "#fecaca",
    sosFabRing: "rgba(220, 38, 38, 0.55)",
    sosBadgeInk: "var(--bb-color-error)",
    sosBadgeFill: "#422b2b",
    sosSelectedFill: "#422b2b",
    sosReadinessEdge: "rgba(var(--v-theme-warning), .45)",
    sosReadinessFill: "rgba(var(--v-theme-warning), .1)",
    sosReadyEdge: "rgba(var(--v-theme-success), .4)",
    sosReadyFill: "rgba(var(--v-theme-success), .1)",
    sosSeverityEdge: "var(--bb-color-outline)",
    sosSelectedEdge: "var(--bb-color-error)",
    sosMapEdge: "var(--bb-color-outline)",
    historyCanvas: "radial-gradient(ellipse at 80% 0%,rgba(44,132,113,.1),transparent 52%),rgb(var(--v-theme-background))",
    historyHero: "linear-gradient(120deg,#143d42,#226e6a)",
    historyHeroInk: "white",
    historyHeroEyebrow: "#ace7d6",
    historyHeroCopy: "#dcf3e9",
    historyRowEdge: "var(--bb-color-outline)",
    historyRowFocus: "#26977b",
    historyRowSelected: "var(--bb-color-primary)",
    historyRowSelectedHalo: "0 0 0 2px var(--bb-color-primary), var(--bb-shadow-item)",
    historyPanelEdge: "rgba(98,146,137,.23)",
    historyDivider: "rgba(98,146,137,.18)",
    historyPanelAccent: "linear-gradient(108deg,rgba(40,147,117,.12),transparent)",
    historyIconFill: "rgba(38,155,124,.12)",
    historyEvidenceFill: "rgba(98,146,137,.09)",
    historySelectEdge: "rgba(98,146,137,.4)",
    historyStars: "var(--bb-color-secondary)",
  }
} as const;

// Legible rescue-flow type roles. Responsive history titles are separate because
// the two page headings have different optical caps; stage/touch geometry stays
// local to each component. Numeric values preserve the pre-migration rendering.
export const rescueType = {
  sizes: {
    tiny: "0.8rem", caption: "0.82rem", supporting: "0.85rem",
    body: "0.9rem", regular: "1rem", sosTitle: "1.1rem",
    section: "1.15rem", requesterHero: "clamp(1.55rem,2.5vw,2.2rem)",
    rescuerHero: "clamp(1.55rem,2.5vw,2.15rem)",
    caseTitle: "clamp(1.15rem,2vw,1.45rem)",
    savedStars: "1.65rem", choiceStars: "2rem"
  },
  weights: { medium: 700, emphasized: 750, strong: 800, display: 850 },
  leading: { heroTitle: 1.25, caption: 1.35, notice: 1.55, timeline: 1.7, description: 1.8, heroCopy: 1.9 },
  tracking: { historyStars: "2px", ratingStars: "3px" }
} as const;

export const audienceContentType = {
  sizes: {
    tiny: "0.8rem", caption: "0.82rem", supporting: "0.84rem",
    assurance: "0.86rem", action: "0.88rem", body: "0.9rem",
    lead: "0.94rem", button: "0.95rem", valueHeading: "1.04rem",
    formHeading: "1.2rem", hero: "clamp(2rem, 3vw, 2.85rem)",
    heroTablet: "clamp(1.9rem, 3.8vw, 2.5rem)",
    heroPhone: "clamp(1.75rem, 5vw, 1.95rem)",
    publicHeroPhone: "clamp(1.9rem, 6.5vw, 2.15rem)",
    section: "clamp(1.55rem, 2.15vw, 2.1rem)",
    notFound: "clamp(1.7rem, 2.3vw, 2.25rem)",
    fluidLead: "clamp(0.94rem, 1vw, 1rem)"
  },
  weights: { emphasized: 750, strong: 850, black: 900 },
  leading: {
    tight: 1.2, row: 1.4, display: 1.45, meta: 1.5, status: 1.85, broadcastDetail: 1.55,
    caption: 1.6, supporting: 1.7, detail: 1.8, prose: 1.9, hero: 2
  }
} as const;

export const sharingTypography = {
  facts: "0.83rem",
  caption: "0.82rem", label: "0.88rem", body: "0.9rem",
  supporting: "0.84rem", heading: "1.1rem",
  lead: "0.9rem", avatar: "0.85rem"
} as const;

// A restrained density adjustment for the approved editor dialogs at all widths.
// Deliberately does not shrink input text (mobile keyboard zoom) or 44px targets.
export const formDialogDensity = {
  title: "1.18rem",
  sectionTitle: ".96rem",
  buttonFont: ".86rem",
  buttonInline: ".7rem"
} as const;

// Phone-specific insets and type for the same forms. These are used only inside
// their phone media queries; tablet/desktop use the base density above.
export const formPhoneLayout = {
  title: "1.02rem",
  sectionTitle: ".94rem",
  buttonFont: ".84rem",
  buttonInline: ".6rem",
  icon: "36px",
  headerBlock: ".5rem",
  inline: ".75rem",
  bodyBlock: ".7rem",
  actionBlock: ".45rem",
  sectionGap: ".75rem",
  compactHeaderBlock: ".3rem",
  compactInline: ".65rem",
  compactBodyBlock: ".5rem",
  compactSectionInset: ".55rem",
  compactActionBlock: ".35rem",
  compactIcon: "32px"
} as const;

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
    ...Object.entries(audienceRadii).map(([key, value]) => `--bb-audience-radius-${key}: ${value}px`),
    ...Object.entries(audienceTypography).map(([key, value]) => `--bb-audience-font-${key}: ${value}`),
    ...Object.entries(audienceRhythm).map(([key, value]) => `--bb-rhythm-${key}: ${value}`),
    ...Object.entries(audienceContentLayout).map(([key, value]) => `--bb-content-layout-${key}: ${value}`),
    ...Object.entries(audienceContentWidths).map(([key, value]) => `--bb-content-width-${key}: ${value}`),
    ...Object.entries(audienceIconSizes).map(([key, value]) => `--bb-content-icon-${key}: ${value}`),
    ...Object.entries(audienceContentOptics).map(([key, value]) => `--bb-content-optics-${key}: ${value}`),
    ...Object.entries(audienceContentRadii).map(([key, value]) => `--bb-content-radius-${key}: ${value}`),
    ...Object.entries(audienceContentMotion).map(([key, value]) => `--bb-content-motion-${key}: ${value}`),
    ...Object.entries(audienceDetailRadii).map(([key, value]) => `--bb-detail-radius-${key}: ${value}px`),
    ...Object.entries(audienceContentType.sizes).map(([key, value]) => `--bb-content-font-${key}: ${value}`),
    ...Object.entries(audienceContentType.weights).map(([key, value]) => `--bb-content-weight-${key}: ${value}`),
    ...Object.entries(audienceContentType.leading).map(([key, value]) => `--bb-content-leading-${key}: ${value}`),
    ...Object.entries(rescueType.sizes).map(([key, value]) => `--bb-rescue-font-${key}: ${value}`),
    ...Object.entries(rescueType.weights).map(([key, value]) => `--bb-rescue-weight-${key}: ${value}`),
    ...Object.entries(rescueType.leading).map(([key, value]) => `--bb-rescue-leading-${key}: ${value}`),
    ...Object.entries(rescueType.tracking).map(([key, value]) => `--bb-rescue-tracking-${key}: ${value}`),
    ...Object.entries(sharingTypography).map(([key, value]) => `--bb-sharing-font-${key}: ${value}`),
    ...Object.entries(formDialogDensity).map(([key, value]) => `--bb-form-dialog-${key}: ${value}`),
    ...Object.entries(formPhoneLayout).map(([key, value]) => `--bb-form-phone-${key}: ${value}`),
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
    ...Object.entries(audienceColors[theme]).map(([key, value]) => `--bb-audience-${key}: ${value}`),
    ...Object.entries(rescueColors[theme]).map(([key, value]) => `--bb-rescue-${key}: ${value}`),
    ...Object.entries(audienceFinishes[theme]).map(([key, value]) => `--bb-finish-${key}: ${value}`),
    ...Object.entries(audienceDetails[theme]).map(([key, value]) => `--bb-detail-${key}: ${value}`),
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
