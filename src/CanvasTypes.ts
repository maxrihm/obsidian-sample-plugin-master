// src/CanvasTypes.ts

/**
 * Represents a single node in the .canvas file (e.g., "link", "text", etc.)
 */
export interface CanvasNode {
	id: string;
	type: string;
	url?: string;          // We'll store the "current webview src" here
	x: number;
	y: number;
	width: number;
	height: number;
	[key: string]: unknown; // for any additional keys
}

/**
 * Represents the .canvas JSON data
 */
export interface CanvasData {
	nodes: CanvasNode[];
	edges: unknown[];
}
