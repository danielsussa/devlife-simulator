// Motor da simulação: puro TypeScript, sem nada de renderização.
// Unidade de tempo: horas. t=0 é segunda-feira 00:00.

export interface Config {
  seed: number;
  devs: number;
  techLeads: number; // não puxam feature: revisam, refinam, vão na daily
  devApprovals: number; // aprovações de dev exigidas por PR
  techLeadApprovals: number; // aprovações de tech lead exigidas por PR
  arrivalEveryDays: number; // intervalo médio (dias corridos) entre demandas novas
  dailyHour: number; // hora de início da daily
  dailyHours: number;
  pickOnlyAtDaily: boolean; // tarefa nova só é puxada na daily
  refineHours: number; // duração da reunião de refinamento (horas úteis)
  refineBatch: number; // quantas demandas cada refinamento cobre
  devDaysMin: number; // dias úteis de desenvolvimento
  devDaysMax: number;
  reviewWaitDaysMin: number; // dias úteis até cada revisor pegar a PR
  reviewWaitDaysMax: number;
  tlReviewWaitDaysMin: number; // dias úteis até o tech lead pegar a PR
  tlReviewWaitDaysMax: number;
  reviewEffortHours: number; // tempo que o revisor gasta revisando
  changesRequestedPct: number; // % de revisões em que o colega aponta um item
  refactorPctMin: number; // refatoração custa X% do esforço original da feature
  refactorPctMax: number;
  envs: string[];
  prodEnvCount: number; // os últimos N ambientes são produção (P1, P2, P3)
  envsPerDay: number; // quantos ambientes podem receber deploy por dia
  canaryHoursMin: number; // canary por ambiente (máx 24h)
  canaryHoursMax: number;
  canaryFailPct: number;
  deployAtNight: boolean; // deploy só na janela noturna, feito por 1 dev de plantão
  deployHour: number; // início da janela (ex.: 22h)
  deployHoursMin: number; // quanto tempo o dev fica de madrugada
  deployHoursMax: number;
  deployOnFriday: boolean;
  bugPct: number; // % das features entregues que dão bug em produção
  bugMaxDaysAfter: number; // bug aparece entre o deploy e N dias depois
  bugSwarmDevs: number; // quantos devs largam tudo pra ajudar no bug
  bugFixHoursMin: number; // esforço total do fix (horas-dev, dividido entre o mutirão)
  bugFixHoursMax: number;
  hotfixHours: number; // tempo do hotfix subindo direto em produção
}

export const defaultConfig: Config = {
  seed: 42,
  devs: 5,
  techLeads: 1,
  devApprovals: 1,
  techLeadApprovals: 1,
  arrivalEveryDays: 1.2,
  dailyHour: 9,
  dailyHours: 1,
  pickOnlyAtDaily: true,
  refineHours: 2,
  refineBatch: 3,
  devDaysMin: 1,
  devDaysMax: 5,
  reviewWaitDaysMin: 0.2,
  reviewWaitDaysMax: 2,
  tlReviewWaitDaysMin: 0.1,
  tlReviewWaitDaysMax: 1,
  reviewEffortHours: 1,
  changesRequestedPct: 20,
  refactorPctMin: 15,
  refactorPctMax: 40,
  envs: ['P1', 'P2', 'P3'],
  prodEnvCount: 3,
  envsPerDay: 1,
  canaryHoursMin: 4,
  canaryHoursMax: 24,
  canaryFailPct: 8,
  deployAtNight: true,
  deployHour: 22,
  deployHoursMin: 1,
  deployHoursMax: 3,
  deployOnFriday: false,
  bugPct: 15,
  bugMaxDaysAfter: 5,
  bugSwarmDevs: 2,
  bugFixHoursMin: 3,
  bugFixHoursMax: 12,
  hotfixHours: 1,
};

export const DAY_START = 9;
export const DAY_END = 18;
export const WORK_HOURS_PER_DAY = DAY_END - DAY_START;
const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export function isWorkingTime(t: number): boolean {
  const day = Math.floor(t / 24);
  const h = t - day * 24;
  return day % 7 < 5 && h >= DAY_START && h < DAY_END;
}

function days(hours: number) {
  return hours < 24 ? `${hours.toFixed(1)}h` : `${(hours / 24).toFixed(1)}d`;
}

function emptyHours(): Record<Activity, number> {
  return { away: 0, deploying: 0, bugfix: 0, daily: 0, idle: 0, coding: 0, meeting: 0, reviewing: 0 };
}

function clock(t: number) {
  const h = t % 24;
  return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
}

/** Início (09:00) do próximo dia útil depois de t. */
function nextWorkdayStart(t: number) {
  for (let d = Math.floor(t / 24); ; d++) if (d % 7 < 5 && d * 24 + DAY_START >= t) return d * 24 + DAY_START;
}

