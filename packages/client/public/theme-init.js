(() => {
  const storageKey = "borobiya:theme";
  let preference = "system";
  let systemPrefersDark = false;

  try {
    const savedPreference = window.localStorage.getItem(storageKey);
    if (savedPreference === "light" || savedPreference === "dark" || savedPreference === "system") {
      preference = savedPreference;
    }
  } catch {
    // Continue with the system preference when local storage is unavailable.
  }

  try {
    systemPrefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  } catch {
    // Browsers without matchMedia default to the light palette until the app is mounted.
  }

  const isDark = preference === "dark" || (preference === "system" && systemPrefersDark);
  const theme = isDark ? "dark" : "light";
  const root = document.documentElement;
  root.classList.toggle("dark", isDark);
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  root.style.backgroundColor = isDark ? "#111c1d" : "#f4f7f6";
  root.style.color = isDark ? "#edf5f2" : "#193536";

  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.content = isDark ? "#111c1d" : "#f4f7f6";
})();
