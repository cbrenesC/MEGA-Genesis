import { localizeDOM } from '../../i18n/index.js';
import './creditsDialog.css';

// Adapted from demogame's PanelScene.buildCredits for the web title menu.
export function showCredits() {
  const app = document.getElementById('app');
  let dialog = app.querySelector('#credits-dialog');

  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'credits-dialog';
    dialog.className = 'credits-dialog';
    dialog.setAttribute('aria-labelledby', 'credits-heading');
    dialog.innerHTML = `
      <header class="credits-dialog__header">
        <h2 id="credits-heading" data-i18n="home.credits">Credits</h2>
      </header>
      <div class="credits-dialog__body">
        <h3>SPACE MISSION · MEGA GENESIS</h3>
        <p class="credits-dialog__subtitle" data-i18n="credits.team">Developed by the MEGA Genesis team</p>
        <p><strong>Andrés Castro · Camila Brenes · Matías Cubero · Kendall Valencia</strong></p>
        <h3 data-i18n="credits.thanks">Special thanks</h3>
        <p data-i18n="credits.mentors">Thank you to everyone who made this project possible, especially our mentors for their guidance and support.</p>
        <p data-i18n="credits.nasa">To NASA, for the data and resources that informed the development of this experience.</p>
        <p data-i18n="credits.svgator">To SVGator, for its animated loader template, used under its applicable free-use license.</p>
        <p data-i18n="credits.tools">To Claude, GPT, Gemini, and Manus AI, for their support throughout the project.</p>
        <h3 data-i18n="credits.ai">AI-generated content</h3>
        <p data-i18n="credits.assets">The videos, SVG animations, images, and audio were created with AI tools exclusively for MEGA Genesis.</p>
        <p data-i18n="credits.closing">Thank you for making this possible!</p>
        <form method="dialog">
          <button type="submit" class="space-title__button space-title__button--primary" autofocus data-i18n="common.back">Back</button>
        </form>
      </div>
    `;
    app.append(dialog);
  }

  if (!dialog.open) {
    localizeDOM(dialog);
    dialog.showModal();
  }
}
