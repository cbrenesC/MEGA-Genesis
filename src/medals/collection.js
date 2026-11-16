import { onLanguageChange, t } from '../i18n/index.js';
import { MEDALS, hasAllMedals } from './progress.js';
import { drawMedal, medalCanvas } from './pixelArt.js';
import './collection.css';

const node = (tag, className, copy) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (copy) el.textContent = copy;
  return el;
};
const name = medal => t(`medals.name.${medal.id}`);
const requirement = medal => medal.stationNameKey && !['launch', 'rover'].includes(medal.id)
  ? t('medals.confirm', { station: t(medal.stationNameKey) })
  : t(`medals.requirement.${medal.id}`);

let rewardQueue = [];
let rewardOpen = false;
function nextReward() {
  if (rewardOpen || !rewardQueue.length) return;
  rewardOpen = true;
  const medal = rewardQueue.shift();
  const dialog = node('dialog', 'medal-reward');
  dialog.setAttribute('aria-label', name(medal));
  const panel = node('section', 'medal-reward__panel');
  const stars = node('div', 'medal-reward__stars');
  stars.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 24; i++) {
    const star = node('i');
    star.style.left = `${(i * 43 + 17) % 100}%`;
    star.style.top = `${(i * 67 + 9) % 100}%`;
    star.style.animationDelay = `${i % 7 * .12}s`;
    stars.append(star);
  }
  const art = node('div', 'medal-reward__art');
  art.append(medalCanvas(medal, true));
  const save = node('button', 'medal-reward__save', t('medals.saveReward'));
  save.type = 'button';
  save.onclick = () => dialog.close();
  dialog.addEventListener('cancel', event => event.preventDefault());
  dialog.addEventListener('close', () => {
    dialog.remove();
    rewardOpen = false;
    nextReward();
  }, { once: true });
  panel.append(stars, node('p', 'medal-reward__kicker', t('medals.unlockedToast')),
    art, node('h2', 'medal-reward__title', name(medal)),
    node('p', 'medal-reward__description', requirement(medal)), save);
  dialog.append(panel);
  document.body.append(dialog);
  dialog.showModal();
  save.focus();
}
export function announceMedals(ids) {
  rewardQueue.push(...MEDALS.filter(medal => ids.includes(medal.id)));
  nextReward();
}

