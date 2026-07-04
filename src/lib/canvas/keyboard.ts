export function isTextEntryTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;

	return Boolean(target.closest('textarea, input, select, [contenteditable]'));
}
