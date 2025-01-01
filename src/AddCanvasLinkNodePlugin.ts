// src/AddCanvasLinkNodePlugin.ts

import { Plugin } from 'obsidian';
import { ModelSelectionModal } from './ModelSelectionModal';
import { ModelSwitcher } from './ModelSwitcher';
import { saveAllWebviewUrls } from './CanvasSaveHelper';

/**
 * Main plugin entry point.
 */
export default class AddCanvasLinkNodePlugin extends Plugin {
	private modelSwitcher: ModelSwitcher | null = null;

	async onload() {
		console.log('AddCanvasLinkNodePlugin loaded');

		// 1) The "Add & Switch Model" feature
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
	}

	async onunload() {
		console.log('AddCanvasLinkNodePlugin unloaded');
	}
}
