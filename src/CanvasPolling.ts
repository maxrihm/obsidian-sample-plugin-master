import { App, Notice, TFile } from 'obsidian';
import { parseTransformToXY } from './transformParser';
import { CanvasData } from './CanvasTypes';

/**
 * Polls every X ms, finds all <webview> in .canvas-node elements,
 * and updates "lastUrl" in the .canvas JSON if changed.
 */
export class CanvasPolling {
	private app: App;
	private intervalId: number | null = null;
	private pollIntervalMs: number;

	constructor(app: App, pollIntervalMs = 5000) {
		this.app = app;
		this.pollIntervalMs = pollIntervalMs;
	}

	/**
	 * Start the repeated job (once every `pollIntervalMs`).
	 */
	public start() {
		if (this.intervalId) return; // already started

		this.intervalId = window.setInterval(() => {
			this.doPollingWork().catch((err) => {
				console.error('CanvasPolling error:', err);
			});
		}, this.pollIntervalMs);
	}

	/**
	 * Stop the repeated job.
	 */
	public stop() {
		if (this.intervalId) {
			window.clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	/**
	 * The actual logic that runs each time we poll:
	 *  1) Check if activeFile is .canvas
	 *  2) Read JSON
	 *  3) For each .canvas-node <webview> in DOM, match & update lastUrl
	 *  4) Save if changed
	 */
	private async doPollingWork() {
		console.log('Polling for link nodes...');

		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== 'canvas') {
			console.log('No active .canvas file. Skipping...');
			return;
		}

		const canvasData = await this.readCanvasData(activeFile);
		if (!canvasData) return;

		const allCanvasNodes = Array.from(document.querySelectorAll('.canvas-node'));
		if (!allCanvasNodes.length) {
			console.log('No .canvas-node elements in DOM right now.');
			return;
		}

		let changed = false;
		for (const canvasNodeEl of allCanvasNodes) {
			const style = window.getComputedStyle(canvasNodeEl as HTMLElement);
			const { x: domX, y: domY } = parseTransformToXY(style.transform);
			const nodeWidth = parseFloat(style.width) || 0;
			const nodeHeight = parseFloat(style.height) || 0;

			console.log(`DOM node at x=${domX}, y=${domY}, w=${nodeWidth}, h=${nodeHeight}`);

			const webview = canvasNodeEl.querySelector('webview') as Element | null;
			if (!webview) {
				console.log('--> No <webview> found. Skipping...');
				continue;
			}

			// Find a {type:'link'} node with matching coords
			const foundNode = canvasData.nodes.find((n) => {
				return (
					n.type === 'link' &&
					Math.abs(n.x - domX) < 0.5 &&
					Math.abs(n.y - domY) < 0.5 &&
					Math.abs(n.width - nodeWidth) < 0.5 &&
					Math.abs(n.height - nodeHeight) < 0.5
				);
			});

			if (!foundNode) {
				console.log('--> No matching link node in JSON. Skipping...');
				continue;
			}

			console.log('--> Found matching node:', foundNode);

			const currentSrc = (webview as any).src || '';
			console.log('--> webview.src is:', currentSrc);

			if (foundNode.lastUrl !== currentSrc) {
				foundNode.lastUrl = currentSrc;
				changed = true;
				console.log('--> Updated lastUrl to:', currentSrc);
			} else {
				console.log('--> lastUrl is already:', foundNode.lastUrl);
			}
		}

		if (changed) {
			await this.saveCanvasData(activeFile, canvasData);
		}
	}

	/**
	 * Read the .canvas JSON from disk
	 */
	private async readCanvasData(file: TFile): Promise<CanvasData | null> {
		try {
			const jsonRaw = await this.app.vault.read(file);
			return JSON.parse(jsonRaw) as CanvasData;
		} catch (err) {
			console.error('Error reading .canvas file:', err);
			return null;
		}
	}

	/**
	 * Write the .canvas JSON back to disk
	 */
	private async saveCanvasData(file: TFile, data: CanvasData) {
		try {
			await this.app.vault.modify(file, JSON.stringify(data, null, 2));
			console.log('Saved updated .canvas JSON with new lastUrl');
		} catch (err) {
			console.error('Failed to modify .canvas file:', err);
		}
	}
} 