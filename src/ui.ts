import { Config, defaultProfile, DevProfile, formatClock, Level, LEVEL_PRESETS, MAX_DEVS, Sim, Tag, Ticket } from './sim';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
const days = (hours: number) => (hours < 24 ? `${hours.toFixed(0)}h` : `${(hours / 24).toFixed(1)}d`);
/** Font Awesome solid icon. */
export const ic = (name: string, cls = '') => `<i class="fa-solid fa-${name} ${cls}" aria-hidden="true"></i>`;

// emojis that come in the sim's event texts → solid icons in the HUD
const EMOJI_ICONS: [string, string][] = [
  ['🌙', 'moon'], ['🏷', 'tag'], ['🚑', 'truck-medical'], ['⚔', 'code-merge'], ['🐞', 'bug'],
  ['🚨', 'people-group'], ['✅', 'circle-check'], ['🚀', 'rocket'], ['🔒', 'lock'],
];
const KIND_ICONS: Record<string, string> = {
  info: 'circle-info', good: 'circle-check', bad: 'circle-exclamation', warn: 'triangle-exclamation',
  'review-ok': 'thumbs-up', 'review-changes': 'comment-dots',
};
function iconize(text: string) {
  let html = esc(text);
  for (const [emo, name] of EMOJI_ICONS) html = html.split(emo).join(ic(name));
  return html.replace(/\uFE0F/g, '');
}

const tile = (icon: string, value: string, label: string, cls = '') =>
  `<div class="tile ${cls}"><div class="v">${ic(icon, 'ti')}${value}</div><div class="k">${label}</div></div>`;

const SERIES = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--s7', '--s8'];

export function renderClock(sim: Sim) {
  // fixed width + status always present (only hidden via visibility): the bar doesn't jump
  const weekend = Math.floor(sim.t / 24) % 7 >= 5;
  const icon = ic(weekend ? 'umbrella-beach' : 'moon');
  const el = $('clock');
  el.innerHTML = `${formatClock(sim.t)} <span class="off ${sim.working ? 'hide' : ''}">${icon}</span>`;
  el.title = sim.working ? 'Working hours' : weekend ? 'Weekend' : 'Off hours';
}

export function renderMetrics(sim: Sim) {
  const m = sim.metrics(30);
  const total = m.stages.reduce((s, x) => s + x.days, 0);
  const top = m.stages.reduce((a, b) => (b.days > a.days ? b : a), m.stages[0]);
  $('metrics').innerHTML = `
    <div class="tiles">
      ${tile('stopwatch', m.doneCount ? m.leadDays.toFixed(1) + 'd' : '–', 'avg lead time (30d)')}
      ${tile('truck-fast', m.throughputWeek.toFixed(1), 'deliveries / week')}
      ${tile('layer-group', String(m.wip), 'WIP (in progress)')}
      ${tile('gauge-high', m.doneCount ? Math.round(m.flowEfficiency * 100) + '%' : '–', 'flow efficiency')}
      ${tile('mug-hot', Math.round(m.devTime.idle * 100) + '%', 'devs idle (working hours)')}
      ${tile('users', Math.round(m.devTime.meetings * 100) + '%', 'in daily + refinement')}
      ${tile('wrench', Math.round(m.devTime.reworkOfCoding * 100) + '%', 'of coding is refactoring')}
      ${tile('comment-dots', m.commentsPerPR.toFixed(1), 'review comments per delivery')}
      ${tile('tag', m.prsPerTag ? m.prsPerTag.toFixed(1) : '–', 'PRs per tag (30d)')}
      ${tile('code-merge', m.conflictsPerPR.toFixed(1), 'merge conflicts per delivery')}
      ${tile('lock', String(m.mergeQueue), 'approved PRs waiting for a main slot')}
      ${tile('bug', String(m.openBugs || m.bugs), m.openBugs ? 'open bugs right now!' : 'production bugs (30d)', m.openBugs ? 'alarm' : '')}
      ${tile('truck-medical', m.mttrHours ? days(m.mttrHours) : '–', 'avg time to fix a bug')}
      ${tile('fire', Math.round(m.devTime.bugfix * 100) + '%', 'of the team firefighting')}
      ${tile('moon', m.nightHoursWeek.toFixed(1) + 'h', 'late-night / week')}
      ${tile('user-clock', sim.deploySession ? esc(sim.devs[sim.deploySession.devId].name) : '–', 'on call now')}
    </div>
    <div class="breakdown">
      <div class="title"><span>Where work spends its time</span><span>${m.doneCount} delivered</span></div>
      ${
        m.doneCount
          ? `<div class="bar">${m.stages
              .map((s, i) => `<div title="${s.label}: ${s.days.toFixed(1)}d" style="flex:${s.days / total};background:var(${SERIES[i % SERIES.length]})"></div>`)
              .join('')}</div>
             <ul class="legend">${m.stages
               .map(
                 (s, i) =>
                   `<li class="${s === top ? 'top' : ''}"><i style="background:var(${SERIES[i % SERIES.length]})"></i>${s.label}<b>${s.days.toFixed(1)}d</b></li>`,
               )
               .join('')}</ul>`
          : '<div class="more">No deliveries in production yet…</div>'
      }
    </div>`;
}

