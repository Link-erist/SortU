// Runs before the page paints so a light-theme choice does not flash dark first.
try { if (localStorage.getItem('theme') === 'light') document.documentElement.dataset.theme = 'light'; } catch {}
