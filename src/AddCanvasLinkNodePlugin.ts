// src/AddCanvasLinkNodePlugin.ts

import { Plugin, Notice } from 'obsidian';
import { ModelSelectionModal } from './ModelSelectionModal';
import { ModelSwitcher } from './ModelSwitcher';
import { saveAllWebviewUrls } from './CanvasSaveHelper';
import { parseTransformToXY } from './transformParser';

export default class AddCanvasLinkNodePlugin extends Plugin {
	private modelSwitcher: ModelSwitcher | null = null;

	async onload() {
		console.log('[PLUGIN] AddCanvasLinkNodePlugin loaded');

		// 1) "Add & Switch Model" button
		this.modelSwitcher = new ModelSwitcher(this.app);
		this.addRibbonIcon('zap', 'Add & Switch Model', () => {
			new ModelSelectionModal(this.app, (chosenModel: string) => {
				this.modelSwitcher?.addAndSwitchModel(chosenModel);
			}).open();
		});

		// 2) "Save Webview URLs" button
		this.addRibbonIcon('save', 'Save Webviews to JSON', async () => {
			await saveAllWebviewUrls(this.app);
		});

		// --- NEW COMMANDS FOR HOTKEYS ---
		this.addCommand({
			id: 'add-and-switch-model',
			name: 'Add & Switch Model',
			callback: () => {
				new ModelSelectionModal(this.app, (chosenModel: string) => {
					this.modelSwitcher?.addAndSwitchModel(chosenModel);
				}).open();
			},
		});

		this.addCommand({
			id: 'save-webviews-to-json',
			name: 'Save Webviews to JSON',
			callback: async () => {
				await saveAllWebviewUrls(this.app);
			},
		});
		// --- END NEW COMMANDS FOR HOTKEYS ---

		// 3) Intercept Backspace at the document level
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
	 * - If ANY selected node has a URL containing chatgpt.com, block normal backspace,
	 *   dispatch Ctrl+Shift+Backspace, click "Delete" after 1s,
	 *   call injection on EACH matching node,
	 *   THEN after 3s, programmatically call the Canvas "deleteSelection()" 
	 *   to mimic the normal backspace behavior (because a synthetic event won't do it).
	 */
	private handleBackspace(evt: KeyboardEvent) {
		// Prevent recursion from synthetic events
		if (!evt.isTrusted) {
			console.log('[PLUGIN] Synthetic Backspace -> skip.');
			return;
		}

		if (evt.key !== 'Backspace') return;

		const leaf = this.app.workspace.activeLeaf;
		if (!leaf || !leaf.view || !leaf.view.canvas) return;

		const canvas = leaf.view.canvas;
		const selection = canvas.selection;
		if (!selection || selection.size === 0) return;

		// See if ANY selected node is chatgpt.com
		let foundChatGpt = false;
		for (const node of selection) {
			const url = node?.unknownData?.url || node?.url;
			if (url && url.includes('chatgpt.com')) {
				foundChatGpt = true;
				break;
			}
		}
		if (!foundChatGpt) return;

		// 1) Block the normal backspace
		console.log('[PLUGIN] Backspace blocked for ChatGPT node(s).');
		evt.preventDefault();
		evt.stopPropagation();
		evt.stopImmediatePropagation();

		// 2) Dispatch Ctrl+Shift+Backspace globally
		const ctrlShiftBackspaceEvent = new KeyboardEvent('keydown', {
			key: 'Backspace',
			code: 'Backspace',
			ctrlKey: true,
			shiftKey: true,
			bubbles: true,
			cancelable: true
		});
		document.dispatchEvent(ctrlShiftBackspaceEvent);

		// 3) After 1s, click "Delete" button
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

		// 4) For EACH selected node with chatgpt.com => do coordinate-based injection
		for (const node of selection) {
			const url = node?.unknownData?.url || node?.url;
			if (url && url.includes('chatgpt.com')) {
				this.injectJSLikeModelSwitcher(node.x, node.y, node.width, node.height);
			}
		}

		// 5) After 3s, mimic the "real" backspace by calling Canvas's own deleteSelection()
		setTimeout(() => {
			console.log('[PLUGIN] Doing normal canvas.deleteSelection() after 3s...');
			canvas.deleteSelection(); 
		}, 2000);
	}

	/**
	 * Finds the DOM .canvas-node by (x, y, width, height),
	 * then calls webview.executeJavaScript().
	 */
	private async injectJSLikeModelSwitcher(
		x: number,
		y: number,
		width: number,
		height: number
	) {
		const allDomNodes = Array.from(document.querySelectorAll('.canvas-node'));
		let foundElement: HTMLElement | null = null;

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

		// This snippet triggers Ctrl+Shift+Backspace, clicks Delete after 1s,
		// and prevents default Backspace in the webview.
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
		} catch (err) {
			console.error('[PLUGIN] Failed to inject JS:', err);
		}
	}
}
