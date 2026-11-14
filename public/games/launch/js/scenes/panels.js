// Escenas de decisión: Misión (Briefing), Hangar (catálogo y revisión) y Resultado.
import { BackdropScene } from './BackdropScene.js';
import { renderBriefing, renderCatalog, renderCheck, renderResult } from '../screens.js';

export class BriefingScene extends BackdropScene {
  constructor() { super('BriefingScene'); }
  render() { return renderBriefing(); }
}

// El hangar tiene dos vistas: el catálogo y la revisión de compatibilidad del cohete elegido.
export class HangarScene extends BackdropScene {
  constructor() { super('HangarScene'); }
  init(data) { this.view = data?.view ?? 'catalog'; }
  render() { return this.view === 'check' ? renderCheck() : renderCatalog(); }
}

export class ResultScene extends BackdropScene {
  constructor() { super('ResultScene'); }
  render() { return renderResult(); }
}
