import { describe, expect, test } from 'vitest';
import {
	createItem,
	moveItem,
	removeItemsById,
	setItemDescription,
	setItemType
} from './items';
import { DEFAULT_ITEM_TYPE } from './item-types';

describe('canvas items', () => {
	test('creates an item at the requested world position', () => {
		expect(createItem(3, { x: 120, y: -40 })).toEqual({
			id: 3,
			x: 120,
			y: -40,
			title: 'Item 3',
			type: DEFAULT_ITEM_TYPE,
			description: ''
		});
	});

	test('moves an item without changing its content', () => {
		const item = {
			id: 3,
			x: 120,
			y: -40,
			title: 'Checkout',
			type: 'page' as const,
			description: 'Checkout flow'
		};

		expect(moveItem(item, { x: 200, y: 80 })).toEqual({
			id: 3,
			x: 200,
			y: 80,
			title: 'Checkout',
			type: 'page',
			description: 'Checkout flow'
		});
	});

	test('removes items with matching ids', () => {
		const items = [
			{ id: 1, x: 0, y: 0, title: 'Home', type: 'page' as const, description: '' },
			{ id: 2, x: 100, y: 0, title: 'Search', type: 'list' as const, description: '' },
			{ id: 3, x: 200, y: 0, title: 'Checkout', type: 'form' as const, description: '' }
		];

		expect(removeItemsById(items, [1, 3])).toEqual([
			{ id: 2, x: 100, y: 0, title: 'Search', type: 'list', description: '' }
		]);
	});

	test('updates an item description', () => {
		const item = createItem(3, { x: 120, y: -40 });

		expect(setItemDescription(item, 'Describe this item')).toEqual({
			...item,
			description: 'Describe this item'
		});
	});

	test('updates an item type', () => {
		const item = createItem(3, { x: 120, y: -40 });

		expect(setItemType(item, 'database')).toEqual({
			...item,
			type: 'database'
		});
	});
});
