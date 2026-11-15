import { localizeDOM } from '../i18n/index.js';
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
        <h2 id="credits-heading">CREDITS</h2>
      </header>
      <div class="credits-dialog__body">
        <h3>SPACE MISSION · MEGA GENESIS</h3>
        <p class="credits-dialog__subtitle">Developed by the MEGA Genesis Team</p>
        <p><strong>Andrés Castro · Camila Brenes · Matías Cubero · Kendall Valencia</strong></p>
        <h3>SPECIAL THANKS</h3>
        <p>Our sincere thanks to everyone who helped make this project possible, especially our mentors for their guidance and support.</p>
        <p>To NASA, for providing valuable resources and data that supported the development of this experience.</p>
        <p>To SVGator, for its animated loader template, used under its applicable free-use license.</p>
        <p>Special thanks to Claude, GPT, Gemini, and Manus AI for their incredible assistance throughout this project.</p>
        <h3>AI-GENERATED CONTENT</h3>
        <p>All videos, SVG animations, images, and audio assets were created using artificial intelligence tools exclusively for the MEGA Genesis project.</p>
        <p>AI-Generated Content — This asset was created using artificial intelligence tools for the MEGA Genesis project.</p>
        <p>Thank you for making this possible!</p>
        <form method="dialog">
          <button type="submit" class="space-title__button space-title__button--primary" autofocus>BACK</button>
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
