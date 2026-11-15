import { BackdropScene } from './BackdropScene.js';
import { renderResult } from '../screens.js';

export class ResultScene extends BackdropScene {
  constructor() { super('ResultScene'); }
  render() { return renderResult(); }
}
