// Team builder: the visual way to set up a simulation. Pixel avatars for every dev (the same sprite each one gets in
// the office), +/− per level, the demand rate and three "flow" switches, and a big Simulate button.
// It sits at the top of the Settings drawer and, in the reel view (?view=reel&setup=1), as a full-screen card over the
// office, so setting up a team can be recorded for short videos.
import { DEV_SPRITES, SHEETS, TILE, TL_SPRITES } from './assets';
import { Config, defaultConfig } from './sim';
import { ic } from './ui';

const SHEET_COLS = 54;
const MAX_DEVS = 8;
const LEVELS = [
  { key: 'seniors', label: 'Senior', hint: 'fast, clean PRs' },
  { key: 'mids', label: 'Mid-level', hint: 'the backbone' },
  { key: 'juniors', label: 'Junior', hint: 'learning, more rework' },
] as const;

// flow presets: what each chip writes into the config
const REVIEW: Chip[] = [
  { label: 'up to 2 days', v: { reviewWaitDaysMax: defaultConfig.reviewWaitDaysMax, tlReviewWaitDaysMax: defaultConfig.tlReviewWaitDaysMax } },
  { label: '1 day', v: { reviewWaitDaysMax: 1, tlReviewWaitDaysMax: 0.5 } },
  { label: '½ day', v: { reviewWaitDaysMax: 0.5, tlReviewWaitDaysMax: 0.3 } },
];
const DEPLOY: Chip[] = [
  { label: `${ic('moon')} Night window`, v: { deployAtNight: true, deployOnFriday: defaultConfig.deployOnFriday, canaryHoursMax: defaultConfig.canaryHoursMax } },
  { label: `${ic('sun')} Daytime`, v: { deployAtNight: false, deployOnFriday: true, canaryHoursMax: 8 } },
];
const ENVS: Chip[] = [1, 2, 3].map((n) => ({ label: String(n), v: { envsPerDay: n } }));

type Chip = { label: string; v: Partial<Config> };
const matches = (cfg: Config, p: Chip) => Object.entries(p.v).every(([k, v]) => cfg[k as keyof Config] === v);

let sheet: HTMLImageElement | null = null;
function sheetImg() {
  if (!sheet) {
    sheet = new Image();
    sheet.src = SHEETS.chars.url;
  }
  return sheet;
}

/** A dev sprite as a crisp, scaled-up canvas. */
function avatar(frame: number, cls = '') {
  const c = document.createElement('canvas');
  c.width = c.height = TILE;
  c.className = `av ${cls}`;
  const draw = () => {
    const g = c.getContext('2d')!;
    const s = TILE + SHEETS.chars.spacing;
    g.clearRect(0, 0, TILE, TILE);
    g.drawImage(sheetImg(), (frame % SHEET_COLS) * s, Math.floor(frame / SHEET_COLS) * s, TILE, TILE, 0, 0, TILE, TILE);
  };
  const img = sheetImg();
  if (img.complete && img.naturalWidth) draw();
  else img.addEventListener('load', draw, { once: true });
  return c;
}

export type BuilderOpts = {
  /** a setting changed; `restart` when the team itself changed */
  onChange: (restart: boolean) => void;
  /** the Simulate button */
  onSimulate: () => void;
};