export function formatClock(t: number): string {
  const day = Math.floor(t / 24);
  const h = Math.floor(t - day * 24);
  const m = Math.floor((t - day * 24 - h) * 60);
  return `${WEEKDAYS[day % 7]} · dia ${day + 1} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export type Stage = 'backlog' | 'refining' | 'ready' | 'doing' | 'review' | 'deploy' | 'done';
export type Activity = 'away' | 'deploying' | 'bugfix' | 'daily' | 'idle' | 'coding' | 'meeting' | 'reviewing';

export type Role = 'dev' | 'techlead';

export interface Review {
  devId: number;
  role: Role;
  dueWork: number; // relógio de horas úteis em que o revisor pega a PR
  started: boolean;
  done: boolean;
}

export interface Ticket {
  id: number;
  kind: 'feature' | 'bug';
  parentId: number | null; // bug: feature que causou
  bugAt: number | null; // feature: quando o bug vai aparecer em produção (se tiver)
  swarm: number[]; // bug: devs no mutirão
  hotfixEnds: number | null;
  title: string;
  color: number;
  stage: Stage;
  createdAt: number;
  enteredAt: number;
  time: Record<string, number>; // horas corridas por etapa (deploy por ambiente: "deploy:0")
  activeHours: number; // horas em que alguém realmente trabalhou nela
  author: number | null;
  devId: number | null;
  workOriginal: number;
  workTotal: number;
  workDone: number;
  reviews: Review[];
  reviewRounds: number;
  rework: boolean;
  envIndex: number;
  deploying: boolean;
  rollbacks: number;
  comments: number; // apontamentos recebidos em review
  reworkHours: number; // horas gastas refatorando/corrigindo
  doneAt: number | null;
}

export interface Dev {
  id: number;
  name: string;
  role: Role;
  ticketId: number | null; // feature que está codando (pode estar pausada)
  pausedTicketId: number | null; // feature interrompida pra refatorar outra
  reviewTicketId: number | null;
  reviewLeft: number;
  inMeeting: boolean;
  offUntil: number; // compensando horas de deploy noturno: só chega nesse horário
  bugId: number | null; // no mutirão de um bug (larga o resto)
}

export interface DeploySession {
  devId: number;
  start: number;
  end: number;
  envs: Set<string>;
}

export interface Env {
  name: string;
  batch: number[];
  startedAt: number;
  endsAt: number;
  fail: boolean;
  result: 'ok' | 'fail' | null;
  resultAt: number;
}

export interface Meeting {
  endsWork: number;
  devIds: number[];
  ticketIds: number[];
}

export type EventKind = 'info' | 'good' | 'bad' | 'warn' | 'review-ok' | 'review-changes';

export interface SimEvent {
  t: number;
  kind: EventKind;
  text: string;
  devId?: number;
  ticketId?: number;
}

const DEV_NAMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gabi', 'Hugo', 'Iara'];
const TL_NAMES = ['Rita', 'Otávio', 'Lúcia'];
export const MAX_PEOPLE = 9; // mesas no escritório
const FEATURES = [
  'Login com SSO', 'Exportar CSV', 'Dark mode', 'Webhook de pagamento', 'Filtro avançado',
  'Notificação push', 'Cache de catálogo', 'Busca por voz', 'Tela de onboarding', 'Relatório mensal',
  'Cupom de desconto', 'Upload em lote', 'Auditoria de acesso', 'Integração Pix', 'Feature flag UI',
  'Rate limit API', 'Checkout 1-clique', 'Multi-idioma', 'Chat de suporte', 'Painel de métricas',
  'Recuperar senha', 'Agendar envio', 'Importar planilha', 'Histórico de pedidos', 'Avaliação 5 estrelas',
];
const TICKET_COLORS = [0x3987e5, 0xd95926, 0x199e70, 0xc98500, 0xd55181, 0x2fa52f, 0x9085e9, 0xe66767];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function stageKey(tk: Ticket): string {
  return tk.stage === 'deploy' ? `deploy:${tk.envIndex}` : tk.stage;
}

export class Sim {
  t = 0;
  work = 0; // horas úteis acumuladas
  tickets: Ticket[] = [];
  devs: Dev[] = [];
  envs: Env[] = [];
  meeting: Meeting | null = null;
  devHours = emptyHours();
  deploySession: DeploySession | null = null;
  nightHours = 0; // horas de madrugada acumuladas em deploys
  private lastDeployNight = -1;
  private deployDay = -1; // "dia de deploy" corrente (a janela noturna conta pro dia em que começou)
  private envsDeployedToday = 0;
  private rotation = 0;
  events: SimEvent[] = [];
  onEvent: ((e: SimEvent) => void) | null = null;
  private rand: () => number = Math.random;
  private nextArrival = 0;
  private nextId = 1;

  constructor(public cfg: Config) {
    this.reset();
  }

  reset() {
    this.rand = mulberry32(this.cfg.seed);
    this.t = 8; // segunda, 08:00
    this.work = 0;
    this.tickets = [];
    this.meeting = null;
    this.events = [];
    this.nextId = 1;
    this.devHours = emptyHours();
    this.deploySession = null;
    this.nightHours = 0;
    this.lastDeployNight = -1;
    this.deployDay = -1;
    this.envsDeployedToday = 0;
    this.rotation = 0;
    const tls = Math.min(this.cfg.techLeads, MAX_PEOPLE - 1);
    const devs = Math.max(1, Math.min(this.cfg.devs, MAX_PEOPLE - tls));
    this.devs = Array.from({ length: devs + tls }, (_, i) => ({
      id: i,
      role: i < devs ? ('dev' as const) : ('techlead' as const),
      name: i < devs ? DEV_NAMES[i % DEV_NAMES.length] : `${TL_NAMES[(i - devs) % TL_NAMES.length]} (TL)`,
      ticketId: null,
      reviewTicketId: null,
      reviewLeft: 0,
      inMeeting: false,
      pausedTicketId: null,
      offUntil: 0,
      bugId: null,
    }));
    this.envs = this.cfg.envs.map((name) => ({
      name, batch: [], startedAt: 0, endsAt: 0, fail: false, result: null, resultAt: -1,
    }));
    for (let i = 0; i < 4; i++) this.spawn();
    this.nextArrival = this.t + this.expo(this.cfg.arrivalEveryDays * 24);
  }

  /** Índice do primeiro ambiente de produção (P1). */
  get firstProdEnv() {
    return Math.max(0, this.envs.length - Math.max(1, this.cfg.prodEnvCount));
  }

  isProdEnv(i: number) {
    return i >= this.firstProdEnv;
  }

  get working() {
    return isWorkingTime(this.t);
  }

  get inDaily() {
    const h = this.t % 24;
    return this.working && h >= this.cfg.dailyHour && h < this.cfg.dailyHour + this.cfg.dailyHours;
  }

  ticket(id: number | null | undefined): Ticket | undefined {
    return id == null ? undefined : this.tickets.find((tk) => tk.id === id);
  }

  activity(dev: Dev): Activity {
    if (this.deploySession?.devId === dev.id) return 'deploying';
    if (!this.working || this.t < dev.offUntil) return 'away';
    if (dev.bugId != null) return 'bugfix';
    if (this.inDaily) return 'daily';
    if (dev.inMeeting) return 'meeting';
    if (dev.reviewTicketId != null) return 'reviewing';
    if (dev.ticketId != null) return 'coding';
    return 'idle';
  }

  inStage(stage: Stage) {
    return this.tickets.filter((tk) => tk.stage === stage);
  }

  step(hours: number) {
    let left = hours;
    while (left > 1e-9) {
      const h = Math.min(0.1, left);
      this.tick(h);
      left -= h;
    }
  }

  // ---- núcleo -------------------------------------------------------------

  private tick(h: number) {
    const wasWorking = this.working;
    const wasDaily = this.inDaily;
    this.t += h;
    const working = this.working;
    if (working) this.work += h;
    if (working && !wasWorking) this.emit('info', 'Bom dia! Time chegando no escritório.');
    if (!working && wasWorking) this.emit('info', 'Fim do expediente. Só o canary trabalha à noite.');
    if (this.inDaily && !wasDaily) this.emit('info', 'Daily: time reunido no quadro pra puxar tarefas');
    if (working) for (const d of this.devs) if (d.role === 'dev') this.devHours[this.activity(d)] += h;

    while (this.t >= this.nextArrival) {
      const tk = this.spawn();
      this.emit('info', `Nova demanda #${tk.id} "${tk.title}" chegou no backlog`, { ticketId: tk.id });
      this.nextArrival += this.expo(this.cfg.arrivalEveryDays * 24);
    }

    if (working) {
      this.updateMeeting();
      this.formSwarms();
      this.updateBugs(h);
      this.updateCoding(h);
      this.updateReviews(h);
      this.assignWork();
      this.maybeStartMeeting();
    }
    this.detectBugs();
    this.updateDeploySession(h);
    this.updateDeploys();
  }

  private spawn(): Ticket {
    const id = this.nextId++;
    const tk: Ticket = {
      id,
      title: FEATURES[Math.floor(this.rand() * FEATURES.length)],
      color: TICKET_COLORS[id % TICKET_COLORS.length],
      stage: 'backlog',
      createdAt: this.t,
      enteredAt: this.t,
      time: {},
      activeHours: 0,
      author: null,
      devId: null,
      workOriginal: 0,
      workTotal: 0,
      workDone: 0,
      reviews: [],
      reviewRounds: 0,
      rework: false,
      envIndex: 0,
      deploying: false,
      rollbacks: 0,
      comments: 0,
      reworkHours: 0,
      doneAt: null,
      kind: 'feature',
      parentId: null,
      bugAt: null,
      swarm: [],
      hotfixEnds: null,
    };
    this.tickets.push(tk);
    return tk;
  }

  private move(tk: Ticket, change: () => void) {
    const key = stageKey(tk);
    tk.time[key] = (tk.time[key] ?? 0) + (this.t - tk.enteredAt);
    change();
    tk.enteredAt = this.t;
  }

  private updateMeeting() {
    const m = this.meeting;
    if (!m || this.work < m.endsWork) return;
    for (const id of m.ticketIds) {
      const tk = this.ticket(id)!;
      this.move(tk, () => {
        tk.stage = 'ready';
        const days = this.uniform(this.cfg.devDaysMin, this.cfg.devDaysMax);
        tk.workOriginal = tk.workTotal = days * WORK_HOURS_PER_DAY;
      });
    }
    for (const id of m.devIds) this.devs[id].inMeeting = false;
    this.emit('good', `Refinamento concluído: ${m.ticketIds.map((i) => '#' + i).join(', ')} prontas pra dev`);
    this.meeting = null;
  }

  private maybeStartMeeting() {
    if (this.meeting || this.inDaily) return;
    const backlog = this.inStage('backlog');
    if (!backlog.length) return;
    const ready = this.tickets.filter((tk) => tk.stage === 'ready' && !tk.rework && tk.kind === 'feature').length;
    if (ready >= Math.max(2, Math.ceil(this.devs.length / 2))) return;

    let people = this.devs.filter((d) => this.activity(d) === 'idle');
    if (!people.length && ready === 0) {
      // Ninguém livre e nada pronto: alguém para de codar pra refinar.
      const coder = this.devs.find((d) => this.activity(d) === 'coding');
      if (coder) people = [coder];
    }
    if (!people.length) return;
    people = people.slice(0, 3);

    const items = backlog.slice(0, this.cfg.refineBatch);
    for (const tk of items) this.move(tk, () => (tk.stage = 'refining'));
    for (const d of people) d.inMeeting = true;
    this.meeting = {
      endsWork: this.work + this.cfg.refineHours,
      devIds: people.map((d) => d.id),
      ticketIds: items.map((tk) => tk.id),
    };
    this.emit('info', `Refinamento com PO e ${people.map((d) => d.name).join(', ')} (${items.length} demandas)`);
  }

  private assignWork() {
    // Tarefa nova só sai do quadro na daily; ajuste (rework) o autor puxa na hora.
    const canPickNew = !this.cfg.pickOnlyAtDaily || this.inDaily;
    for (const dev of this.devs) {
      if (dev.role !== 'dev') continue;
      const act = this.activity(dev);
      if (dev.ticketId != null || dev.reviewTicketId != null || dev.inMeeting) continue;
      if (act !== 'idle' && act !== 'daily') continue;
      const ready = this.inStage('ready').filter((x) => x.kind === 'feature');
      const missedDaily = dev.offUntil > Math.floor(this.t / 24) * 24 + this.cfg.dailyHour;
      const tk =
        ready.find((x) => x.rework && x.author === dev.id) ??
        ready.find((x) => x.rework) ??
        (canPickNew || missedDaily ? ready[0] : undefined);
      if (!tk) continue;
      this.move(tk, () => {
        tk.stage = 'doing';
        tk.devId = dev.id;
        if (tk.author == null) tk.author = dev.id;
      });
      dev.ticketId = tk.id;
      this.emit('info', `${dev.name} começou ${tk.rework ? 'o ajuste da' : 'a'} #${tk.id}`, { devId: dev.id, ticketId: tk.id });
    }
  }

  private updateCoding(h: number) {
    for (const dev of this.devs) {
      if (this.activity(dev) !== 'coding') continue;
      const tk = this.ticket(dev.ticketId)!;
      tk.workDone += h;
      tk.activeHours += h;
      if (tk.rework) tk.reworkHours += h;
      if (tk.workDone >= tk.workTotal) {
        // terminou: volta pra feature que tinha sido interrompida, se houver
        dev.ticketId = dev.pausedTicketId;
        dev.pausedTicketId = null;
        this.openPR(tk);
        if (dev.ticketId != null) this.emit('info', `${dev.name} voltou pra #${dev.ticketId}`, { devId: dev.id, ticketId: dev.ticketId });
      }
    }
  }

  private openPR(tk: Ticket) {
    const pool = (role: Role, n: number) =>
      this.shuffle(this.devs.filter((d) => d.role === role && d.id !== tk.devId)).slice(0, n);
    const picked = [...pool('dev', this.cfg.devApprovals), ...pool('techlead', this.cfg.techLeadApprovals)];
    const k = picked.length;
    this.move(tk, () => {
      tk.stage = 'review';
      tk.rework = false;
      tk.reviewRounds++;
      const urgent = tk.kind === 'bug'; // review prioritário: revisor pega na hora
      tk.reviews = picked.map((d) => ({
        devId: d.id,
        role: d.role,
        dueWork: urgent
          ? this.work
          : this.work +
          (d.role === 'techlead'
            ? this.uniform(this.cfg.tlReviewWaitDaysMin, this.cfg.tlReviewWaitDaysMax)
            : this.uniform(this.cfg.reviewWaitDaysMin, this.cfg.reviewWaitDaysMax)) *
            WORK_HOURS_PER_DAY,
        started: false,
        done: false,
      }));
    });
    const author = this.devs[tk.devId!];
    this.emit(tk.kind === 'bug' ? 'warn' : 'info', `${author.name} abriu a PR ${tk.kind === 'bug' ? '🚑 de hotfix ' : ''}#${tk.id}${k ? ` (revisores: ${picked.map((d) => d.name).join(', ')})` : ''}`, {
      devId: author.id,
      ticketId: tk.id,
    });
    if (k === 0) this.merge(tk);
  }

  private updateReviews(h: number) {
    // Revisões em andamento
    for (const dev of this.devs) {
      if (this.activity(dev) !== 'reviewing') continue;
      dev.reviewLeft -= h;
      const tk = this.ticket(dev.reviewTicketId)!;
      tk.activeHours += h;
      if (dev.reviewLeft > 0) continue;
      dev.reviewTicketId = null;
      const rv = tk.reviews.find((r) => r.devId === dev.id && r.started && !r.done);
      if (!rv) continue;
      if (tk.kind === 'feature' && this.rand() * 100 < this.cfg.changesRequestedPct) {
        tk.comments++;
        const hours = this.reworkHoursFor(tk, this.cfg.refactorPctMin / 100, this.cfg.refactorPctMax / 100);
        this.emit('review-changes', `${dev.name} apontou um item na PR #${tk.id}: refatoração de ~${hours.toFixed(0)}h`, {
          devId: dev.id,
          ticketId: tk.id,
        });
        this.sendBack(tk, hours);
      } else {
        rv.done = true;
        this.emit('review-ok', `${dev.name} aprovou a PR #${tk.id}`, { devId: dev.id, ticketId: tk.id });
        if (tk.reviews.every((r) => r.done)) this.merge(tk);
      }
    }
    // Revisores pegando PRs que chegaram na vez deles
    const queue = this.inStage('review').sort((a, b) => (a.kind === 'bug' ? 0 : 1) - (b.kind === 'bug' ? 0 : 1));
    for (const tk of queue) {
      for (const rv of tk.reviews) {
        if (rv.started || rv.done || this.work < rv.dueWork) continue;
        const dev = this.devs[rv.devId];
        const act = this.activity(dev);
        if (act === 'meeting' || act === 'reviewing' || act === 'away') continue;
        rv.started = true;
        dev.reviewTicketId = tk.id;
        dev.reviewLeft = this.cfg.reviewEffortHours;
      }
    }
  }

  /**
   * Volta a ticket pro autor como retrabalho (apontamento no review ou bug no canary).
   * O autor interrompe a feature atual, refatora e depois retoma. Se ele já estiver
   * com uma feature pausada, o ajuste vai pra fila "pronto p/ dev".
   */
  private sendBack(tk: Ticket, hours: number) {
    for (const d of this.devs) if (d.reviewTicketId === tk.id) d.reviewTicketId = null;
    const author = tk.author != null ? this.devs[tk.author] : undefined;
    const direct = !!author && (author.ticketId == null || author.pausedTicketId == null);
    this.move(tk, () => {
      tk.stage = direct ? 'doing' : 'ready';
      tk.rework = true;
      tk.devId = direct ? author!.id : null;
      tk.reviews = [];
      tk.deploying = false;
      tk.envIndex = 0;
      tk.workDone = 0;
      tk.workTotal = hours;
    });
    if (direct) {
      if (author!.ticketId != null) {
        author!.pausedTicketId = author!.ticketId;
        this.emit('warn', `${author!.name} pausou #${author!.ticketId} pra refatorar #${tk.id}`, { devId: author!.id, ticketId: tk.id });
      }
      author!.ticketId = tk.id;
    }
  }

  private reworkHoursFor(tk: Ticket, minFrac: number, maxFrac: number) {
    return Math.max(1, tk.workOriginal * this.uniform(minFrac, maxFrac));
  }

  private merge(tk: Ticket) {
    if (tk.kind === 'bug') {
      // hotfix: direto em produção, fora da janela noturna
      this.move(tk, () => {
        tk.stage = 'deploy';
        tk.envIndex = this.envs.length - 1;
        tk.deploying = true;
        tk.devId = null;
        tk.hotfixEnds = this.t + this.cfg.hotfixHours;
      });
      const prod = this.envs.slice(this.firstProdEnv).map((e) => e.name).join(', ');
      this.emit('warn', `🚑 Hotfix #${tk.id} aprovado, subindo direto em ${prod} (fora da regra de 1 ambiente/dia)`, { ticketId: tk.id });
      return;
    }
    this.move(tk, () => {
      tk.stage = 'deploy';
      tk.envIndex = 0;
      tk.deploying = false;
      tk.devId = null;
    });
    this.emit('good', `PR #${tk.id} mergeada na main`, { ticketId: tk.id });
  }

  private updateDeploys() {
    for (const tk of this.tickets) {
      if (tk.hotfixEnds == null || tk.stage !== 'deploy' || this.t < tk.hotfixEnds) continue;
      this.move(tk, () => {
        tk.stage = 'done';
        tk.doneAt = this.t;
        tk.deploying = false;
      });
      this.emit('good', `✅ Bug #${tk.id} corrigido em produção (${days(tk.doneAt! - tk.createdAt)} desde que apareceu)`, { ticketId: tk.id });
    }
    this.envs.forEach((env, i) => {
      if (env.batch.length && this.t >= env.endsAt) {
        const batch = env.batch.map((id) => this.ticket(id)!);
        env.batch = [];
        env.result = env.fail ? 'fail' : 'ok';
        env.resultAt = this.t;
        if (env.fail) {
          const culprit = batch[Math.floor(this.rand() * batch.length)];
          culprit.rollbacks++;
          for (const tk of batch) tk.deploying = false;
          this.emit('bad', `Canary falhou em ${env.name}! Rollback. #${culprit.id} volta pra correção`, { ticketId: culprit.id });
          this.sendBack(culprit, this.reworkHoursFor(culprit, 0.1, 0.3));
        } else {
          for (const tk of batch) {
            this.move(tk, () => {
              tk.deploying = false;
              tk.envIndex++;
              // chegou no primeiro ambiente de produção: usuários reais, bug pode aparecer
              if (i === this.firstProdEnv && tk.bugAt == null && this.rand() * 100 < this.cfg.bugPct)
                tk.bugAt = this.t + this.rand() * this.cfg.bugMaxDaysAfter * 24;
              if (tk.envIndex >= this.envs.length) {
                tk.stage = 'done';
                tk.doneAt = this.t;
              }
            });
          }
          const tag = i === this.envs.length - 1 ? ' ✅ entregue em todos os ambientes' : i === this.firstProdEnv ? ' 🚀 em produção' : '';
          this.emit('good', `Canary ok em ${env.name}: ${batch.map((tk) => '#' + tk.id).join(', ')}${tag}`);
        }
      }
    });

    // Regra: no máximo `envsPerDay` ambientes por dia, priorizando o mais perto de produção.
    if (this.cfg.deployAtNight ? !this.deploySession : !this.working || !this.isDeployDay(Math.floor(this.t / 24))) return;
    const day = this.deploySession ? Math.floor(this.deploySession.start / 24) : Math.floor(this.t / 24);
    if (day !== this.deployDay) {
      this.deployDay = day;
      this.envsDeployedToday = 0;
    }
    for (let i = this.envs.length - 1; i >= 0 && this.envsDeployedToday < this.cfg.envsPerDay; i--) {
      const env = this.envs[i];
      if (env.batch.length) continue;
      const waiting = this.waitingFor(i);
      if (!waiting.length) continue;
      this.envsDeployedToday++;
      const hours = Math.min(24, this.uniform(this.cfg.canaryHoursMin, this.cfg.canaryHoursMax));
      for (const tk of waiting) tk.deploying = true;
      env.batch = waiting.map((tk) => tk.id);
      env.startedAt = this.t;
      env.endsAt = this.t + hours;
      env.fail = this.rand() * 100 < this.cfg.canaryFailPct;
      this.deploySession?.envs.add(env.name);
      const who = this.deploySession ? `${this.devs[this.deploySession.devId].name} subiu ` : '';
      this.emit('info', `🌙 ${who}deploy em ${env.name}: ${waiting.map((tk) => '#' + tk.id).join(', ')} (canary ${hours.toFixed(0)}h)`);
    }
  }

  /** Regra de calendário: deploy de segunda a quinta (sexta só se liberado). */
  isDeployDay(day: number) {
    const dow = day % 7; // 0 = segunda
    return dow <= 3 || (dow === 4 && this.cfg.deployOnFriday);
  }

  private waitingFor(envIndex: number) {
    return this.tickets.filter((tk) => tk.stage === 'deploy' && tk.envIndex === envIndex && !tk.deploying);
  }

  /** Tem algum ambiente livre com coisa esperando? (senão nem precisa ficar de plantão) */
  private hasDeployableEnv() {
    return this.envs.some((env, i) => !env.batch.length && this.waitingFor(i).length > 0);
  }

  // ---- bugs em produção ---------------------------------------------------------

  private detectBugs() {
    for (const f of this.tickets) {
      if (f.bugAt == null || this.t < f.bugAt) continue;
      f.bugAt = null;
      const id = this.nextId++;
      const hours = this.uniform(this.cfg.bugFixHoursMin, this.cfg.bugFixHoursMax);
      const bug: Ticket = {
        ...structuredClone(f),
        id,
        kind: 'bug',
        parentId: f.id,
        title: `BUG: ${f.title}`,
        color: 0xe5484d,
        stage: 'ready',
        createdAt: this.t,
        enteredAt: this.t,
        time: {},
        activeHours: 0,
        author: null,
        devId: null,
        workOriginal: hours,
        workTotal: hours,
        workDone: 0,
        reviews: [],
        reviewRounds: 0,
        rework: false,
        envIndex: 0,
        deploying: false,
        rollbacks: 0,
        comments: 0,
        reworkHours: 0,
        doneAt: null,
        swarm: [],
        hotfixEnds: null,
      };
      this.tickets.push(bug);
      this.emit('bad', `🐞 BUG em produção na #${f.id} "${f.title}"! Abrindo #${id}`, { ticketId: id });
    }
  }

  /** Bugs abertos puxam N devs (de preferência o autor da feature), que largam o que estão fazendo. */
  private formSwarms() {
    for (const bug of this.tickets) {
      if (bug.kind !== 'bug' || bug.stage !== 'ready') continue;
      const parent = this.ticket(bug.parentId);
      const free = this.devs.filter((d) => d.role === 'dev' && d.bugId == null && this.activity(d) !== 'away');
      if (!free.length) continue; // de madrugada / ninguém disponível: espera o time chegar
      free.sort((a, b) => (a.id === parent?.author ? -1 : b.id === parent?.author ? 1 : 0));
      const crew = [free[0], ...this.shuffle(free.slice(1))].slice(0, Math.max(1, this.cfg.bugSwarmDevs));
      for (const d of crew) {
        d.bugId = bug.id;
        if (d.reviewTicketId != null) {
          // larga a revisão no meio: ela volta pra fila
          const rv = this.ticket(d.reviewTicketId)?.reviews.find((r) => r.devId === d.id && r.started && !r.done);
          if (rv) rv.started = false;
          d.reviewTicketId = null;
        }
      }
      this.move(bug, () => {
        bug.stage = 'doing';
        bug.devId = crew[0].id;
        bug.author = crew[0].id;
        bug.swarm = crew.map((d) => d.id);
      });
      this.emit('bad', `🚨 ${crew.map((d) => d.name).join(', ')} largaram tudo pra atacar o bug #${bug.id}`, { ticketId: bug.id });
    }
  }

  private updateBugs(h: number) {
    for (const bug of this.inStage('doing')) {
      if (bug.kind !== 'bug') continue;
      const active = bug.swarm.filter((id) => this.activity(this.devs[id]) === 'bugfix').length;
      bug.workDone += h * active;
      bug.activeHours += h * active;
      if (bug.workDone < bug.workTotal) continue;
      for (const id of bug.swarm) this.devs[id].bugId = null;
      bug.swarm = [];
      this.openPR(bug);
    }
  }

  /** Janela noturna: 1 dev (rodízio) fica N horas fazendo os deploys e compensa no dia seguinte. */
  private updateDeploySession(h: number) {
    const s = this.deploySession;
    if (s) {
      this.nightHours += h;
      if (this.t < s.end) return;
      const dev = this.devs[s.devId];
      const hours = s.end - s.start;
      dev.offUntil = nextWorkdayStart(this.t) + hours;
      this.deploySession = null;
      this.emit('info', `${dev.name} encerrou o deploy (${hours.toFixed(1)}h de madrugada); compensa chegando às ${clock(dev.offUntil)}`, { devId: dev.id });
      return;
    }
    if (!this.cfg.deployAtNight) return;
    const day = Math.floor(this.t / 24);

    if (this.t % 24 < this.cfg.deployHour || this.lastDeployNight === day) return;
    this.lastDeployNight = day;
    if (!this.isDeployDay(day)) return;
    if (!this.hasDeployableEnv()) return;
    const devs = this.devs.filter((d) => d.role === 'dev');
    const dev = devs[this.rotation++ % devs.length];
    const hours = this.uniform(this.cfg.deployHoursMin, this.cfg.deployHoursMax);
    this.deploySession = { devId: dev.id, start: this.t, end: this.t + hours, envs: new Set() };
    this.emit('warn', `🌙 Janela de deploy: ${dev.name} fica até ${clock(this.t + hours)}`, { devId: dev.id });
  }

  // ---- métricas -------------------------------------------------------------

  metrics(windowDays = 30) {
    const since = this.t - windowDays * 24;
    const done = this.tickets.filter((tk) => tk.kind === 'feature' && tk.doneAt != null && tk.doneAt >= since);
    const bugs = this.tickets.filter((tk) => tk.kind === 'bug' && tk.createdAt >= since);
    const fixed = bugs.filter((tk) => tk.doneAt != null);
    const elapsedDays = Math.min(windowDays, (this.t - 8) / 24);
    const avg = (f: (tk: Ticket) => number) => (done.length ? done.reduce((s, tk) => s + f(tk), 0) / done.length : 0);
    const groups: Record<string, (tk: Ticket) => number> = {
      Backlog: (tk) => tk.time.backlog ?? 0,
      Refinamento: (tk) => tk.time.refining ?? 0,
      'Fila p/ dev': (tk) => tk.time.ready ?? 0,
      Desenvolvimento: (tk) => tk.time.doing ?? 0,
      'Code review': (tk) => tk.time.review ?? 0,
      ...(this.firstProdEnv > 0 ? { 'Deploy pré-prod': (tk: Ticket) => this.deployTime(tk, false) } : {}),
      'Deploy produção': (tk) => this.deployTime(tk, true),
    };
    const lead = avg((tk) => tk.doneAt! - tk.createdAt);
    return {
      doneCount: done.length,
      leadDays: lead / 24,
      throughputWeek: elapsedDays > 0 ? (done.length / elapsedDays) * 7 : 0,
      flowEfficiency: lead ? avg((tk) => tk.activeHours) / lead : 0,
      stages: Object.entries(groups).map(([label, f]) => ({ label, days: avg(f) / 24 })),
      devTime: this.devTimeShare(),
      commentsPerPR: avg((tk) => tk.comments),
      bugs: bugs.length,
      openBugs: this.tickets.filter((tk) => tk.kind === 'bug' && tk.stage !== 'done').length,
      mttrHours: fixed.length ? fixed.reduce((sum, tk) => sum + (tk.doneAt! - tk.createdAt), 0) / fixed.length : 0,
      nightHoursWeek: elapsedDays > 0 ? (this.nightHours / ((this.t - 8) / 24)) * 7 : 0,
      wip: this.tickets.filter((tk) => !['backlog', 'done'].includes(tk.stage)).length,
      backlog: this.inStage('backlog').length,
    };
  }

  private deployTime(tk: Ticket, prod: boolean) {
    return Object.entries(tk.time)
      .filter(([k]) => k.startsWith('deploy:') && this.isProdEnv(Number(k.slice(7))) === prod)
      .reduce((sum, [, v]) => sum + v, 0);
  }

  /** Fração do expediente dos devs em cada atividade (desde o início). */
  devTimeShare() {
    const total = Object.values(this.devHours).reduce((a, b) => a + b, 0) || 1;
    const share = (a: Activity) => this.devHours[a] / total;
    const rework = this.tickets.reduce((sum, tk) => sum + tk.reworkHours, 0);
    return {
      reworkOfCoding: this.devHours.coding ? rework / this.devHours.coding : 0,
      bugfix: share('bugfix'),
      coding: share('coding'), reviewing: share('reviewing'), meetings: share('daily') + share('meeting'), idle: share('idle') };
  }

  // ---- utilidades -------------------------------------------------------------

  private emit(kind: EventKind, text: string, extra: { devId?: number; ticketId?: number } = {}) {
    const e: SimEvent = { t: this.t, kind, text, ...extra };
    this.events.push(e);
    if (this.events.length > 300) this.events.shift();
    this.onEvent?.(e);
  }

  private uniform(a: number, b: number) {
    return a + (Math.max(a, b) - a) * this.rand();
  }

  private expo(mean: number) {
    return -Math.log(1 - this.rand()) * mean;
  }

  private shuffle<T>(xs: T[]): T[] {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}
