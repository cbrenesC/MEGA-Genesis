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
        <h2 id="credits-heading">CRÉDITOS</h2>
      </header>
      <div class="credits-dialog__body">
        <h3>SPACE MISSION · MEGA GENESIS</h3>
        <p class="credits-dialog__subtitle">Un juego de ingeniería aeroespacial y exploración</p>
        <p>Desde el centro de control, prepara el lanzamiento de un cohete y dirige una misión con un rover lunar.</p>
        <p class="credits-dialog__technology"><span>TECNOLOGÍA</span> · PHASER 3 · VITE · JAVASCRIPT · HTML5 · CSS3</p>
        <p>Arte pixel art generado por procedimiento para esta misión.</p>
        <p>Gracias por jugar.</p>
        <form method="dialog">
          <button type="submit" class="space-title__button space-title__button--primary" autofocus>VOLVER</button>
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
