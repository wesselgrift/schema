// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { isTextEntryTarget } from './keyboard';

describe('canvas keyboard shortcuts', () => {
	test('blocks shortcuts from text entry targets', () => {
		const input = document.createElement('input');
		const textarea = document.createElement('textarea');

		expect(isTextEntryTarget(input)).toBe(true);
		expect(isTextEntryTarget(textarea)).toBe(true);
	});

	test('allows shortcuts from buttons and tabs', () => {
		const button = document.createElement('button');
		button.setAttribute('role', 'tab');

		expect(isTextEntryTarget(button)).toBe(false);
	});
});
