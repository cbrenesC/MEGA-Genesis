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
        <p class="credits-dialog__subtitle">Desarrollado por el equipo MEGA Genesis</p>
        <p><strong>Andrés Castro · Camila Brenes · Matías Cubero · Kendall Valencia</strong></p>
        <h3>AGRADECIMIENTOS ESPECIALES</h3>
        <p>Gracias a todas las personas que nos ayudaron a hacer posible este proyecto, especialmente a nuestros mentores por su orientación y apoyo.</p>
        <p>A la NASA, por poner a disposición recursos y datos que contribuyeron al desarrollo de esta experiencia.</p>
        <p>A SVGator, por su plantilla de loader animado, disponible para uso libre conforme a su licencia.</p>
        <p>Y un agradecimiento muy especial a Claude, GPT, Gemini y Manus AI por su increíble ayuda durante el desarrollo de este proyecto.</p>
        <p>¡Gracias por hacerlo posible!</p>
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