// Export the card directly from Canvas. No images, accounts or remote
// upload are needed, and the exported glyphs match the in-game medals.
export function collectionImage(medals) {
  if (!hasAllMedals(medals)) return Promise.resolve(null);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  const color = (hex, x, y, w, h) => { ctx.fillStyle = hex; ctx.fillRect(x, y, w, h); };
  const text = (copy, x, y, size, hex, maxWidth = 950) => {
    ctx.font = `${size}px "VT323", monospace`;
    ctx.fillStyle = hex;
    ctx.textAlign = 'center';
    ctx.fillText(copy, x, y, maxWidth);
  };
  color('#071225', 0, 0, 1080, 1080);
  color('#0c1d35', 28, 28, 1024, 1024);
  ctx.strokeStyle = '#365878';
  ctx.lineWidth = 4;
  ctx.strokeRect(28, 28, 1024, 1024);
  for (let i = 0; i < 43; i++) {
    const x = 42 + (i * 167) % 991;
    const y = 43 + (i * 263) % 980;
    color(i % 5 ? '#244361' : '#7dc9d8', x, y, i % 5 ? 3 : 5, i % 5 ? 3 : 5);
  }
  text('MEGA GENESIS  /  SPACE MISSION', 540, 92, 31, '#82ddee');
  text(t('medals.cardTitle'), 540, 163, 66, '#f7fbff');
  text(t('medals.counter', { count: MEDALS.length, total: MEDALS.length }), 540, 208, 34, '#ffce72');
  MEDALS.forEach((medal, i) => {
    const x = 68 + (i % 4) * 240;
    const y = 251 + Math.floor(i / 4) * 232;
    const frame = { teal: '#307e86', purple: '#674e9e', blue: '#426faf', gold: '#c58a41' }[medal.color];
    color(frame, x, y, 224, 217);
    color('#0a172c', x + 3, y + 3, 218, 211);
    drawMedal(ctx, medal, x + 40, y + 12, 6);
    text(name(medal), x + 112, y + 190, 27, medal.color === 'gold' ? '#ffce72' : '#e0eff9', 204);
  });
  text(t('medals.cardFooter'), 540, 1013, 28, '#9cb9d4');
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

const canShareFile = file => {
  try { return Boolean(navigator.share && navigator.canShare?.({ files: [file] })); }
  catch { return false; }
};

export function showMedals(medals) {
  const app = document.getElementById('app');
  if (app.querySelector('.medal-collection')) return;
  const dialog = node('dialog', 'medal-collection');
  dialog.setAttribute('aria-labelledby', 'medal-collection-heading');
  let stopLocalization;
  let revision = 0;
  dialog.addEventListener('close', () => {
    ++revision;
    stopLocalization?.();
    dialog.remove();
  }, { once: true });

  function render() {
    const currentRevision = ++revision;
    const complete = hasAllMedals(medals);
    const heading = node('header', 'medal-collection__heading');
    const titleBlock = node('div');
    const title = node('h2', '', t('medals.title'));
    title.id = 'medal-collection-heading';
    titleBlock.append(node('span', 'medal-collection__eyebrow', 'SPACE MISSION / MEGA GENESIS'), title);
    const close = node('button', 'medal-collection__close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', t('common.back'));
    close.autofocus = true;
    close.onclick = () => dialog.close();
    heading.append(titleBlock, close);

    const progress = document.createElement('progress');
    progress.max = MEDALS.length;
    progress.value = MEDALS.filter(medal => medals.has(medal.id)).length;
    const count = t('medals.counter', { count: progress.value, total: progress.max });
    progress.setAttribute('aria-label', count);
    const body = node('div', 'medal-collection__body');
    const progressRow = node('div', 'medal-collection__progress');
    progressRow.append(progress, node('strong', '', count));
    body.append(progressRow, node('p', 'medal-collection__hint', t(complete ? 'medals.complete' : 'medals.intro')));

    const grid = node('ul', 'medal-collection__grid');
    for (const medal of MEDALS) {
      const unlocked = medals.has(medal.id);
      const card = node('li', `medal-card medal-card--${unlocked ? medal.color : 'locked'}`);
      card.append(
        node('span', 'medal-card__status', t(unlocked ? 'medals.earned' : 'medals.locked')),
        medalCanvas(medal, unlocked),
        node('strong', '', name(medal)),
        node('small', 'medal-card__requirement', requirement(medal)),
      );
      grid.append(card);
    }
    body.append(grid);
    dialog.replaceChildren(heading, body);

    if (complete) {
      const footer = node('footer', 'medal-collection__export');
      const download = node('button', 'space-title__button space-title__button--primary', t('medals.download'));
      const share = node('button', 'space-title__button', t('medals.share'));
      const status = node('p', '', t('medals.generating'));
      status.setAttribute('role', 'status');
      download.disabled = true;
      share.hidden = true;
      footer.append(download, share, status);
      body.append(footer);
      // Prepare the file before the click so Web Share keeps user activation.
      void (document.fonts?.load('31px "VT323"') ?? Promise.resolve()).catch(() => {}).then(() => collectionImage(medals)).then(blob => {
        if (currentRevision !== revision || !dialog.open) return;
        if (!blob) throw new Error('PNG unavailable');
        const file = new File([blob], 'space-mission-medals.png', { type: 'image/png' });
        download.disabled = false;
        download.onclick = () => {
          const url = URL.createObjectURL(file);
          const link = node('a');
          link.href = url;
          link.download = file.name;
          footer.append(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 30000);
        };
        share.hidden = !canShareFile(file);
        status.textContent = share.hidden ? t('medals.manualShare') : '';
        share.onclick = async () => {
          share.disabled = true;
          try {
            await navigator.share({ files: [file] });
          } catch (error) {
            if (error.name !== 'AbortError') status.textContent = t('medals.manualShare');
          } finally {
            share.disabled = false;
          }
        };
      }).catch(() => {
        if (currentRevision === revision && dialog.open) status.textContent = t('medals.exportError');
      });
    }
  }

  app.append(dialog);
  render();
  dialog.showModal();
  stopLocalization = onLanguageChange(render);
}
