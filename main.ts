import {
	App,
	Modal,
	Notice,
	Plugin,
	TFile
} from 'obsidian';

/**
 * Parse the "transform" CSS string to extract an (x, y) translation.
 * Handles matrix(), matrix3d(), translate(), and negative values.
 */
function parseTransformToXY(transformString: string): { x: number; y: number } {
	let x = 0;
	let y = 0;

	if (!transformString || transformString === 'none') {
		return { x, y };
	}

	// Check for "matrix(a, b, c, d, e, f)"
	const matrixRegex = /^matrix\(\s*([\-\d.]+),\s*([\-\d.]+),\s*([\-\d.]+),\s*([\-\d.]+),\s*([\-\d.]+),\s*([\-\d.]+)\)/;
	let m = matrixRegex.exec(transformString);
	if (m) {
		x = parseFloat(m[5]);
		y = parseFloat(m[6]);
		return { x, y };
	}

	// Check for "matrix3d(...)" – e is index 12, f is index 13 in that list
	const matrix3dRegex = /^matrix3d\(\s*([\-\d.]+(?:,\s*[\-\d.]+){14})\)/;
	let m3 = matrix3dRegex.exec(transformString);
	if (m3) {
		const parts = m3[1].split(',').map((p) => parseFloat(p.trim()));
		x = parts[12];
		y = parts[13];
		return { x, y };
	}

	// If there's a chained transform with translate(...) scale(...) etc.
	const allFunctionsRegex = /(\w+)\(([^)]+)\)/g;
	let funcMatch;
	while ((funcMatch = allFunctionsRegex.exec(transformString)) !== null) {
		const fn = funcMatch[1];
		const rawArgs = funcMatch[2];
		if (fn === 'translate') {
			const parts = rawArgs.split(',').map((p) => p.trim());
			if (parts.length >= 2) {
				x = parseFloat(parts[0]);
				y = parseFloat(parts[1]);
			} else if (parts.length === 1) {
				x = parseFloat(parts[0]);
				y = 0;
			}
		}
	}

	return { x, y };
}

/**
 * A custom Modal to let the user pick a model: "4o", "o1", or "o1-pro".
 */
class ModelSelectionModal extends Modal {
	private onChoice: (model: string) => void;

	constructor(app: App, onChoice: (model: string) => void) {
		super(app);
		this.onChoice = onChoice;
	}

