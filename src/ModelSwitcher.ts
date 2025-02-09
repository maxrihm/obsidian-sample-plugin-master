// src/ModelSwitcher.ts
import { App, Notice } from 'obsidian';
import { CanvasData, CanvasNode } from './CanvasTypes';
import { parseTransformToXY } from './transformParser';

interface WebviewElement extends HTMLElement {
	executeJavaScript: (code: string, userGesture?: boolean) => Promise<any>;
	isLoading: () => boolean;
}

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
				indexToClick = 2;
				break;
			case 'o3-mini-high':
				indexToClick = 4;
				break;
			case 'o1-pro':
				indexToClick = 5;
				break;
			default:
				return;
		}

		// --- CHANGED CODE STARTS HERE ---
		// Instead of hard-coded coords, grab the current camera center from the active canvas
// ...
const activeLeaf = this.app.workspace.activeLeaf;
if (!activeLeaf || !activeLeaf.view || !activeLeaf.view.canvas) {
  return;
}
const canvas = activeLeaf.view.canvas;

// Desired node size
const w = 760;
const h = 800;

// Center the node on the camera
const x = canvas.x - w / 2;
const y = canvas.y - h / 2;

const linkUrl = 'https://chatgpt.com';

const activeFile = this.app.workspace.getActiveFile();
if (!activeFile || activeFile.extension !== 'canvas') {
  return;
}

// now push the new node to the .canvas JSON...
// ...


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


			// Wait 2 seconds for the node to render in the canvas, then inject
			setTimeout(() => {
				this.injectJSForModelClick(x, y, w, h, indexToClick);
			}, 2000);
		} catch (err) {
			console.error('Failed to update .canvas file:', err);
		}
	}

	/**
	 * Finds the DOM .canvas-node by (x,y,width,height), then injects JS to
	 * "click" the model dropdown in the webview.
	 */
	private async injectJSForModelClick(
		x: number,
		y: number,
		width: number,
		height: number,
		indexToClick: number
	) {
		// Find the corresponding canvas node in the DOM by matching x,y,width,height.
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

		const webview = foundElement.querySelector('webview') as WebviewElement | null;
		if (!webview || typeof webview.executeJavaScript !== 'function') {
			console.log('No webview.executeJavaScript() or <webview> not found.');
			return;
		}

		// The script we want to inject.
		// Note: This version checks document.readyState inside the webview
		const scriptToInject = `
			(function() {
				function injectModelSwitch() {
					const dropdownButton = document.querySelector('button[aria-label^="Model selector"]');
					if (!dropdownButton) {
						console.error('Dropdown button not found');
						return;
					}

					// Step 1: "click" the button by dispatching pointer events
					const pointerEventDown = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
					dropdownButton.dispatchEvent(pointerEventDown);
					const pointerEventUp = new PointerEvent('pointerup', { bubbles: true, cancelable: true });
					dropdownButton.dispatchEvent(pointerEventUp);

					// Step 2: After a short delay, click the target menu item
					setTimeout(() => {
						const menuItems = document.querySelectorAll('div[role="menu"] div[role="menuitem"]');
						if (menuItems.length > ${indexToClick}) {
							const item = menuItems[${indexToClick}];
							setTimeout(() => {
								item.click();
							}, 1000);
						} else {
							console.error('Target menu item not found.');
						}
					}, 200);
				}

				if (document.readyState === 'loading') {
					document.addEventListener('DOMContentLoaded', injectModelSwitch);
				} else {
					injectModelSwitch();
				}
			})();
		`;

		// Function to perform the injection
		const performInjection = () => {
			webview.executeJavaScript(scriptToInject, false).catch((err: Error) => {
				console.error('Error injecting JS to select model:', err);
			});
		};

		// Listen for the webview's "dom-ready" event
		webview.addEventListener('dom-ready', () => {
			performInjection();
		});

		// If the webview is already loaded, try to inject immediately
		if (typeof webview.isLoading === 'function' && !webview.isLoading()) {
			performInjection();
		}
	}
}
