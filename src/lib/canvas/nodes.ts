import type { Point } from './viewport';

export type TextNode = Point & {
	id: number;
	text: string;
};

export function createTextNode(id: number, point: Point): TextNode {
	return {
		id,
		x: point.x,
		y: point.y,
		text: ''
	};
}

export function moveTextNode(node: TextNode, point: Point): TextNode {
	return {
		...node,
		x: point.x,
		y: point.y
	};
}
