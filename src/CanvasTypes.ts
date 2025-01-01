/**
 * Represents a single node in the .canvas file (e.g., type = "link", "text", etc.)
 */
export interface CanvasNode {
	id: string;
	type: string;
	url?: string;
	x: number;
	y: number;
	width: number;
	height: number;
	[key: string]: unknown; // e.g. "lastUrl" or other custom props
}

/**
 * Represents the .canvas file structure
 */
export interface CanvasData {
	nodes: CanvasNode[];
	edges: unknown[];
} 