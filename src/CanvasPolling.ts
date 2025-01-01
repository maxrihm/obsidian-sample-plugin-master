// src/CanvasPolling.ts

import { App, TFile } from 'obsidian';
import { parseTransformToXY } from './transformParser';
import { CanvasData, CanvasNode } from './CanvasTypes';

/**
 * Polls every X ms:
 *  1) On first detection of each link node, if node.lastUrl is present, set webview.src = node.lastUrl (one-time init).
 *  2) Then always read webview.src back into node.lastUrl.
 *  3) Logs everything in the console, including when multiple tabs have the same node.
 */
export class CanvasPolling {
	private app: App;
	private intervalId: number | null = null;
	private pollIntervalMs: number;

	/**
	 * For one-time init, track which node IDs we have set.
	 */
	private hasInitialized: Set<string> = new Set();

	constructor(app: App, pollIntervalMs = 5000) {
		this.app = app;
		this.pollIntervalMs = pollIntervalMs;
	}

	public start() {
		if (this.intervalId) {
			console.debug('[CanvasPolling] Already started, skipping...');
			return;
		}

		this.intervalId = window.setInterval(async () => {
			try {
				await this.doPollingWork();
			} catch (err) {
				console.error('[CanvasPolling] Error in doPollingWork:', err);
			}
		}, this.pollIntervalMs);

		console.debug(`[CanvasPolling] Started polling every ${this.pollIntervalMs} ms.`);
	}

	public stop() {
		if (this.intervalId) {
			window.clearInterval(this.intervalId);
			this.intervalId = null;
			console.debug('[CanvasPolling] Stopped polling.');
		}
	}

	private async doPollingWork() {
		console.debug('[CanvasPolling] Polling for link nodes...');

		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== 'canvas') {
			console.debug('[CanvasPolling] No active .canvas file. Skipping...');
			return;
		}

		const canvasData = await this.readCanvasData(activeFile);
		if (!canvasData) {
			console.debug('[CanvasPolling] Failed to read canvasData. Skipping...');
			return;
		}

		let changed = false;

		// Filter the JSON for link nodes
		const linkNodes = canvasData.nodes.filter(n => n.type === 'link');
		console.debug(`[CanvasPolling] Found ${linkNodes.length} link nodes in JSON.`);

		for (const node of linkNodes) {
			console.debug(`\n[CanvasPolling] Checking node id=${node.id}, lastUrl=${node.lastUrl || 'undefined'}`);

			// Get all matching DOM elements
			const matchingEls = this.findAllCanvasNodesInDom(node);
			if (!matchingEls.length) {
				console.debug(`[CanvasPolling]  -> No matching DOM element for node (id=${node.id}). Possibly off-screen? Skipping...`);
				continue;
			}

			console.debug(`[CanvasPolling]  -> Found ${matchingEls.length} .canvas-node DOM matches for node (id=${node.id}).`);

			// For each matching DOM .canvas-node
			for (const domElement of matchingEls) {
				// Get the <webview>
				const webview = domElement.querySelector('webview') as HTMLWebViewElement | null;
				if (!webview) {
					console.debug(`[CanvasPolling]    -> DOM element has no <webview>. Skipping...`);
					continue;
				}

				const currentSrc = webview.src || '';
				const coordsStr = `(${node.x}, ${node.y}, w=${node.width}, h=${node.height})`;

				console.debug(`[CanvasPolling]    -> Found <webview> for node id=${node.id} at coords=${coordsStr}, webview.src="${currentSrc}"`);

				// 1) One-time init: if not in hasInitialized, but node.lastUrl exists, set webview.src
				if (!this.hasInitialized.has(node.id)) {
					this.hasInitialized.add(node.id);

					if (node.lastUrl && node.lastUrl.trim() !== '') {
						console.debug(`[CanvasPolling]    -> (INIT) Setting webview.src = node.lastUrl="${node.lastUrl}"`);
						webview.src = node.lastUrl;
					} else {
						console.debug(`[CanvasPolling]    -> (INIT) node has no lastUrl. Doing nothing for src.`);
					}
				}

				// 2) Always read webview.src back into node.lastUrl
				const updatedSrc = webview.src || '';
				if (node.lastUrl !== updatedSrc) {
					node.lastUrl = updatedSrc;
					changed = true;
					console.debug(`[CanvasPolling]    -> Updated node.lastUrl to "${updatedSrc}" (was different).`);
				} else {
					console.debug(`[CanvasPolling]    -> lastUrl is already "${node.lastUrl}". No change needed.`);
				}
			} // end of matchingEls loop
		} // end of linkNodes loop

		// If changes occurred, save
		if (changed) {
			console.debug('[CanvasPolling] Some node.lastUrl changed. Saving .canvas JSON...');
			await this.saveCanvasData(activeFile, canvasData);
		} else {
			console.debug('[CanvasPolling] No changes in node.lastUrl, nothing to save.');
		}
	}

	/**
	 * Read the .canvas JSON from disk
	 */
	private async readCanvasData(file: TFile): Promise<CanvasData | null> {
		try {
			console.debug(`[CanvasPolling] Reading .canvas file: ${file.path}`);
			const jsonRaw = await this.app.vault.read(file);
			return JSON.parse(jsonRaw) as CanvasData;
		} catch (err) {
			console.error('[CanvasPolling] Error reading .canvas file:', err);
			return null;
		}
	}

	/**
	 * Write the .canvas JSON back to disk
	 */
	private async saveCanvasData(file: TFile, data: CanvasData) {
		try {
			await this.app.vault.modify(file, JSON.stringify(data, null, 2));
			console.debug('[CanvasPolling] Saved updated .canvas JSON with new lastUrl');
		} catch (err) {
			console.error('[CanvasPolling] Failed to modify .canvas file:', err);
		}
	}

	/**
	 * Finds *all* DOM .canvas-node elements that match this node's x,y,width,height
	 * in case multiple tabs or multiple copies exist in the DOM.
	 */
	private findAllCanvasNodesInDom(node: CanvasNode): HTMLElement[] {
		const result: HTMLElement[] = [];
		const allCanvasNodes = Array.from(document.querySelectorAll('.canvas-node'));
		console.debug(`[CanvasPolling] findAllCanvasNodesInDom() -> Checking ${allCanvasNodes.length} .canvas-node elements in DOM...`);

		for (const el of allCanvasNodes) {
			const style = window.getComputedStyle(el as HTMLElement);
			const { x: domX, y: domY } = parseTransformToXY(style.transform);
			const w = parseFloat(style.width) || 0;
			const h = parseFloat(style.height) || 0;

			// Log each node so we can see them in debug
			console.debug(`   -> .canvas-node { transformXY=(${domX}, ${domY}), w=${w}, h=${h} }`);

			const matches = (
				Math.abs(node.x - domX) < 0.5 &&
				Math.abs(node.y - domY) < 0.5 &&
				Math.abs(node.width - w) < 0.5 &&
				Math.abs(node.height - h) < 0.5
			);
			if (matches) {
				result.push(el as HTMLElement);
				console.debug('   -> (MATCH) This .canvas-node belongs to node id=' + node.id);
			}
		}

		return result;
	}
}