let lastLogLen = -1;
export function renderLog(sim: Sim) {
  const last = sim.events[sim.events.length - 1];
  const key = sim.events.length * 1e6 + (last?.t ?? 0);
  if (key === lastLogLen) return;
  lastLogLen = key;
  $('log').innerHTML = sim.events
    .slice(-60)
    .reverse()
    .map((e) => {
      const startsWithEmoji = EMOJI_ICONS.some(([emo]) => e.text.startsWith(emo));
      const lead = startsWithEmoji ? '' : ic(KIND_ICONS[e.kind] ?? 'circle-info', 'li');
      return `<li class="${e.kind}"><time>${formatClock(e.t).split(' · ').slice(1).join(' ')}</time>${lead}${iconize(e.text)}</li>`;
    })
    .join('');
}

function card(sim: Sim, tk: Ticket): string {
  const dev = tk.devId != null ? sim.devs[tk.devId]?.name : tk.author != null ? sim.devs[tk.author]?.name : '';
  const inStage = days(sim.t - tk.enteredAt);
  let extra = '';
  let meta = '';
  switch (tk.stage) {
    case 'doing':
      meta =
        tk.kind === 'bug'
          ? `${ic('people-group')} ${tk.swarm.map((id) => sim.devs[id].name).join(', ')} · ${Math.floor((100 * tk.workDone) / tk.workTotal)}%`
          : `${dev} · ${Math.floor((100 * tk.workDone) / tk.workTotal)}%`;
      extra = `<div class="prog"><div style="width:${(100 * tk.workDone) / tk.workTotal}%"></div></div>`;
      break;
    case 'review': {
      const ok = (role: string) => tk.reviews.filter((r) => r.role === role && r.done).length;
      const need = (role: string) => tk.reviews.filter((r) => r.role === role).length;
      const names = tk.reviews.map((r) => (r.done ? ic('check') : r.started ? ic('eye') : '·') + sim.devs[r.devId].name).join(' ');
      meta = [need('dev') ? `dev ${ok('dev')}/${need('dev')}` : '', need('techlead') ? `TL ${ok('techlead')}/${need('techlead')}` : '']
        .filter(Boolean)
        .join(' · ');
      if (tk.reviewRounds > 1) meta += ` · round ${tk.reviewRounds}`;
      if (tk.awaitingMerge) meta = `${ic('check')} approved · ${ic('lock')} main full (${sim.inMain().length}/${sim.cfg.maxMainPRs})`;
      extra = `<div class="m"><span>${names}</span></div>`;
      break;
    }
    case 'deploy': {
      if (tk.tagId == null && tk.hotfixEnds == null) {
        meta = `${ic('tag')} waiting for next tag`;
        break;
      }
      const env = sim.envs[tk.envIndex];
      if (tk.hotfixEnds != null) {
        meta = `${ic('truck-medical')} hotfix · ${days(Math.max(0, tk.hotfixEnds - sim.t))} left`;
      } else if (tk.deploying) {
        const p = (sim.t - env.startedAt) / (env.endsAt - env.startedAt);
        meta = `canary ${Math.round(p * 100)}% · ${days(env.endsAt - sim.t)} left`;
        extra = `<div class="prog canary"><div style="width:${p * 100}%"></div></div>`;
      } else {
        const dayRange = sim.cfg.deployOnFriday ? 'Mon–Fri' : 'Mon–Thu';
        meta = sim.cfg.deployAtNight ? `${ic('moon')} waiting for ${sim.cfg.deployHour}h window (${dayRange})` : `${ic('hourglass-half')} queued (${dayRange})`;
      }
      break;
    }
    case 'done':
      meta = `lead ${days(tk.doneAt! - tk.createdAt)}${tk.tagId != null ? ' · ' + (sim.tag(tk.tagId)?.name ?? '') : ''}`;
      break;
    default:
      meta = dev ?? '';
  }
  const badges = [
    tk.kind === 'bug' ? `<span class="badge bug">${ic('bug')} top priority</span>` : '',
    tk.rework ? `<span class="badge">${ic('wrench')} refactoring</span>` : '',
    tk.comments ? `<span class="badge">${ic('comment-dots')} ${tk.comments}</span>` : '',
    tk.conflicts ? `<span class="badge">${ic('code-merge')} ${tk.conflicts} conflict${tk.conflicts > 1 ? 's' : ''}</span>` : '', tk.rollbacks ? `<span class="badge">${ic('triangle-exclamation')} ${tk.rollbacks} rollback</span>` : '']
    .filter(Boolean)
    .join(' ');
  return `<div class="kcard ${tk.kind === 'bug' ? 'bug' : ''}" data-id="${tk.id}" style="border-color:${hex(tk.color)}">
    <div class="t"><b>#${tk.id}</b>${esc(tk.title)}</div>
    <div class="m"><span>${meta}</span><span>${tk.stage === 'done' ? '' : inStage}</span></div>
    ${badges ? `<div class="m">${badges}</div>` : ''}${extra}
  </div>`;
}

