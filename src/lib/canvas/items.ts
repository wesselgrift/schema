import { DEFAULT_ITEM_TYPE, type ItemType } from './item-types';
import type { Point } from './viewport';

export type Item = Point & {
	id: number;
	title: string;
	type: ItemType;
	description: string;
};

export function createItem(id: number, point: Point): Item {
	return {
		id,
		x: point.x,
		y: point.y,
		title: `Item ${id}`,
		type: DEFAULT_ITEM_TYPE,
		description: ''
	};
}

export function moveItem(item: Item, point: Point): Item {
	return {
		...item,
		x: point.x,
		y: point.y
	};
}

export function removeItemsById(items: Item[], itemIds: number[]): Item[] {
	const idsToRemove = new Set(itemIds);
	return items.filter((item) => !idsToRemove.has(item.id));
}

export function setItemDescription(item: Item, description: string): Item {
	return {
		...item,
		description
	};
}

export function setItemType(item: Item, type: ItemType): Item {
	return {
		...item,
		type
	};
}
