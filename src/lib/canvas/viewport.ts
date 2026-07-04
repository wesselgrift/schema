export type Point = {
	x: number;
	y: number;
};

export type Viewport = Point & {
	scale: number;
};

export function screenToWorld(point: Point, viewport: Viewport): Point {
	return {
		x: (point.x - viewport.x) / viewport.scale,
		y: (point.y - viewport.y) / viewport.scale
	};
}

export function worldToScreen(point: Point, viewport: Viewport): Point {
	return {
		x: point.x * viewport.scale + viewport.x,
		y: point.y * viewport.scale + viewport.y
	};
}

export function clampScale(scale: number, min = 0.15, max = 4): number {
	return Math.min(max, Math.max(min, scale));
}

export function zoomAtPoint(viewport: Viewport, screenPoint: Point, nextScale: number): Viewport {
	const scale = clampScale(nextScale);
	const worldPoint = screenToWorld(screenPoint, viewport);

	return {
		x: screenPoint.x - worldPoint.x * scale,
		y: screenPoint.y - worldPoint.y * scale,
		scale
	};
}