export function mountBuilder(root: HTMLElement, cfg: Config, opts: BuilderOpts) {
  root.classList.add('builder');
  root.innerHTML = `
    <div class="b-head"><span>${ic('people-group')} Build your team</span><b class="b-count"></b></div>
    <div class="b-crew"></div>
    <div class="b-levels">${LEVELS.map((l, i) => `
      <div class="b-level" data-k="${l.key}">
        <span class="b-face" data-i="${i}"></span>
        <span class="b-name"><b>${l.label}</b><small>${l.hint}</small></span>
        <span class="b-step"><button type="button" data-d="-1" aria-label="Remove a ${l.label} dev">${ic('minus')}</button><output></output><button type="button" data-d="1" aria-label="Add a ${l.label} dev">${ic('plus')}</button></span>
      </div>`).join('')}
    </div>
    <div class="b-demand">
      <span>${ic('inbox')} A new request every</span>
      <span class="b-step"><button type="button" data-dd="-0.1" aria-label="More demand">${ic('minus')}</button><output></output><button type="button" data-dd="0.1" aria-label="Less demand">${ic('plus')}</button></span>
    </div>
    <div class="b-sub">${ic('code-pull-request')} The flow</div>
    <div class="b-row"><span>Review within</span><div class="b-chips" data-g="review"></div></div>
    <div class="b-row"><span>Deploys</span><div class="b-chips" data-g="deploy"></div></div>
    <div class="b-row"><span>Environments / day</span><div class="b-chips" data-g="envs"></div></div>
    <button type="button" class="b-go">${ic('play')} Simulate</button>`;

  const groups: Record<string, Chip[]> = { review: REVIEW, deploy: DEPLOY, envs: ENVS };
  for (const [g, items] of Object.entries(groups)) {
    root.querySelector(`[data-g="${g}"]`)!.innerHTML = items.map((p, i) => `<button type="button" data-i="${i}">${p.label}</button>`).join('');
  }
  // the face next to each level: the sprite of that level's first dev (or a generic one)
  const faceFrame = (i: number) => {
    const before = LEVELS.slice(0, i).reduce((s, l) => s + cfg[l.key], 0);
    return DEV_SPRITES[before % DEV_SPRITES.length];
  };

  const crew = root.querySelector<HTMLElement>('.b-crew')!;
  let shown: number[] = [];
  const render = (pop = -1) => {
    const total = cfg.seniors + cfg.mids + cfg.juniors;
    root.querySelector('.b-count')!.textContent = `${total} dev${total === 1 ? '' : 's'} + ${cfg.techLeads} TL`;
    LEVELS.forEach((l, i) => {
      const row = root.querySelector<HTMLElement>(`[data-k="${l.key}"]`)!;
      row.querySelector('output')!.textContent = String(cfg[l.key]);
      row.querySelector<HTMLButtonElement>('[data-d="-1"]')!.disabled = cfg[l.key] <= 0;
      row.querySelector<HTMLButtonElement>('[data-d="1"]')!.disabled = total >= MAX_DEVS;
      const face = row.querySelector<HTMLElement>('.b-face')!;
      face.replaceChildren(avatar(faceFrame(i)));
    });
    // the crew: one avatar per dev in office order (seniors, mids, juniors), then the tech leads
    const frames = Array.from({ length: total }, (_, i) => DEV_SPRITES[i % DEV_SPRITES.length]);
    const levelOf = (i: number) => (i < cfg.seniors ? 'senior' : i < cfg.seniors + cfg.mids ? 'mid' : 'junior');
    crew.replaceChildren(
      ...frames.map((f, i) => {
        const el = document.createElement('span');
        el.className = `b-dev ${levelOf(i)} ${i === pop || (shown.length && i >= shown.length) ? 'pop' : ''}`;
        el.append(avatar(f));
        return el;
      }),
      ...Array.from({ length: cfg.techLeads }, (_, k) => {
        const el = document.createElement('span');
        el.className = 'b-dev tl';
        el.append(avatar(TL_SPRITES[k % TL_SPRITES.length]));
        return el;
      }),
    );
    shown = frames;
    root.querySelector('.b-demand output')!.textContent = `${cfg.arrivalEveryDays.toFixed(1)} days`;
    for (const [g, items] of Object.entries(groups)) {
      root.querySelectorAll<HTMLElement>(`[data-g="${g}"] button`).forEach((b, i) => b.classList.toggle('on', matches(cfg, items[i])));
    }
  };

  const bump = (el: Element | null) => {
    if (!el) return;
    el.classList.remove('bump');
    void (el as HTMLElement).offsetWidth;
    el.classList.add('bump');
  };

  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b || b.disabled) return;
    const c = cfg as unknown as Record<string, unknown>;
    if (b.dataset.d) {
      const k = b.closest<HTMLElement>('.b-level')!.dataset.k as (typeof LEVELS)[number]['key'];
      cfg[k] = Math.max(0, cfg[k] + Number(b.dataset.d));
      // where the new dev lands in the office order (to pop it in)
      const idx = LEVELS.findIndex((l) => l.key === k);
      const at = LEVELS.slice(0, idx + 1).reduce((s, l) => s + cfg[l.key], 0) - 1;
      render(Number(b.dataset.d) > 0 ? at : -1);
      bump(b.closest('.b-level')!.querySelector('output'));
      opts.onChange(true);
    } else if (b.dataset.dd) {
      cfg.arrivalEveryDays = Math.round(Math.min(30, Math.max(0.3, cfg.arrivalEveryDays + Number(b.dataset.dd))) * 10) / 10;
      render();
      bump(root.querySelector('.b-demand output'));
      opts.onChange(false);
    } else if (b.closest('.b-chips')) {
      const g = b.closest<HTMLElement>('.b-chips')!.dataset.g!;
      Object.assign(c, groups[g][Number(b.dataset.i)].v);
      render();
      opts.onChange(false);
    } else if (b.classList.contains('b-go')) {
      b.classList.remove('go');
      void b.offsetWidth;
      b.classList.add('go');
      opts.onSimulate();
    }
  });

  render();
  return { render };
}
