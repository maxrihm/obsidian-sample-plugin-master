// src/AddCanvasLinkNodePlugin.ts

import { Plugin, Notice } from 'obsidian';
import { ModelSelectionModal } from './ModelSelectionModal';
import { ModelSwitcher } from './ModelSwitcher';
import { saveAllWebviewUrls } from './CanvasSaveHelper';

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
	}

	async onunload() {
		console.log('[PLUGIN] AddCanvasLinkNodePlugin unloaded');
	}
}
