import {
	App,
	Modal,
	Notice,
	Plugin,
	TFile
  } from 'obsidian';
  
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
		  this.onChoice(model); // Notify the callback
		  this.close();         // Close the modal
		});
	  });
	}
  
	onClose() {
	  this.contentEl.empty();
	}
  }
  
  interface CanvasNode {
	id: string;
	type: string;
	url?: string;
	x: number;
	y: number;
	width: number;
	height: number;
	[key: string]: unknown;
  }
  
  interface CanvasData {
	nodes: CanvasNode[];
	edges: unknown[];
  }
  
  export default class AddCanvasLinkNodePlugin extends Plugin {
	private mutationObserver: MutationObserver | null = null;
  
	async onload() {
	  // 1) Add a ribbon icon for "Add & Switch Model"
	  this.addRibbonIcon('zap', 'Add & Switch Model', () => {
		new ModelSelectionModal(this.app, (chosenModel: string) => {
		  this.addAndSwitchModel(chosenModel);
		}).open();
	  });
  
	  // 2) Observe .canvas-node additions so we can attach a 'did-navigate' event to each <webview>
	  this.startObservingCanvasNodes();
  
	  console.log('AddCanvasLinkNodePlugin loaded');
	}
  
	async onunload() {
	  console.log('AddCanvasLinkNodePlugin unloaded');
	  // Disconnect the MutationObserver
	  if (this.mutationObserver) {
		this.mutationObserver.disconnect();
		this.mutationObserver = null;
	  }
	}
  
	/**
	 * Observe the entire document for added/removed .canvas-node elements.
	 * Each time we find a new webview, attach the 'did-navigate' event.
	 */
	private startObservingCanvasNodes() {
	  this.mutationObserver = new MutationObserver((mutations) => {
		for (const mutation of mutations) {
		  for (const node of mutation.addedNodes) {
			if (node instanceof HTMLElement) {
			  // If the added node IS a .canvas-node or CONTAINS .canvas-node children
			  if (node.classList?.contains('canvas-node')) {
				this.attachDidNavigateListener(node);
			  } else {
				// Check deeper children
				const innerCanvasNodes = node.querySelectorAll?.('.canvas-node');
				innerCanvasNodes?.forEach((canvasNodeEl) => {
				  this.attachDidNavigateListener(canvasNodeEl);
				});
			  }
			}
		  }
		}
	  });
  
	  // Observe entire document for childList changes in the subtree
	  this.mutationObserver.observe(document.body, {
		childList: true,
		subtree: true
	  });
  
	  // Also, attach to any .canvas-node that already exists on load
	  document.querySelectorAll('.canvas-node').forEach((el) => {
		this.attachDidNavigateListener(el);
	  });
	}
  
	/**
	 * If this .canvas-node has a <webview>, attach a 'did-navigate' listener
	 * that updates the .canvas JSON whenever the URL changes
	 * (unless the URL contains "model").
	 */
	private attachDidNavigateListener(canvasNodeEl: Element) {
	  const webview = canvasNodeEl.querySelector('webview');
	  if (!webview) return;
  
	  // Casting to any or partial Electron webview so we can add event listeners
	  const wv = webview as any;
	  if (typeof wv.addEventListener !== 'function') return;
  
	  // Check if we already attached a listener to this webview
	  if ((wv as any)._modelSyncListenerAttached) return;
  
	  // Mark that we've attached once to avoid duplicates
	  (wv as any)._modelSyncListenerAttached = true;
  
	  // Listen for 'did-navigate' (fired when src changes by user navigation)
	  wv.addEventListener('did-navigate', async (event: any) => {
		const newUrl = event.url;
		// If the new URL contains "model", skip updating .canvas JSON
		if (!newUrl || newUrl.includes('model')) {
		  // We do nothing
		  return;
		}
		// Otherwise, update the node in the .canvas file
		await this.updateNodeUrlFromDom(canvasNodeEl as HTMLElement, newUrl);
	  });
	}
  
	/**
	 * Finds the node in the .canvas JSON that corresponds to this DOM element's
	 * x,y,width,height. Then updates that node's url to `newUrl`.
	 */
	private async updateNodeUrlFromDom(canvasNodeEl: HTMLElement, newUrl: string) {
	  const activeFile = this.app.workspace.getActiveFile();
	  if (!activeFile || activeFile.extension !== 'canvas') return;
  
	  try {
		// Read .canvas JSON
		const jsonRaw = await this.app.vault.read(activeFile);
		const canvasData = JSON.parse(jsonRaw) as CanvasData;
  
		// Parse DOM node's x,y,w,h
		const style = window.getComputedStyle(canvasNodeEl);
		const transform = style.transform;
		const nodeWidth = parseFloat(style.width);
		const nodeHeight = parseFloat(style.height);
  
		let domX = 0;
		let domY = 0;
  
		const translateMatch = /translate\(([\d.]+)px,\s*([\d.]+)px\)/.exec(transform);
		if (translateMatch) {
		  domX = parseFloat(translateMatch[1]);
		  domY = parseFloat(translateMatch[2]);
		} else {
		  const matrixMatch = /matrix\(.*,\s*([\d.]+),\s*([\d.]+)\)$/.exec(transform);
		  if (matrixMatch) {
			domX = parseFloat(matrixMatch[1]);
			domY = parseFloat(matrixMatch[2]);
		  }
		}
  
		// Find matching node
		const foundNode = canvasData.nodes.find(
		  (n) =>
			n.x === domX &&
			n.y === domY &&
			n.width === nodeWidth &&
			n.height === nodeHeight
		);
  
		if (!foundNode) return;
  
		// If the node's URL is different, update it
		if (foundNode.url !== newUrl) {
		  foundNode.url = newUrl;
		  // Save
		  await this.app.vault.modify(activeFile, JSON.stringify(canvasData, null, 2));
		  console.log(`Updated node url to: ${newUrl}`);
		}
	  } catch (err) {
		console.error('Failed to update node url in .canvas JSON:', err);
	  }
	}
  
	/**
	 * The existing method from the user’s code:
	 * Creates a node, then injects JS to pick a model, etc.
	 */
	private async addAndSwitchModel(chosenModel: string) {
	  // Map the user-chosen model to a dropdown index
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
  
	  const x = 200, y = 60, w = 760, h = 800;
	  const linkUrl = 'https://chatgpt.com'; // base URL
  
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
	 * Injects JavaScript to click a "Model selector", etc.
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
	 * Find the .canvas-node in the DOM by x,y,w,h.
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
		const transform = style.transform;
		const w = parseFloat(style.width);
		const h = parseFloat(style.height);
  
		let domX = 0;
		let domY = 0;
  
		const translateMatch = /translate\(([\d.]+)px,\s*([\d.]+)px\)/.exec(transform);
		if (translateMatch) {
		  domX = parseFloat(translateMatch[1]);
		  domY = parseFloat(translateMatch[2]);
		} else {
		  const matrixMatch = /matrix\(.*,\s*([\d.]+),\s*([\d.]+)\)$/.exec(transform);
		  if (matrixMatch) {
			domX = parseFloat(matrixMatch[1]);
			domY = parseFloat(matrixMatch[2]);
		  }
		}
  
		if (domX === x && domY === y && w === width && h === height) {
		  foundElement = el as HTMLElement;
		  break;
		}
	  }
  
	  return { foundElement, foundNode: null };
	}
  }
  