function tagCard(sim: Sim, tag: Tag): string {
  const env = sim.envs[tag.envIndex];
  const prs = tag.ticketIds.map((id) => sim.ticket(id)!);
  const hasBug = prs.some((tk) => tk.kind === 'bug');
  let meta: string;
  let extra = '';
  if (tag.hotfix) {
    const tk = prs[0];
    meta = `${ic('truck-medical')} hotfix · ${days(Math.max(0, (tk.hotfixEnds ?? sim.t) - sim.t))} left`;
  } else if (tag.deploying) {
    const p = (sim.t - env.startedAt) / (env.endsAt - env.startedAt);
    meta = `canary ${Math.round(p * 100)}% · ${days(env.endsAt - sim.t)} left`;
    extra = `<div class="prog canary"><div style="width:${p * 100}%"></div></div>`;
  } else {
    const dayRange = sim.cfg.deployOnFriday ? 'Mon–Fri' : 'Mon–Thu';
    meta = sim.cfg.deployAtNight ? `${ic('moon')} waiting for ${sim.cfg.deployHour}h window (${dayRange})` : `${ic('hourglass-half')} queued (${dayRange})`;
  }
  const chips = prs
    .map((tk) => `<span class="pr" data-id="${tk.id}" style="border-color:${hex(tk.color)}">#${tk.id}</span>`)
    .join('');
  return `<div class="kcard tag ${hasBug ? 'bug' : ''}">
    <div class="t"><b>${ic('tag')} ${esc(tag.name)}</b>${prs.length} PR${prs.length > 1 ? 's' : ''}${tag.includes.length ? ` · includes ${esc(tag.includes.join(', '))}` : ''}</div>
    <div class="m"><span>${meta}</span><span>${days(sim.t - tag.createdAt)}</span></div>
    <div class="prs">${chips}</div>${extra}
  </div>`;
}

export function renderKanban(sim: Sim) {
  const tagCols = sim.envs.map((env, i) => ({
    title: env.name,
    icon: 'industry',
    tags: sim.tags.filter((t) => t.status === 'active' && t.envIndex === i),
  }));
  const cols: { title: string; icon: string; items: Ticket[]; tags?: Tag[]; count?: string }[] = [
    { title: 'Backlog', icon: 'inbox', items: sim.inStage('backlog') },
    { title: 'Refinement', icon: 'comments', items: sim.inStage('refining') },
    { title: 'Ready for dev', icon: 'list-check', items: sim.inStage('ready') },
    { title: 'In dev', icon: 'code', items: sim.inStage('doing') },
    { title: 'Code review', icon: 'magnifying-glass', items: sim.inStage('review') },
    {
      title: 'Main',
      icon: 'code-branch',
      items: sim.inMain(),
      count: sim.cfg.maxMainPRs > 0 ? `${sim.inMain().length}/${sim.cfg.maxMainPRs}` : undefined,
    },
    ...tagCols.map((c) => ({ title: c.title, icon: c.icon, items: [], tags: c.tags })),
    {
      title: 'Delivered',
      icon: 'flag-checkered',
      items: sim.inStage('done').sort((a, b) => b.doneAt! - a.doneAt!),
    },
  ];
  const LIMIT = 25;
  const bugFirst = (a: Ticket, b: Ticket) => (a.kind === 'bug' ? 0 : 1) - (b.kind === 'bug' ? 0 : 1);
  for (const c of cols) if (c.title !== 'Delivered') c.items.sort(bugFirst);
  $('kanban').innerHTML = cols
    .map(
      (c) => `<div class="col"><h4><em>${ic(c.icon)}${c.title}</em><span>${c.tags ? `${c.tags.length} tag${c.tags.length === 1 ? '' : 's'}` : c.count ?? c.items.length}</span></h4><div class="cards">
        ${c.tags ? c.tags.map((t) => tagCard(sim, t)).join('') : ''}
        ${c.items.slice(0, LIMIT).map((tk) => card(sim, tk)).join('')}
        ${c.items.length > LIMIT ? `<div class="more">+${c.items.length - LIMIT}</div>` : ''}
      </div></div>`,
    )
    .join('');
}

