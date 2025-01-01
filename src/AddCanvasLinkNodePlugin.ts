import { Plugin, Notice } from 'obsidian';
import { ModelSelectionModal } from './ModelSelectionModal';
import { ModelSwitcher } from './ModelSwitcher';
import { saveAllWebviewUrls } from './CanvasSaveHelper';
import { parseTransformToXY } from './transformParser';

export default class AddCanvasLinkNodePlugin extends Plugin {
	private modelSwitcher: ModelSwitcher | null = null;

	async onload() {
		console.log('[PLUGIN] AddCanvasLinkNodePlugin loaded');

		//
		// 1) "Add & Switch Model" button
		//
		this.modelSwitcher = new ModelSwitcher(this.app);
		this.addRibbonIcon('zap', 'Add & Switch Model', () => {
			new ModelSelectionModal(this.app, (chosenModel: string) => {
				this.modelSwitcher?.addAndSwitchModel(chosenModel);
			}).open();
		});

		//
		// 2) "Save Webview URLs" button
		//
		this.addRibbonIcon('save', 'Save Webviews to JSON', async () => {
			await saveAllWebviewUrls(this.app);
		});

		//
		// 3) Intercept Backspace at the document level
		//
		document.addEventListener(
			'keydown',
			(evt) => {
				this.handleBackspace(evt);
			},
			{ capture: true }
		);
	}

	async onunload() {
		console.log('[PLUGIN] AddCanvasLinkNodePlugin unloaded');
	}

	/**
	 * Intercepts Backspace:
	 * - If ANY selected node has a URL containing chatgpt.com,
	 *   block the default deletion,
	 *   dispatch Ctrl+Shift+Backspace,
	 *   click "Delete" button,
	 *   and run coordinate-based injection on EACH matching node.
	 */
	private handleBackspace(evt: KeyboardEvent) {
		// Avoid infinite recursion from synthetic events
		if (!evt.isTrusted) {
			console.log('[PLUGIN] Synthetic Backspace event -> skip.');
			return;
		}

		if (evt.key !== 'Backspace') return;

		const leaf = this.app.workspace.activeLeaf;
		if (!leaf || !leaf.view || !leaf.view.canvas) return;

		const canvas = leaf.view.canvas;
		const selection = canvas.selection;
		if (!selection || selection.size === 0) return;

		// Check if ANY selected node is chatgpt.com
		let foundChatGpt = false;
		for (const node of selection) {
			const url = node?.unknownData?.url || node?.url;
			if (url && url.includes('chatgpt.com')) {
				foundChatGpt = true;
				break;
			}
		}
		if (!foundChatGpt) return;

		// BLOCK normal backspace
		console.log('[PLUGIN] Backspace blocked for ChatGPT node(s).');
		evt.preventDefault();
		evt.stopPropagation();
		evt.stopImmediatePropagation();

		// 1) Dispatch Ctrl+Shift+Backspace globally
		const ctrlShiftBackspaceEvent = new KeyboardEvent('keydown', {
			key: 'Backspace',
			code: 'Backspace',
			ctrlKey: true,
			shiftKey: true,
			bubbles: true,
			cancelable: true
		});
		document.dispatchEvent(ctrlShiftBackspaceEvent);

		// 2) After 1 second, click "Delete" button
		setTimeout(() => {
			console.log('[PLUGIN] Trying to click "Delete" button...');
			const deleteBtn = document.querySelector(
				'button.btn.relative.btn-danger[data-testid="delete-conversation-confirm-button"]'
			) as HTMLButtonElement | null;
			if (deleteBtn) {
				deleteBtn.click();
				console.log('[PLUGIN] Clicked "Delete" button!');
			} else {
				console.log('[PLUGIN] "Delete" button not found.');
			}
		}, 1000);

		// 3) For EACH selected node with chatgpt.com, do coordinate-based injection
		for (const node of selection) {
			const url = node?.unknownData?.url || node?.url;
			if (url && url.includes('chatgpt.com')) {
				this.injectJSLikeModelSwitcher(node.x, node.y, node.width, node.height);
			}
		}
	}

	/**
	 * Finds the DOM .canvas-node by (x, y, width, height),
	 * then calls webview.executeJavaScript() on it.
	 */
	private async injectJSLikeModelSwitcher(
		x: number,
		y: number,
		width: number,
		height: number
	) {
		const allDomNodes = Array.from(document.querySelectorAll('.canvas-node'));
		let foundElement: HTMLElement | null = null;

		// Find the single .canvas-node matching these coords
		for (const el of allDomNodes) {
			const style = window.getComputedStyle(el);
			const { x: domX, y: domY } = parseTransformToXY(style.transform);
			const w = parseFloat(style.width) || 0;
			const h = parseFloat(style.height) || 0;

			if (
				Math.abs(domX - x) < 0.5 &&
				Math.abs(domY - y) < 0.5 &&
				Math.abs(w - width) < 0.5 &&
				Math.abs(h - height) < 0.5
			) {
				foundElement = el as HTMLElement;
				break;
			}
		}

		if (!foundElement) {
			console.log('[PLUGIN] No .canvas-node found for coords:', { x, y, width, height });
			return;
		}

		const webview = foundElement.querySelector('webview') as any;
		if (!webview || typeof webview.executeJavaScript !== 'function') {
			console.log('[PLUGIN] <webview> not found or has no executeJavaScript() method.');
			return;
		}

		// The snippet to inject
		const scriptToInject = `
			// 1. Attempt to simulate Ctrl+Shift+Backspace
			const ctrlShiftBackspaceEvent = new KeyboardEvent('keydown', {
			  key: 'Backspace',
			  code: 'Backspace',
			  ctrlKey: true,
			  shiftKey: true,
			  bubbles: true,
			  cancelable: true
			});
			document.dispatchEvent(ctrlShiftBackspaceEvent);

			// 2. Wait 1 second, then click the Delete button
			setTimeout(() => {
				const deleteButton = document.querySelector(
				  'button.btn.relative.btn-danger[data-testid="delete-conversation-confirm-button"]'
				);
				if (deleteButton) {
				  deleteButton.click();
				  console.log("Delete button clicked!");
				} else {
				  console.log("Delete button not found!");
				}
			}, 1000);

			// 3. Prevent default Backspace in the webview
			document.addEventListener('keydown', (e) => {
			  if (e.key === 'Backspace') {
			    e.preventDefault();
			  }
			}, true);
		`;

		try {
			await webview.executeJavaScript(scriptToInject, false);
			new Notice('Injected JS via backspace override.');
		} catch (err) {
			console.error('[PLUGIN] Failed to inject JS:', err);
		}
	}
}
