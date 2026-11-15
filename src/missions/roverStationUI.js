// Builder layout and component readouts adapted from feature/launch's rover constructor.
import { CATEGORIES, COMPONENTS, LIMITS, PHOTO_DEFS, RULES, validateBuild } from '../../games/rover/js/rules.js';
import { esc } from './launchStationUI.js';

export const ROVER_GROUPS = {
  mobility: ['chassis', 'wheels'], power: ['battery', 'solar'],
  science: ['instrument', 'camera'], comms: ['comms'],
};

export function renderRoverStation(part, build, { translate, number }) {
  const tr = (key, params) => esc(translate(`station.${key}`, params));
  const n = (value, digits = 0) => number(value, digits);
  const factsFor = {
    chassis: c => tr('roverFact.chassis', { speed: c.speed, draw: n(c.moveDraw, 1) }),
    wheels: c => tr('roverFact.wheels', { speed: n(c.speedMul, 2), draw: n(c.drawMul, 2), bump: n(c.bumpMul, 2) }),
    battery: c => tr('roverFact.battery', { capacity: c.capacity }),
    solar: c => tr('roverFact.solar', { gen: n(c.gen, 1) }),
    instrument: c => tr('roverFact.instrument', { time: c.analysisTime, energy: c.analysisEnergy, quality: n(c.quality, 1) }),
    camera: c => tr('roverFact.camera', { draw: n(c.draw, 2), data: n(c.dataMul, 1), time: n(c.photoTime, 1), energy: n(c.photoEnergy, 1) }),
    comms: c => tr('roverFact.comms', { time: n(c.txTime, 1), energy: n(c.txEnergy, 1), photoTime: n(c.txTime * RULES.photoTxMultiplier, 2), photoEnergy: n(c.txEnergy * RULES.photoTxMultiplier, 1) }),
  };
  const cats = CATEGORIES.filter(c => ROVER_GROUPS[part].includes(c.id)).map(({ id }) => `
    <section class="panel" aria-labelledby="station-category-${id}">
      <h3 id="station-category-${id}">${tr(`field.${id}`)}</h3>
      <div class="opts" role="group" aria-labelledby="station-category-${id}">
        ${COMPONENTS[id].map(c => {
          const active = build[id] === c.id;
          const key = `${id}.${c.id}`;
          return `<button type="button" class="opt${active ? ' is-selected' : ''}" data-component="${id}" data-option="${c.id}" data-focus="${id}-${c.id}" aria-pressed="${active}">
            <span class="tag">${tr('roverUI.chosen')}</span><b class="name">${tr(`component.${key}`)}</b>
            <span class="nums"><span class="chip">${c.mass} kg</span><span class="chip">${c.cost} cr</span></span>
            <span class="facts">${factsFor[id](c)}</span><span class="trade">${tr(`trade.${key}`)}</span>
          </button>`;
        }).join('')}
      </div>
    </section>`).join('');
  const { ok, stats } = validateBuild(build);
  const missing = CATEGORIES.filter(c => !COMPONENTS[c.id].some(option => option.id === build[c.id]));
  const warnings = [
    ...(missing.length ? [tr('roverMissing', { parts: missing.map(c => translate(`station.field.${c.id}`)).join(', ') })] : []),
    ...(stats.mass > LIMITS.mass || stats.cost > LIMITS.credits ? [tr('roverLimits')] : []),
  ];
  const meter = (key, value, max, unit) => {
    const ratio = value / max;
    const state = ratio > 1 ? 'bad' : ratio > .9 ? 'warn' : '';
    return `<div class="meter"><div class="top"><span>${tr(`roverUI.${key}`)}</span><b class="${state}">${value} / ${max} ${unit}</b></div>
      <div class="bar ${state}" aria-hidden="true"><i style="width:${Math.min(100, ratio * 100)}%"></i></div></div>`;
  };
  const stat = (key, val) => `<span>${tr(`roverUI.${key}`)}</span><b>${val}</b>`;
  const scienceHelp = tr('roverScienceHelp', {
    count: n(PHOTO_DEFS.length), photoRange: n(RULES.photoRange), scanRange: n(RULES.scanRange),
    time: n(RULES.scanTime), energy: n(RULES.scanEnergy),
  });
  const commsHelp = tr('roverCommsHelp', { goal: n(RULES.sampleGoal), ack: n(RULES.ackTime, 1) });
  const help = part === 'science' ? scienceHelp : part === 'comms' ? commsHelp : '';
  return `<div class="build"><div class="cats">${cats}${help ? `<section class="panel"><h3>${tr(`roverUI.${part}Guide`)}</h3><p class="detail">${help}</p></section>` : ''}</div>
    <aside class="side">
      <section class="panel"><h3>${tr('roverUI.preview')}</h3><div class="preview" data-rover-preview></div></section>
      <section class="panel"><h3>${tr('roverUI.resources')}</h3>
        ${meter('mass', stats.mass, LIMITS.mass, 'kg')}${meter('cost', stats.cost, LIMITS.credits, 'cr')}
        <div class="stats">
          ${stat('battery', stats.capacity ? `${stats.capacity} u` : '—')}
          ${stat('solar', stats.solar ? `+${n(stats.solar, 1)} u/s` : '—')}
          ${stat('draw', stats.moveDraw ? `${n(stats.moveDraw + stats.idleDraw, 2)} u/s` : '—')}
          ${stat('speed', stats.speed ? `${n(stats.speed, 1)} px/s` : '—')}
          ${stat('analysis', stats.analysisTime ? `${stats.analysisTime} s · ${stats.analysisEnergy} u` : '—')}
          ${stat('transmit', stats.txTime ? `${n(stats.txTime, 1)} s · ${n(stats.txEnergy, 1)} u` : '—')}
          ${part === 'science' ? stat('photo', stats.photoTime ? `${n(stats.photoTime, 1)} s · ${n(stats.photoEnergy, 1)} u` : '—') : ''}
          ${part === 'comms' ? stat('photoTransmit', stats.photoTxTime ? `${n(stats.photoTxTime, 2)} s · ${n(stats.photoTxEnergy, 1)} u` : '—') : ''}
        </div>
        <div class="reason ${ok ? 'ok' : 'bad'}" role="status">${ok ? tr('readyRover') : warnings.join('<br>')}</div>
        <div class="station-actions">
          <button type="button" class="primary" data-rover-action="recommend" data-focus="recommend">${tr('recommend')}</button>
          <button type="button" data-rover-action="clear" data-focus="clear">${tr('roverUI.clearGroup')}</button>
        </div>
      </section>
    </aside></div>`;
}
