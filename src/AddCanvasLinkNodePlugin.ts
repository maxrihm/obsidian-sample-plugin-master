import { Plugin, Notice } from 'obsidian';
import { ModelSelectionModal } from './ModelSelectionModal';
import { ModelSwitcher } from './ModelSwitcher';
import { saveAllWebviewUrls } from './CanvasSaveHelper';

export default class AddCanvasLinkNodePlugin extends Plugin {
	private modelSwitcher: ModelSwitcher | null = null;

	async onload() {
		console.log('AddCanvasLinkNodePlugin loaded');

		// 1) The "Add & Switch Model" feature (unchanged)
		this.modelSwitcher = new ModelSwitcher(this.app);
		this.addRibbonIcon('zap', 'Add & Switch Model', () => {
			new ModelSelectionModal(this.app, (chosenModel: string) => {
				this.modelSwitcher?.addAndSwitchModel(chosenModel);
			}).open();
		});

		// 2) "Save Webview URLs" button (unchanged)
		this.addRibbonIcon('save', 'Save Webviews to JSON', async () => {
			await saveAllWebviewUrls(this.app);
		});

		// 3) NEW BUTTON: Hard-Delete in ChatGPT Webview
		this.addRibbonIcon('trash', 'Hard-Delete in ChatGPT Webview', async () => {
			await this.injectChatGPTDelete();
		});
	}

	async onunload() {
		console.log('AddCanvasLinkNodePlugin unloaded');
	}

	/**
	 * Looks at this.app.workspace.activeLeaf.view.canvas.selection,
	 * which is a Set of objects, each with `.value`.
	 * 
	 * For each item, we check if its URL contains "chatgpt", 
	 * then we get the `.frameEl` -> that should be the element
	 * holding the <webview>.
	 */
    private async injectChatGPTDelete() {
        // 1) Access the selection
        const selection = this.app.workspace.activeLeaf?.view?.canvas?.selection;
        if (!selection || selection.size === 0) {
          console.log('No Canvas selection or nothing selected.');
          return;
        }
      
        // 2) Grab the first selected item (if you only want the first)
        const selectionValues = selection.values();
        const firstValue = selectionValues.next().value;
        if (!firstValue) {
          console.log('Selection is empty');
          return;
        }
      
        // 3) Extract the URL
        const url = firstValue?.unknownData?.url; 
        console.log('URL:', url);
      
        // 4) Extract the frameEl (the element that might contain the <webview>)
        const frameEl = firstValue?.frameEl;
        console.log('frameEl:', frameEl);
      
        // 5) If the URL doesn’t contain “chatgpt”, skip
        if (!url || !url.includes('chatgpt')) {
          console.log('URL does not contain "chatgpt"');
          return;
        }
      
        // 6) If frameEl is itself a <webview>, great; otherwise find <webview> inside
        let webview: any = null;
        if (frameEl?.tagName?.toLowerCase() === 'webview') {
          webview = frameEl;
        } else {
          webview = frameEl?.querySelector?.('webview');
        }
      
        if (!webview || typeof webview.executeJavaScript !== 'function') {
          console.log('No valid webview found or .executeJavaScript() is missing.');
          return;
        }
      
        // 7) Inject your Ctrl+Shift+Backspace + “Delete” snippet
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
      
          // 2. Wait 1 second, then click the “Delete” button
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
          console.log('Injected Hard-Delete script into ChatGPT webview');
        } catch (err) {
          console.error('Error injecting Hard-Delete script:', err);
        }
      }
      
}