// ---- settings form -------------------------------------------------

type Field = { key: keyof Config; label: string; min?: number; max?: number; step?: number; restart?: boolean };
const GROUPS: { title: string; icon: string; fields: Field[] }[] = [
  {
    title: 'Team and demand',
    icon: 'users',
    fields: [
      { key: 'devs', label: 'Devs on the team', min: 1, max: 8, step: 1, restart: true },
      { key: 'techLeads', label: 'Tech leads', min: 0, max: 2, step: 1, restart: true },
      { key: 'arrivalEveryDays', label: 'New demand every (days)', min: 0.1, max: 30, step: 0.1 },
      { key: 'dailyHour', label: 'Daily start time', min: 9, max: 17, step: 0.5 },
      { key: 'dailyHours', label: 'Daily duration (h)', min: 0, max: 4, step: 0.25 },
      { key: 'pickOnlyAtDaily', label: 'New tasks only pulled at the daily' },
      { key: 'refineHours', label: 'Refinement duration (h)', min: 0.5, max: 8, step: 0.5 },
      { key: 'refineBatch', label: 'Items per refinement', min: 1, max: 10, step: 1 },
    ],
  },
  {
    title: 'Development (working days)',
    icon: 'code',
    fields: [
      { key: 'devDaysMin', label: 'Feature size min (days, for a mid-level dev)', min: 0.25, max: 30, step: 0.25 },
      { key: 'devDaysMax', label: 'Feature size max (days, for a mid-level dev)', min: 0.25, max: 30, step: 0.25 },
    ],
  },
  {
    title: 'Code review',
    icon: 'magnifying-glass',
    fields: [
      { key: 'devApprovals', label: 'Dev approvals per PR', min: 0, max: 7, step: 1 },
      { key: 'techLeadApprovals', label: 'Tech lead approvals per PR', min: 0, max: 2, step: 1 },
      { key: 'reviewWaitDaysMin', label: 'Dev pickup delay, min (days)', min: 0, max: 10, step: 0.1 },
      { key: 'reviewWaitDaysMax', label: 'Dev pickup delay, max (days)', min: 0, max: 10, step: 0.1 },
      { key: 'tlReviewWaitDaysMin', label: 'TL pickup delay, min (days)', min: 0, max: 10, step: 0.1 },
      { key: 'tlReviewWaitDaysMax', label: 'TL pickup delay, max (days)', min: 0, max: 10, step: 0.1 },
      { key: 'reviewEffortHours', label: 'Review effort (h)', min: 0.25, max: 8, step: 0.25 },
      { key: 'refactorPctMin', label: 'Refactor min (% of effort)', min: 0, max: 200, step: 5 },
      { key: 'refactorPctMax', label: 'Refactor max (% of effort)', min: 0, max: 200, step: 5 },
    ],
  },
  {
    title: 'Main and merge',
    icon: 'code-branch',
    fields: [
      { key: 'maxMainPRs', label: 'Max PRs on main before deploy (0 = no limit)', min: 0, max: 50, step: 1 },
      { key: 'conflictPct', label: '% conflict per open PR on each merge', min: 0, max: 100, step: 1 },
      { key: 'conflictHoursMin', label: 'Resolve conflict, min (h)', min: 0.25, max: 40, step: 0.25 },
      { key: 'conflictHoursMax', label: 'Resolve conflict, max (h)', min: 0.25, max: 40, step: 0.25 },
    ],
  },
  {
    title: 'Deploy',
    icon: 'rocket',
    fields: [
      { key: 'envs', label: 'Environments in order (comma-separated)', restart: true },
      { key: 'prodEnvCount', label: 'How many of the last are production', min: 1, max: 6, step: 1, restart: true },
      { key: 'envsPerDay', label: 'Environments deployed per day', min: 1, max: 6, step: 1 },
      { key: 'canaryHoursMin', label: 'Canary min (h)', min: 0.5, max: 24, step: 0.5 },
      { key: 'canaryHoursMax', label: 'Canary max (h, up to 24)', min: 0.5, max: 24, step: 0.5 },
      { key: 'canaryFailPct', label: '% canary failure', min: 0, max: 100, step: 1 },
      { key: 'deployAtNight', label: 'Deploy only in night window (1 dev on call)' },
      { key: 'deployHour', label: 'Window start (h)', min: 18, max: 23.5, step: 0.5 },
      { key: 'deployHoursMin', label: 'Dev stays late, min (h)', min: 0.5, max: 8, step: 0.5 },
      { key: 'deployHoursMax', label: 'Dev stays late, max (h)', min: 0.5, max: 8, step: 0.5 },
      { key: 'deployOnFriday', label: 'Allow Friday deploys (default: Mon–Thu)' },
    ],
  },
  {
    title: 'Production bugs',
    icon: 'bug',
    fields: [
      { key: 'bugMaxDaysAfter', label: 'Bug appears up to N days after deploy', min: 0, max: 30, step: 0.5 },
      { key: 'bugSwarmDevs', label: 'Devs who drop everything to help', min: 1, max: 8, step: 1 },
      { key: 'bugFixHoursMin', label: 'Fix effort, min (dev-hours)', min: 0.5, max: 80, step: 0.5 },
      { key: 'bugFixHoursMax', label: 'Fix effort, max (dev-hours)', min: 0.5, max: 80, step: 0.5 },
      { key: 'hotfixHours', label: 'Hotfix rollout to production (h)', min: 0.25, max: 24, step: 0.25 },
      { key: 'seed', label: 'Random seed', min: 1, max: 999999, step: 1, restart: true },
    ],
  },
];

