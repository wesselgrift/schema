if (typeof document !== 'undefined') {
	document.documentElement.classList.remove('dark');
	document.documentElement.style.colorScheme = 'light';
	localStorage.setItem('mode-watcher-mode', 'light');
}
