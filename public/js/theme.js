/** Applies the saved theme before the first paint. Loaded as a classic script to satisfy the CSP. */
(function () {
  var root = document.documentElement;
  var choice = 'system';
  try { choice = localStorage.getItem('bb-theme') || 'system'; } catch (_) { choice = 'system'; }
  if (choice !== 'light' && choice !== 'dark' && choice !== 'system') choice = 'system';
  var systemDark = false;
  try { systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (_) { systemDark = false; }
  root.setAttribute('data-theme', choice === 'system' ? (systemDark ? 'dark' : 'light') : choice);
  root.setAttribute('data-theme-choice', choice);
})();