export function buildConfigForm(cfg: Config, onChange: (restart: boolean) => void) {
  const form = $('configForm');
  form.innerHTML = GROUPS.map(
    (g) => `<fieldset><legend>${ic(g.icon)} ${g.title}</legend>${g.fields
      .map((f) => {
        const v = cfg[f.key];
        if (typeof v === 'boolean')
          return `<label class="field"><span>${f.label}</span><input type="checkbox" name="${f.key}" ${v ? 'checked' : ''}></label>`;
        if (Array.isArray(v))
          return `<label class="field wide"><span>${f.label}</span><input type="text" name="${f.key}" value="${esc(v.join(', '))}"></label>`;
        return `<label class="field"><span>${f.label}</span><input type="number" name="${f.key}" value="${v}" min="${f.min}" max="${f.max}" step="${f.step}"></label>`;
      })
      .join('')}</fieldset>`,
  ).join('');

  form.addEventListener('change', (ev) => {
    const input = ev.target as HTMLInputElement;
    const field = GROUPS.flatMap((g) => g.fields).find((f) => f.key === input.name);
    if (!field) return;
    const c = cfg as unknown as Record<string, unknown>;
    if (input.type === 'checkbox') c[field.key] = input.checked;
    else if (input.type === 'text') {
      const envs = input.value.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 6);
      c[field.key] = envs.length ? envs : ['prod'];
      input.value = (c[field.key] as string[]).join(', ');
    } else {
      const n = Math.min(field.max ?? Infinity, Math.max(field.min ?? -Infinity, Number(input.value)));
      if (Number.isNaN(n)) return;
      c[field.key] = n;
      input.value = String(n);
    }
    onChange(!!field.restart);
  });
}

// ---- per-developer profiles ---------------------------------------------------

const LEVELS: Level[] = ['junior', 'mid', 'senior'];
const PROFILE_FIELDS: { key: keyof DevProfile; label: string; title: string; min: number; max: number; step: number }[] = [
  { key: 'daysPerFeature', label: 'days/feature', title: 'Average working days this dev takes to build a feature', min: 0.25, max: 30, step: 0.25 },
  { key: 'commentPct', label: 'comments %', title: '% of reviews of this dev’s PRs that flag an issue (refactor needed)', min: 0, max: 100, step: 1 },
  { key: 'bugPct', label: 'bugs %', title: '% of this dev’s deliveries that cause a production bug', min: 0, max: 100, step: 1 },
  { key: 'reviewPickup', label: 'pickup ×', title: 'Multiplier on how long this dev takes to pick up a review (1 = normal, 0.5 = twice as fast)', min: 0.1, max: 5, step: 0.1 },
];