	onOpen() {
		const { contentEl } = this;

		// Title
		contentEl.createEl('h2', { text: 'Select ChatGPT Model' });

		// The three choices
		const models = ['4o', 'o1', 'o1-pro'];
		models.forEach((model) => {
			const btn = contentEl.createEl('button', { text: model });
			btn.addEventListener('click', () => {
				this.onChoice(model);
				this.close();
			});
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}

interface CanvasNode {
	id: string;
	type: string;    // e.g., 'link'
	url?: string;
	x: number;
	y: number;
	width: number;
	height: number;
	[key: string]: unknown; // for extra props like "lastUrl"
}

interface CanvasData {
	nodes: CanvasNode[];
	edges: unknown[];
}

export default class AddCanvasLinkNodePlugin extends Plugin {
	private pollingIntervalId: number | null = null;

	async onload() {
		// Optional ribbon icon
		this.addRibbonIcon('zap', 'Add & Switch Model', () => {
			new ModelSelectionModal(this.app, (chosenModel: string) => {
				this.addAndSwitchModel(chosenModel);
			}).open();
		});

		// Start the 5-second polling job
		this.startPollingCanvasNodes();

		console.log('AddCanvasLinkNodePlugin loaded');
	}

	async onunload() {
		console.log('AddCanvasLinkNodePlugin unloaded');
		// Clear the polling interval
		if (this.pollingIntervalId) {
			window.clearInterval(this.pollingIntervalId);
			this.pollingIntervalId = null;
		}
	}

	/**
	 * Poll every 5 seconds:
	 *  - If active file is .canvas, read JSON
	 *  - For each .canvas-node <webview> in DOM, parse transform to get (x,y),
	 *    match .canvas node, set lastUrl, etc.
	 */
	private startPollingCanvasNodes() {
		this.pollingIntervalId = window.setInterval(async () => {
			console.log('Polling for link nodes...');

			const activeFile = this.app.workspace.getActiveFile();
			if (!activeFile || activeFile.extension !== 'canvas') {
				console.log('No active .canvas file. Skipping...');
				return;
			}

			let canvasData: CanvasData;
			try {
				const jsonRaw = await this.app.vault.read(activeFile);
				canvasData = JSON.parse(jsonRaw) as CanvasData;
			} catch (err) {
				console.error('Error reading .canvas file:', err);
				return;
			}

			const allCanvasNodes = document.querySelectorAll('.canvas-node');
			if (!allCanvasNodes.length) {
				console.log('No .canvas-node elements in DOM right now.');
				return;
			}

			let changed = false;

			for (const canvasNodeEl of allCanvasNodes) {
				const { domX, domY, nodeWidth, nodeHeight } = this.getDomNodeDims(canvasNodeEl as HTMLElement);

				console.log(
					`DOM node at x=${domX}, y=${domY}, w=${nodeWidth}, h=${nodeHeight}`
				);

				const webview = canvasNodeEl.querySelector('webview') as HTMLWebViewElement | null;
				if (!webview) {
					console.log('--> No <webview> found here. Skipping...');
					continue;
				}

				// Try matching {type:'link'} node in JSON
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

				console.log('--> Found matching JSON node:', foundNode);

				const currentSrc = webview.src || '';
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
				try {
					await this.app.vault.modify(activeFile, JSON.stringify(canvasData, null, 2));
					console.log('Saved updated .canvas JSON with new lastUrl');
				} catch (err) {
					console.error('Failed to modify .canvas file:', err);
				}
			}
		}, 5000);
	}

	/**
	 * Use our robust parser to read x,y from transform
	 */
	private getDomNodeDims(canvasNodeEl: HTMLElement) {
		const style = window.getComputedStyle(canvasNodeEl);
		const { x: domX, y: domY } = parseTransformToXY(style.transform);
		const nodeWidth = parseFloat(style.width) || 0;
		const nodeHeight = parseFloat(style.height) || 0;

		return { domX, domY, nodeWidth, nodeHeight };
	}

	/**
	 * (Same as your previous "addAndSwitchModel" method, unchanged.)
	 */
	private async addAndSwitchModel(chosenModel: string) {
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

		const x = 200, y = -1000, w = 860, h = 800; // example coords
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
				height: h
			};

			canvasData.nodes.push(newLinkNode);
			await this.app.vault.modify(activeFile, JSON.stringify(canvasData, null, 2));

			new Notice(`Created ChatGPT node at (${x}, ${y}). Now injecting model selection...`);

			setTimeout(() => {
				this.injectJSForModelClick(x, y, w, h, indexToClick);
			}, 2000);
		} catch (err) {
			console.error('Failed to update .canvas file:', err);
			new Notice('Error: Could not update the canvas.');
		}
	}

	/**
	 * (Same as before, for injecting JS.)
	 */
	private async injectJSForModelClick(
		x: number,
		y: number,
		width: number,
		height: number,
		indexToClick: number
	) {
		const { foundElement } = await this.findCanvasNodeByCoords(x, y, width, height);
		if (!foundElement) {
			console.log('Cannot inject model-switch JS; node not found in DOM.');
			return;
		}

		const webview = foundElement.querySelector('webview') as any;
		if (!webview || typeof webview.executeJavaScript !== 'function') {
			console.log('No webview.executeJavaScript() available or <webview> not found.');
			return;
		}

		const scriptToInject = `
			(function() {
				const dropdownButton = document.querySelector('button[aria-label^="Model selector"]');
				if (!dropdownButton) {
					console.error('Dropdown button not found');
					return;
				}

				// Step 1: "click" the button with pointer events
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

	/**
	 * Find the .canvas-node in the DOM by x,y,w,h (optional for your JS injection).
	 */
	private async findCanvasNodeByCoords(x: number, y: number, width: number, height: number) {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== 'canvas') {
			return { foundElement: null, foundNode: null };
		}

		const allDomNodes = document.querySelectorAll('.canvas-node');
		let foundElement: HTMLElement | null = null;

		for (const el of allDomNodes) {
			const style = window.getComputedStyle(el as HTMLElement);
			const { x: domX, y: domY } = parseTransformToXY(style.transform);
			const w = parseFloat(style.width);
			const h = parseFloat(style.height);

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

		return { foundElement, foundNode: null };
	}
}
