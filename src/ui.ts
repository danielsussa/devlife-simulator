import { Config, formatClock, Sim, Ticket } from './sim';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
const days = (hours: number) => (hours < 24 ? `${hours.toFixed(0)}h` : `${(hours / 24).toFixed(1)}d`);
const SERIES = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--s7'];

export function renderClock(sim: Sim) {
  // largura fixa + status sempre presente (só some com visibility): a barra não pula
  $('clock').innerHTML = `${formatClock(sim.t)} <span class="off ${sim.working ? 'hide' : ''}">· fora do expediente</span>`;
}

export function renderMetrics(sim: Sim) {
  const m = sim.metrics(30);
  const total = m.stages.reduce((s, x) => s + x.days, 0);
  const top = m.stages.reduce((a, b) => (b.days > a.days ? b : a), m.stages[0]);
  $('metrics').innerHTML = `
    <div class="tiles">
      <div class="tile"><div class="v">${m.doneCount ? m.leadDays.toFixed(1) + 'd' : '–'}</div><div class="k">lead time médio (30d)</div></div>
      <div class="tile"><div class="v">${m.throughputWeek.toFixed(1)}</div><div class="k">entregas / semana</div></div>
      <div class="tile"><div class="v">${m.wip}</div><div class="k">WIP (em andamento)</div></div>
      <div class="tile"><div class="v">${m.doneCount ? Math.round(m.flowEfficiency * 100) + '%' : '–'}</div><div class="k">eficiência de fluxo</div></div>
      <div class="tile"><div class="v">${Math.round(m.devTime.idle * 100)}%</div><div class="k">devs ociosos (expediente)</div></div>
      <div class="tile"><div class="v">${Math.round(m.devTime.meetings * 100)}%</div><div class="k">em daily + refinamento</div></div>
      <div class="tile"><div class="v">${Math.round(m.devTime.reworkOfCoding * 100)}%</div><div class="k">do código é refatoração</div></div>
      <div class="tile"><div class="v">${m.commentsPerPR.toFixed(1)}</div><div class="k">apontamentos por entrega</div></div>
      <div class="tile ${m.openBugs ? 'alarm' : ''}"><div class="v">${m.openBugs ? '🐞 ' + m.openBugs : m.bugs}</div><div class="k">${m.openBugs ? 'bugs abertos agora!' : 'bugs em produção (30d)'}</div></div>
      <div class="tile"><div class="v">${m.mttrHours ? days(m.mttrHours) : '–'}</div><div class="k">tempo médio p/ corrigir bug</div></div>
      <div class="tile"><div class="v">${Math.round(m.devTime.bugfix * 100)}%</div><div class="k">do time apagando incêndio</div></div>
      <div class="tile"><div class="v">${m.nightHoursWeek.toFixed(1)}h</div><div class="k">de madrugada / semana</div></div>
      <div class="tile"><div class="v">${sim.deploySession ? '🌙 ' + sim.devs[sim.deploySession.devId].name : '–'}</div><div class="k">de plantão agora</div></div>
    </div>
    <div class="breakdown">
      <div class="title"><span>Onde a demanda passa o tempo</span><span>${m.doneCount} entregues</span></div>
      ${
        m.doneCount
          ? `<div class="bar">${m.stages
              .map((s, i) => `<div title="${s.label}: ${s.days.toFixed(1)}d" style="flex:${s.days / total};background:var(${SERIES[i]})"></div>`)
              .join('')}</div>
             <ul class="legend">${m.stages
               .map(
                 (s, i) =>
                   `<li class="${s === top ? 'top' : ''}"><i style="background:var(${SERIES[i]})"></i>${s.label}<b>${s.days.toFixed(1)}d</b></li>`,
               )
               .join('')}</ul>`
          : '<div class="more">Nenhuma entrega em produção ainda…</div>'
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
    .map((e) => `<li class="${e.kind}"><time>${formatClock(e.t).split(' · ').slice(1).join(' ')}</time>${esc(e.text)}</li>`)
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
          ? `🚨 ${tk.swarm.map((id) => sim.devs[id].name).join(', ')} · ${Math.floor((100 * tk.workDone) / tk.workTotal)}%`
          : `${dev} · ${Math.floor((100 * tk.workDone) / tk.workTotal)}%`;
      extra = `<div class="prog"><div style="width:${(100 * tk.workDone) / tk.workTotal}%"></div></div>`;
      break;
    case 'review': {
      const ok = (role: string) => tk.reviews.filter((r) => r.role === role && r.done).length;
      const need = (role: string) => tk.reviews.filter((r) => r.role === role).length;
      const names = tk.reviews.map((r) => (r.done ? '✔' : r.started ? '👀' : '·') + sim.devs[r.devId].name).join(' ');
      meta = [need('dev') ? `dev ${ok('dev')}/${need('dev')}` : '', need('techlead') ? `TL ${ok('techlead')}/${need('techlead')}` : '']
        .filter(Boolean)
        .join(' · ');
      if (tk.reviewRounds > 1) meta += ` · rodada ${tk.reviewRounds}`;
      extra = `<div class="m"><span>${names}</span></div>`;
      break;
    }
    case 'deploy': {
      const env = sim.envs[tk.envIndex];
      if (tk.hotfixEnds != null) {
        meta = `🚑 hotfix · faltam ${days(Math.max(0, tk.hotfixEnds - sim.t))}`;
      } else if (tk.deploying) {
        const p = (sim.t - env.startedAt) / (env.endsAt - env.startedAt);
        meta = `canary ${Math.round(p * 100)}% · faltam ${days(env.endsAt - sim.t)}`;
        extra = `<div class="prog canary"><div style="width:${p * 100}%"></div></div>`;
      } else meta = sim.cfg.deployAtNight ? `🌙 aguarda janela ${sim.cfg.deployHour}h` : '⏳ na fila';
      break;
    }
    case 'done':
      meta = `lead ${days(tk.doneAt! - tk.createdAt)}`;
      break;
    default:
      meta = dev ?? '';
  }
  const badges = [
    tk.kind === 'bug' ? '<span class="badge bug">🐞 prioridade máxima</span>' : '',
    tk.rework ? '<span class="badge">🔧 refatorando</span>' : '',
    tk.comments ? `<span class="badge">💬 ${tk.comments}</span>` : '', tk.rollbacks ? `<span class="badge">⚠ ${tk.rollbacks} rollback</span>` : '']
    .filter(Boolean)
    .join(' ');
  return `<div class="kcard ${tk.kind === 'bug' ? 'bug' : ''}" data-id="${tk.id}" style="border-color:${hex(tk.color)}">
    <div class="t"><b>#${tk.id}</b>${esc(tk.title)}</div>
    <div class="m"><span>${meta}</span><span>${tk.stage === 'done' ? '' : inStage}</span></div>
    ${badges ? `<div class="m">${badges}</div>` : ''}${extra}
  </div>`;
}

export function renderKanban(sim: Sim) {
  const cols: { title: string; items: Ticket[] }[] = [
    { title: 'Backlog', items: sim.inStage('backlog') },
    { title: 'Refinamento', items: sim.inStage('refining') },
    { title: 'Pronto p/ dev', items: sim.inStage('ready') },
    { title: 'Em dev', items: sim.inStage('doing') },
    { title: 'Code review', items: sim.inStage('review') },
    ...sim.envs.map((env, i) => ({
      title: `${sim.isProdEnv(i) ? '🏭 ' : 'Deploy '}${env.name}`,
      items: sim.tickets.filter((tk) => tk.stage === 'deploy' && tk.envIndex === i),
    })),
    {
      title: 'Entregue',
      items: sim.inStage('done').sort((a, b) => b.doneAt! - a.doneAt!),
    },
  ];
  const LIMIT = 25;
  const bugFirst = (a: Ticket, b: Ticket) => (a.kind === 'bug' ? 0 : 1) - (b.kind === 'bug' ? 0 : 1);
  for (const c of cols) if (c.title !== 'Entregue') c.items.sort(bugFirst);
  $('kanban').innerHTML = cols
    .map(
      (c) => `<div class="col"><h4>${c.title}<span>${c.items.length}</span></h4><div class="cards">
        ${c.items.slice(0, LIMIT).map((tk) => card(sim, tk)).join('')}
        ${c.items.length > LIMIT ? `<div class="more">+${c.items.length - LIMIT}</div>` : ''}
      </div></div>`,
    )
    .join('');
}

// ---- formulário de parâmetros -------------------------------------------------

type Field = { key: keyof Config; label: string; min?: number; max?: number; step?: number; restart?: boolean };
const GROUPS: { title: string; fields: Field[] }[] = [
  {
    title: 'Time e demanda',
    fields: [
      { key: 'devs', label: 'Devs no time', min: 1, max: 8, step: 1, restart: true },
      { key: 'techLeads', label: 'Tech leads', min: 0, max: 2, step: 1, restart: true },
      { key: 'arrivalEveryDays', label: 'Nova demanda a cada (dias)', min: 0.1, max: 30, step: 0.1 },
      { key: 'dailyHour', label: 'Horário da daily', min: 9, max: 17, step: 0.5 },
      { key: 'dailyHours', label: 'Duração da daily (h)', min: 0, max: 4, step: 0.25 },
      { key: 'pickOnlyAtDaily', label: 'Tarefa nova só é puxada na daily' },
      { key: 'refineHours', label: 'Duração do refinamento (h)', min: 0.5, max: 8, step: 0.5 },
      { key: 'refineBatch', label: 'Demandas por refinamento', min: 1, max: 10, step: 1 },
    ],
  },
  {
    title: 'Desenvolvimento (dias úteis)',
    fields: [
      { key: 'devDaysMin', label: 'Mínimo', min: 0.25, max: 30, step: 0.25 },
      { key: 'devDaysMax', label: 'Máximo', min: 0.25, max: 30, step: 0.25 },
    ],
  },
  {
    title: 'Code review',
    fields: [
      { key: 'devApprovals', label: 'Aprovações de dev por PR', min: 0, max: 7, step: 1 },
      { key: 'techLeadApprovals', label: 'Aprovações de tech lead por PR', min: 0, max: 2, step: 1 },
      { key: 'reviewWaitDaysMin', label: 'Dev demora p/ pegar, mín (dias)', min: 0, max: 10, step: 0.1 },
      { key: 'reviewWaitDaysMax', label: 'Dev demora p/ pegar, máx (dias)', min: 0, max: 10, step: 0.1 },
      { key: 'tlReviewWaitDaysMin', label: 'TL demora p/ pegar, mín (dias)', min: 0, max: 10, step: 0.1 },
      { key: 'tlReviewWaitDaysMax', label: 'TL demora p/ pegar, máx (dias)', min: 0, max: 10, step: 0.1 },
      { key: 'reviewEffortHours', label: 'Tempo revisando (h)', min: 0.25, max: 8, step: 0.25 },
      { key: 'changesRequestedPct', label: '% de revisões com apontamento', min: 0, max: 100, step: 1 },
      { key: 'refactorPctMin', label: 'Refatoração mín (% do esforço)', min: 0, max: 200, step: 5 },
      { key: 'refactorPctMax', label: 'Refatoração máx (% do esforço)', min: 0, max: 200, step: 5 },
    ],
  },
  {
    title: 'Deploy',
    fields: [
      { key: 'envs', label: 'Ambientes em ordem (separados por vírgula)', restart: true },
      { key: 'prodEnvCount', label: 'Quantos dos últimos são produção', min: 1, max: 6, step: 1, restart: true },
      { key: 'envsPerDay', label: 'Ambientes que recebem deploy por dia', min: 1, max: 6, step: 1 },
      { key: 'canaryHoursMin', label: 'Canary mínimo (h)', min: 0.5, max: 24, step: 0.5 },
      { key: 'canaryHoursMax', label: 'Canary máximo (h, até 24)', min: 0.5, max: 24, step: 0.5 },
      { key: 'canaryFailPct', label: '% canary falha', min: 0, max: 100, step: 1 },
      { key: 'deployAtNight', label: 'Deploy só na janela noturna (1 dev de plantão)' },
      { key: 'deployHour', label: 'Início da janela (h)', min: 18, max: 23.5, step: 0.5 },
      { key: 'deployHoursMin', label: 'Dev fica de madrugada, mín (h)', min: 0.5, max: 8, step: 0.5 },
      { key: 'deployHoursMax', label: 'Dev fica de madrugada, máx (h)', min: 0.5, max: 8, step: 0.5 },
      { key: 'deployOnFriday', label: 'Permite deploy na sexta à noite' },
    ],
  },
  {
    title: 'Bugs em produção',
    fields: [
      { key: 'bugPct', label: '% das entregas que dão bug', min: 0, max: 100, step: 1 },
      { key: 'bugMaxDaysAfter', label: 'Bug aparece até N dias após deploy', min: 0, max: 30, step: 0.5 },
      { key: 'bugSwarmDevs', label: 'Devs que param pra ajudar', min: 1, max: 8, step: 1 },
      { key: 'bugFixHoursMin', label: 'Esforço do fix, mín (horas-dev)', min: 0.5, max: 80, step: 0.5 },
      { key: 'bugFixHoursMax', label: 'Esforço do fix, máx (horas-dev)', min: 0.5, max: 80, step: 0.5 },
      { key: 'hotfixHours', label: 'Hotfix subindo em produção (h)', min: 0.25, max: 24, step: 0.25 },
      { key: 'seed', label: 'Seed aleatória', min: 1, max: 999999, step: 1, restart: true },
    ],
  },
];

export function buildConfigForm(cfg: Config, onChange: (restart: boolean) => void) {
  const form = $('configForm');
  form.innerHTML = GROUPS.map(
    (g) => `<fieldset><legend>${g.title}</legend>${g.fields
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
