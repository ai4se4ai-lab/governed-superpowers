// Applied before paint so a manually chosen theme never flashes the other one.
// Loaded as a static file (not inlined) to keep the document free of
// injected markup. Kept in sync with ThemeToggle in src/components/ui/.
(function () {
  try {
    var t = localStorage.getItem("gsp-theme");
    if (t === "dark" || t === "light") {
      document.documentElement.classList.add(t);
    }
  } catch (e) {
    /* private mode / storage disabled - fall back to prefers-color-scheme */
  }
})();
