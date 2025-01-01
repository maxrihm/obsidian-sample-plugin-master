// src/ModelSelectionModal.ts
import { App, Modal } from 'obsidian';

/**
 * A modal dialog that lets the user pick a ChatGPT model: "4o", "o1", or "o1-pro".
 */
export class ModelSelectionModal extends Modal {
	private onChoice: (model: string) => void;

	constructor(app: App, onChoice: (model: string) => void) {
		super(app);
		this.onChoice = onChoice;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Select ChatGPT Model' });

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
