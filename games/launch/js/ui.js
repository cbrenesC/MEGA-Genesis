// Utilidades de interfaz compartidas: glosario con "?", datos curiosos, avisos y teclado.

import { esc } from './screens.js';
import { app } from './store.js';

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// Glosario: botones "?" que abren una explicación corta (y un "Ver más")
// ---------------------------------------------------------------------------

let popoverOwner = null;

export function closePopover() {
  const pop = $('popover');
  pop.hidden = true;
  if (popoverOwner) popoverOwner.setAttribute('aria-expanded', 'false');
  popoverOwner = null;
}

export function showTerm(button) {
  const term = app.data.glossary[button.dataset.term];
  if (!term) return;
  if (popoverOwner === button) { closePopover(); return; }
  const pop = $('popover');
  popoverOwner = button;
  button.setAttribute('aria-expanded', 'true');
  $('popover-title').textContent = term.title;
  $('popover-text').textContent = term.text;
  const more = $('popover-more');
  more.hidden = !(term.more || term.formula);
  more.innerHTML = `<summary>Ver más · Para los curiosos</summary><p>${esc(term.more ?? '')}</p>${term.formula ? `<p class="formula"><code>${esc(term.formula)}</code></p>` : ''}`;
  more.open = false;
  pop.hidden = false;
  const r = button.getBoundingClientRect();
  const w = Math.min(340, window.innerWidth - 24);
  pop.style.width = `${w}px`;
  pop.style.left = `${Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2))}px`;
  const below = r.bottom + 10 + 180 < window.innerHeight;
  pop.style.top = below ? `${r.bottom + 10}px` : 'auto';
  pop.style.bottom = below ? 'auto' : `${window.innerHeight - r.top + 10}px`;
}

export function bindGlossary() {
  document.addEventListener('click', (event) => {
    const btn = event.target.closest('.term');
    if (btn) { event.preventDefault(); showTerm(btn); return; }
    if (!event.target.closest('#popover')) closePopover();
  });
  $('popover').querySelector('.popover-close').addEventListener('click', closePopover);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closePopover(); });
}

// ---------------------------------------------------------------------------
// Datos curiosos para las esperas
// ---------------------------------------------------------------------------

export function randomFact(excludeId = null) {
  const facts = app.data?.facts ?? [];
  const pool = facts.filter((f) => f.id !== excludeId);
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

/** Cambia el dato curioso de un contenedor cada `ms` milisegundos. Devuelve una función para detenerlo. */
export function rotateFacts(container, ms = 7000) {
  let last = null;
  const show = () => {
    const f = randomFact(last?.id);
    if (!f) return;
    last = f;
    container.innerHTML = `<span class="fact-kicker">¿SABÍAS QUE…?</span><p>${esc(f.text)}</p><small>${esc(f.source)}</small>`;
  };
  show();
  const id = setInterval(show, ms);
  return () => clearInterval(id);
}

// ---------------------------------------------------------------------------
// Avisos breves
// ---------------------------------------------------------------------------

export function toast(text, kind = 'info', ms = 3500) {
  const el = $('toast');
  el.textContent = text;
  el.className = `toast ${kind}`;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, ms);
}
