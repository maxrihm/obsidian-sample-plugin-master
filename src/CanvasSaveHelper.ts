// src/CanvasSaveHelper.ts
import { App, Notice, TFile } from 'obsidian';
import { parseTransformToXY } from './transformParser';
import { CanvasData } from './CanvasTypes';

/**
 * Iterates over all <webview> in .canvas-node elements,
 * and saves their .src to the .canvas JSON as `node.url`.
 */
export async function saveAllWebviewUrls(app: App) {
	const activeFile = app.workspace.getActiveFile();
	if (!activeFile || activeFile.extension !== 'canvas') {
		new Notice('No active .canvas file found.');
		return;
	}

	let canvasData: CanvasData;
	try {
		const jsonRaw = await app.vault.read(activeFile);
		canvasData = JSON.parse(jsonRaw) as CanvasData;
	} catch (err) {
		console.error('[SaveCanvas] Error reading .canvas file:', err);
		new Notice('Error: Could not read the canvas file.');
		return;
	}

	// Gather all .canvas-node elements
	const allDomNodes = Array.from(document.querySelectorAll('.canvas-node'));
	if (!allDomNodes.length) {
		new Notice('No .canvas-node elements found in DOM.');
		return;
	}

	let changed = false;

	for (const domNodeEl of allDomNodes) {
		const style = window.getComputedStyle(domNodeEl as HTMLElement);
		const { x: domX, y: domY } = parseTransformToXY(style.transform);
		const nodeWidth = parseFloat(style.width) || 0;
		const nodeHeight = parseFloat(style.height) || 0;

		// Find <webview>
		const webview = domNodeEl.querySelector('webview') as HTMLWebViewElement | null;
		if (!webview) continue; // skip if none

		const currentSrc = webview.src || '';

		// Match to a {type: 'link'} node in the JSON
		const foundNode = canvasData.nodes.find((n) => {
			return (
				n.type === 'link' &&
				Math.abs(n.x - domX) < 0.5 &&
				Math.abs(n.y - domY) < 0.5 &&
				Math.abs(n.width - nodeWidth) < 0.5 &&
				Math.abs(n.height - nodeHeight) < 0.5
			);
		});

		if (!foundNode) continue;

		// If node.url differs, update it
		if (foundNode.url !== currentSrc) {
			foundNode.url = currentSrc;
			changed = true;
			console.log(`[SaveCanvas] Updated node id=${foundNode.id} url => "${currentSrc}"`);
		}
	}

	if (changed) {
		try {
			await app.vault.modify(activeFile, JSON.stringify(canvasData, null, 2));
			new Notice('Saved all webview URLs to .canvas JSON!');
		} catch (err) {
			console.error('[SaveCanvas] Failed to modify .canvas file:', err);
			new Notice('Error: Could not save updated canvas data.');
		}
	} else {
		new Notice('Nothing changed. All webview URLs already match the JSON.');
	}
}