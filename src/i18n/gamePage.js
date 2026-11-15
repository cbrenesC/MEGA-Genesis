import { bindLanguagePickers, localizeDOM } from './index.js';

export function initializeGamePage() {
  localizeDOM();
  bindLanguagePickers();
}
