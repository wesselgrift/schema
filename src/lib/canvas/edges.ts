export type FlowEdge = {
	id: number;
	fromNodeId: number;
	toNodeId: number;
};

export function createFlowEdge(id: number, fromNodeId: number, toNodeId: number): FlowEdge {
	return {
		id,
		fromNodeId,
		toNodeId
	};
}

export function hasFlowEdge(edges: FlowEdge[], fromNodeId: number, toNodeId: number): boolean {
	return edges.some((edge) => edge.fromNodeId === fromNodeId && edge.toNodeId === toNodeId);
}
