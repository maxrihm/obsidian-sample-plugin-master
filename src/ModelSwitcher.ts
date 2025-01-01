// src/ModelSwitcher.ts
import { App, Notice } from 'obsidian';
import { CanvasData, CanvasNode } from './CanvasTypes';
import { parseTransformToXY } from './transformParser';

/**
 * Logic to create a new "link" node in the .canvas, then inject JS into <webview> to switch model.
 */
export class ModelSwitcher {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Creates a new link node, then calls `injectJSForModelClick` after a delay.
	 */
	public async addAndSwitchModel(chosenModel: string) {
		let indexToClick: number;
		switch (chosenModel) {
			case '4o':
				indexToClick = 0;
				break;
			case 'o1':
				indexToClick = 1;
				break;
			case 'o1-pro':
				indexToClick = 3;
				break;
			default:
				new Notice(`Unknown model: ${chosenModel}`);
				return;
		}

		// Example coords
		const x = 200, y = -1000, w = 760, h = 800;
		const linkUrl = 'https://chatgpt.com';

		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== 'canvas') {
			new Notice('No active .canvas file found.');
			return;
		}

		try {
			const content = await this.app.vault.read(activeFile);
			const canvasData = JSON.parse(content) as CanvasData;

			const newLinkNode: CanvasNode = {
				id: Date.now().toString(),
				type: 'link',
				url: linkUrl,
				x,
				y,
				width: w,
				height: h,
			};

			canvasData.nodes.push(newLinkNode);
			await this.app.vault.modify(activeFile, JSON.stringify(canvasData, null, 2));

			new Notice(`Created ChatGPT node at (${x}, ${y}). Now injecting model selection...`);

			// Wait 2 seconds for the node to render in the canvas, then inject
			setTimeout(() => {
				this.injectJSForModelClick(x, y, w, h, indexToClick);
			}, 2000);
		} catch (err) {
			console.error('Failed to update .canvas file:', err);
			new Notice('Error: Could not update the canvas.');
		}
	}

	/**
	 * Finds the DOM .canvas-node by (x,y,width,height), then injects JS to "click" the model dropdown in the webview.
	 */
	private async injectJSForModelClick(
		x: number,
		y: number,
		width: number,
		height: number,
		indexToClick: number
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
			console.log('Cannot inject model-switch JS; node not found in DOM.');
			return;
		}

		const webview = foundElement.querySelector('webview') as any;
		if (!webview || typeof webview.executeJavaScript !== 'function') {
			console.log('No webview.executeJavaScript() or <webview> not found.');
			return;
		}

		const scriptToInject = `
			(function() {
				const dropdownButton = document.querySelector('button[aria-label^="Model selector"]');
				if (!dropdownButton) {
					console.error('Dropdown button not found');
					return;
				}

				// Step 1: "click" the button
				const pointerEventDown = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
				dropdownButton.dispatchEvent(pointerEventDown);

				const pointerEventUp = new PointerEvent('pointerup', { bubbles: true, cancelable: true });
				dropdownButton.dispatchEvent(pointerEventUp);

				// Step 2: After 200ms, click the target menu item
				setTimeout(() => {
					const menuItems = document.querySelectorAll('div[role="menu"] div[role="menuitem"]');
					if (menuItems.length > ${indexToClick}) {
						const item = menuItems[${indexToClick}];
						setTimeout(() => {
							item.click();
						}, 1000);
					}
				}, 200);
			})();
		`;

		try {
			await webview.executeJavaScript(scriptToInject, false);
			new Notice(`Injected model-switch JS (clicked index=${indexToClick}).`);
		} catch (err) {
			console.error('Error injecting JS to select model:', err);
		}
	}
}
