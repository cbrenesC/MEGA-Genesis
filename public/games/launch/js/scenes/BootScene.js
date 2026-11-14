// Carga los datos del juego y muestra datos curiosos mientras tanto.
import { loadData } from '../state.js';
import { app, recompute, diff } from '../store.js';
import { rotateFacts } from '../ui.js';

const Phaser = window.Phaser;

export class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  create() {
    const started = performance.now();
    loadData('./data/')
      .then((data) => {
        app.data = data;
        recompute();
        app.eventsEnabled = diff().eventsDefaultOn;
        const stop = rotateFacts(document.getElementById('boot-fact'), 6000);
        // un instante para leer el primer dato curioso
        const wait = Math.max(0, 1200 - (performance.now() - started));
        setTimeout(() => {
          stop();
          document.getElementById('boot').classList.add('is-done');
          setTimeout(() => { document.getElementById('boot').hidden = true; }, 500);
          this.scene.start('BriefingScene');
        }, wait);
      })
      .catch((error) => {
        const el = document.getElementById('boot-error');
        el.hidden = false;
        el.textContent = `No se pudieron cargar los datos del juego: ${error.message}. Revisa que estés abriendo la página desde un servidor (npm run dev) y no como un archivo suelto.`;
      });
  }
}
