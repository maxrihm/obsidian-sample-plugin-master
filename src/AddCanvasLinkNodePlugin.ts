import { Plugin } from 'obsidian';
import { ModelSelectionModal } from './ModelSelectionModal';
import { CanvasPolling } from './CanvasPolling';
import { ModelSwitcher } from './ModelSwitcher';

/**
 * Main plugin entry point.
 */
export default class AddCanvasLinkNodePlugin extends Plugin {
	private canvasPolling: CanvasPolling | null = null;
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

		// 2) The 5-second polling feature
		this.canvasPolling = new CanvasPolling(this.app, 5000);
		this.canvasPolling.start();
	}

	async onunload() {
		console.log('AddCanvasLinkNodePlugin unloaded');
		// Stop polling
		this.canvasPolling?.stop();
	}
} 