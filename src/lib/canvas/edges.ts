export type FlowEdge = {
	id: number;
	fromPageId: number;
	toPageId: number;
};

export function createFlowEdge(id: number, fromPageId: number, toPageId: number): FlowEdge {
	return {
		id,
		fromPageId,
		toPageId
	};
}

export function hasFlowEdge(edges: FlowEdge[], fromPageId: number, toPageId: number): boolean {
	return edges.some((edge) => edge.fromPageId === fromPageId && edge.toPageId === toPageId);
}
