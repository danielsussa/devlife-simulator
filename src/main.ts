import Phaser from 'phaser';
import './style.css';
import { OfficeScene } from './scene';
import { defaultConfig, Sim } from './sim';
import { loadConfigFromUrl, shareUrl, syncUrl } from './share';
import { buildConfigForm, renderClock, renderKanban, renderLog, renderMetrics } from './ui';

const cfg = structuredClone(defaultConfig);
loadConfigFromUrl(cfg); // setup shared via ?cfg=
syncUrl(cfg);
let sim = new Sim(cfg);

const SPEEDS = [
  { label: '⏸', h: 0 },
  { label: '15min/s', h: 0.25 },
  { label: '1h/s', h: 1 },
  { label: '4h/s', h: 4 },
  { label: '12h/s', h: 12 },
  { label: '1d/s', h: 24 },
  { label: '3d/s', h: 72 },
];
let speed = 3;
let highlightId: number | null = null;
const fastNights = document.getElementById('fastNights') as HTMLInputElement;

const hoursPerSecond = () => {
  const h = SPEEDS[speed].h;
  // fast-forward nights, except during the deploy window (so you can watch the on-call dev)
  return fastNights.checked && !sim.working && !sim.deploySession ? Math.max(h, Math.min(h * 6, 24)) : h;
};

const scene = new OfficeScene({
  sim: () => sim,
  tick: (dt) => sim.step(dt * hoursPerSecond()),
  hoursPerSecond,
  highlightId: () => highlightId,
});
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'stage',
  pixelArt: true,
  backgroundColor: '#1c1f26',
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  scene,
});

function wireSim() {
  sim.onEvent = (e) => scene.onSimEvent(e);
}
wireSim();

function restart() {
  sim = new Sim(cfg);
  wireSim();
  scene.rebuild();
  renderAll();
}

// ---- header ----
const speeds = document.getElementById('speeds')!;
function renderSpeeds() {
  speeds.innerHTML = SPEEDS.map((s, i) => `<button data-i="${i}" class="${i === speed ? 'on' : ''}">${s.label}</button>`).join('');
}
speeds.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b) return;
  speed = Number(b.dataset.i);
  renderSpeeds();
});
renderSpeeds();
document.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  if (e.code === 'Space') {
    e.preventDefault();
    speed = speed === 0 ? 3 : 0;
    renderSpeeds();
  }
});

document.getElementById('restart')!.addEventListener('click', restart);
const drawer = document.getElementById('config')!;
document.getElementById('configBtn')!.addEventListener('click', () => (drawer.hidden = !drawer.hidden));
document.getElementById('configClose')!.addEventListener('click', () => (drawer.hidden = true));
buildConfigForm(cfg, (needsRestart) => {
  syncUrl(cfg);
  if (needsRestart) restart();
});

const shareBtn = document.getElementById('shareBtn')!;
shareBtn.addEventListener('click', async () => {
  const url = shareUrl(cfg);
  try {
    await navigator.clipboard.writeText(url);
    shareBtn.textContent = '✓ Link copied';
  } catch {
    prompt('Copy the setup link:', url);
  }
  setTimeout(() => (shareBtn.textContent = '🔗 Share'), 1800);
});
document.getElementById('resetCfg')!.addEventListener('click', () => {
  location.href = location.pathname; // no ?cfg= means defaults
});

// ---- kanban hover highlights the ticket in the office ----
const kanban = document.getElementById('kanban')!;
// the kanban re-renders every 250ms: re-read the card under the mouse instead of relying on mouseover
let mouse: { x: number; y: number } | null = null;
const pickHighlight = () => {
  const el = mouse && document.elementFromPoint(mouse.x, mouse.y);
  const c = el instanceof HTMLElement ? el.closest<HTMLElement>('#kanban .pr, #kanban .kcard[data-id]') : null;
  highlightId = c ? Number(c.dataset.id) : null;
};
kanban.addEventListener('mousemove', (e) => {
  mouse = { x: e.clientX, y: e.clientY };
  pickHighlight();
});
kanban.addEventListener('mouseleave', () => {
  mouse = null;
  highlightId = null;
});
window.addEventListener('blur', () => {
  mouse = null;
  highlightId = null;
});

function renderAll() {
  renderClock(sim);
  renderKanban(sim);
  pickHighlight();
  renderMetrics(sim);
  renderLog(sim);
}
setInterval(renderAll, 250);
renderAll();

// console debugging: devlife.sim, devlife.scene
(window as unknown as Record<string, unknown>).devlife = { get sim() { return sim; }, scene };