/** Makes sure there is a full profile for every dev slot. */
export function normalizeProfiles(cfg: Config) {
  cfg.devProfiles = Array.from({ length: MAX_DEVS }, (_, i) => ({ ...defaultProfile(i), ...(cfg.devProfiles[i] ?? {}) }));
}

export function renderTeamEditor(cfg: Config) {
  const n = Math.min(cfg.devs, MAX_DEVS);
  $('teamEditor').innerHTML = `<fieldset><legend>${ic('user-gear')} Developers</legend>
    ${cfg.devProfiles
      .slice(0, n)
      .map(
        (p, i) => `<div class="devrow" data-i="${i}">
          <div class="r1">
            <input type="text" name="name" value="${esc(p.name)}" maxlength="14" aria-label="Name">
            <select name="level" aria-label="Level">${LEVELS.map((l) => `<option value="${l}" ${l === p.level ? 'selected' : ''}>${l}</option>`).join('')}</select>
          </div>
          <div class="r2">${PROFILE_FIELDS.map(
            (f) => `<label title="${esc(f.title)}"><span>${f.label}</span><input type="number" name="${f.key}" value="${p[f.key]}" min="${f.min}" max="${f.max}" step="${f.step}"></label>`,
          ).join('')}</div>
        </div>`,
      )
      .join('')}
    <p class="hint">Picking a level fills in typical values; tweak any field. The feature size range below is calibrated for a mid-level dev.</p>
  </fieldset>`;
}

export function setupTeamEditor(cfg: Config, onChange: () => void) {
  const el = $('teamEditor');
  el.addEventListener('change', (ev) => {
    const input = ev.target as HTMLInputElement | HTMLSelectElement;
    const row = input.closest<HTMLElement>('.devrow');
    if (!row) return;
    const p = cfg.devProfiles[Number(row.dataset.i)];
    if (input.name === 'name') p.name = input.value.trim() || p.name;
    else if (input.name === 'level') {
      p.level = input.value as Level;
      Object.assign(p, LEVEL_PRESETS[p.level]);
      renderTeamEditor(cfg);
    } else {
      const f = PROFILE_FIELDS.find((x) => x.key === input.name);
      if (!f) return;
      const n = Math.min(f.max, Math.max(f.min, Number(input.value)));
      if (Number.isNaN(n)) return;
      (p as unknown as Record<string, number>)[f.key] = n;
      input.value = String(n);
    }
    onChange();
  });
  renderTeamEditor(cfg);
}

/** Per-dev results, so the effect of each profile is visible. */
export function renderTeam(sim: Sim) {
  const since = sim.t - 30 * 24;
  const rows = sim.devs
    .filter((d) => d.role === 'dev')
    .map((d) => {
      const p = sim.profile(d.id);
      const done = sim.tickets.filter((tk) => tk.kind === 'feature' && tk.author === d.id && tk.doneAt != null && tk.doneAt >= since);
      const devDays = done.length ? done.reduce((s, tk) => s + (tk.time.doing ?? 0), 0) / done.length / 24 : 0;
      const comments = done.length ? done.reduce((s, tk) => s + tk.comments, 0) / done.length : 0;
      const bugs = sim.tickets.filter((tk) => tk.kind === 'bug' && tk.createdAt >= since && sim.ticket(tk.parentId)?.author === d.id).length;
      return `<tr><td>${esc(d.name)}</td><td><span class="lvl ${p.level}">${p.level}</span></td><td>${done.length}</td><td>${done.length ? devDays.toFixed(1) + 'd' : '–'}</td><td>${done.length ? comments.toFixed(1) : '–'}</td><td>${bugs}</td></tr>`;
    })
    .join('');
  $('team').innerHTML = `<table class="team"><thead><tr><th>Dev</th><th>Level</th><th title="Features delivered (30d)">${ic('truck-fast')}</th><th title="Avg time in development">${ic('code')}</th><th title="Review comments per delivery">${ic('comment-dots')}</th><th title="Production bugs caused (30d)">${ic('bug')}</th></tr></thead><tbody>${rows}</tbody></table>`;
}
