// Simulation engine: plain TypeScript, no rendering at all.
// Time unit: hours. t=0 is Monday 00:00.

const DEV_NAMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gabi', 'Hugo', 'Iara'];

export type Level = 'junior' | 'mid' | 'senior';

/** Traits shared by every dev of a given level. */
export interface LevelProfile {
  daysPerFeature: number; // average working days for a feature
  commentPct: number; // % of reviews of their PRs that flag an issue (quality)
  bugPct: number; // % of their deliveries that cause a production bug
  reviewPickup: number; // multiplier on how long they take to pick up a review (1 = normal)
}

export const LEVELS: Level[] = ['junior', 'mid', 'senior'];
export const MAX_DEVS = 8;

export interface Config {
  seed: number;
  maxDays: number; // simulation length in calendar days (0 = run forever)
  aiUsage: number; // % of coding done with AI assistance (0 = no AI)
  aiSpeedup: number; // % less coding time at 100% usage
  aiSweetSpot: number; // usage % up to which AI slightly improves quality; above it quality degrades
  aiQualityPenalty: number; // % more review comments and production bugs at 100% usage (mid-level dev)
  aiReviewOverhead: number; // % more review effort and merge-conflict chance at 100% usage (bigger diffs)
  aiDebugPenalty: number; // % longer bug fixes at 100% usage (code nobody really wrote)
  seniors: number; // team composition (total up to 8 devs)
  mids: number;
  juniors: number;
  juniorDays: number; // avg working days per feature, by level
  midDays: number;
  seniorDays: number;
  juniorCommentPct: number; // % of PRs that get review comments, by level
  midCommentPct: number;
  seniorCommentPct: number;
  juniorBugPct: number; // % of deliveries with a production bug, by level
  midBugPct: number;
  seniorBugPct: number;
  juniorPickup: number; // review pickup delay multiplier, by level
  midPickup: number;
  seniorPickup: number;
  techLeads: number; // don't pick features: they review, refine and attend the daily
  devApprovals: number; // dev approvals required per PR
  techLeadApprovals: number; // tech lead approvals required per PR
  arrivalEveryDays: number; // mean interval (calendar days) between new demands
  dailyHour: number; // daily start hour
  dailyHours: number;
  pickOnlyAtDaily: boolean; // new tasks are only picked at the daily
  refineHours: number; // refinement meeting length (working hours)
  refineBatch: number; // how many demands each refinement covers
  devDaysMin: number; // working days of development
  devDaysMax: number;
  reviewWaitDaysMin: number; // working days until each reviewer picks up the PR
  reviewWaitDaysMax: number;
  tlReviewWaitDaysMin: number; // working days until the tech lead picks up the PR
  tlReviewWaitDaysMax: number;
  reviewEffortHours: number; // time the reviewer spends reviewing
  refactorPctMin: number; // refactoring costs X% of the feature's original effort
  refactorPctMax: number;
  envs: string[];
  prodEnvCount: number; // the last N environments are production (P1, P2, P3)
  envsPerDay: number; // how many environments can be deployed per day
  maxMainPRs: number; // max merged PRs on main waiting for a tag (0 = unlimited)
  conflictPct: number; // on each merge, chance of conflicting with each open PR
  conflictHoursMin: number; // effort to resolve the conflict
  conflictHoursMax: number;
  canaryHoursMin: number; // canary per environment (max 24h)
  canaryHoursMax: number;
  canaryFailPct: number;
  deployAtNight: boolean; // deploy only in the night window, done by 1 on-call dev
  deployHour: number; // window start (e.g. 22h)
  deployHoursMin: number; // how long the dev stays up at night
  deployHoursMax: number;
  deployOnFriday: boolean;
  bugMaxDaysAfter: number; // bug shows up between the deploy and N days later
  bugSwarmDevs: number; // how many devs drop everything to help with the bug
  bugFixHoursMin: number; // total fix effort (dev-hours, split across the swarm)
  bugFixHoursMax: number;
  hotfixHours: number; // time for the hotfix to roll out straight to production
}

export const defaultConfig: Config = {
  seed: 42,
  maxDays: 730,
  aiUsage: 0,
  aiSpeedup: 45,
  aiSweetSpot: 40,
  aiQualityPenalty: 80,
  aiReviewOverhead: 50,
  aiDebugPenalty: 40,
  seniors: 1,
  mids: 3,
  juniors: 1,
  juniorDays: 4.5,
  midDays: 3,
  seniorDays: 2,
  juniorCommentPct: 35,
  midCommentPct: 20,
  seniorCommentPct: 10,
  juniorBugPct: 25,
  midBugPct: 15,
  seniorBugPct: 8,
  juniorPickup: 1.3,
  midPickup: 1,
  seniorPickup: 0.7,
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
  refactorPctMin: 15,
  refactorPctMax: 40,
  envs: ['P1', 'P2', 'P3'],
  prodEnvCount: 3,
  envsPerDay: 1,
  maxMainPRs: 5,
  conflictPct: 10,
  conflictHoursMin: 1,
  conflictHoursMax: 4,
  canaryHoursMin: 4,
  canaryHoursMax: 24,
  canaryFailPct: 8,
  deployAtNight: true,
  deployHour: 22,
  deployHoursMin: 1,
  deployHoursMax: 3,
  deployOnFriday: false,
  bugMaxDaysAfter: 5,
  bugSwarmDevs: 2,
  bugFixHoursMin: 3,
  bugFixHoursMax: 12,
  hotfixHours: 1,
};

export const DAY_START = 9;
export const DAY_END = 18;
export const WORK_HOURS_PER_DAY = DAY_END - DAY_START;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function isWorkingTime(t: number): boolean {
  const day = Math.floor(t / 24);
  const h = t - day * 24;
  return day % 7 < 5 && h >= DAY_START && h < DAY_END;
}

/** v1.4 → v1.4.1 → v1.4.2 (never reusing a name). */
function patchName(name: string, tags: Tag[]) {
  const m = name.match(/^(v\d+\.\d+)(?:\.(\d+))?/);
  const base = m ? m[1] : name;
  let n = m && m[2] ? Number(m[2]) + 1 : 1;
  while (tags.some((t) => t.name === `${base}.${n}`)) n++;
  return `${base}.${n}`;
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

/** Start (09:00) of the next working day after t. */
function nextWorkdayStart(t: number) {
  for (let d = Math.floor(t / 24); ; d++) if (d % 7 < 5 && d * 24 + DAY_START >= t) return d * 24 + DAY_START;
}

export function formatClock(t: number): string {
  const day = Math.floor(t / 24);
  const h = Math.floor(t - day * 24);
  const m = Math.floor((t - day * 24 - h) * 60);
  return `${WEEKDAYS[day % 7]} · day ${day + 1} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export type Stage = 'backlog' | 'refining' | 'ready' | 'doing' | 'review' | 'deploy' | 'done';
export type Activity = 'away' | 'deploying' | 'bugfix' | 'daily' | 'idle' | 'coding' | 'meeting' | 'reviewing';

export type Role = 'dev' | 'techlead';

export interface Review {
  devId: number;
  role: Role;
  dueWork: number; // working-hours clock when the reviewer picks up the PR
  started: boolean;
  done: boolean;
}

export interface Ticket {
  id: number;
  kind: 'feature' | 'bug';
  parentId: number | null; // bug: feature that caused it
  bugAt: number | null; // feature: when its production bug will show up (if any)
  swarm: number[]; // bug: devs in the swarm
  hotfixEnds: number | null;
  tagId: number | null; // tag (release) the PR belongs to
  title: string;
  color: number;
  stage: Stage;
  createdAt: number;
  enteredAt: number;
  time: Record<string, number>; // calendar hours per stage (deploy per environment: "deploy:0")
  activeHours: number; // hours someone actually worked on it
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
  comments: number; // issues flagged in review
  conflicts: number; // merge conflicts suffered
  awaitingMerge: boolean; // approved, but main is full
  approvedAt: number;
  size: number; // feature size in working days for a mid-level dev (set at refinement)
  reworkHours: number; // hours spent refactoring/fixing
  doneAt: number | null;
}

export interface Dev {
  id: number;
  name: string;
  role: Role;
  level: Level;
  ticketId: number | null; // feature being coded (may be paused)
  pausedTicketId: number | null; // feature interrupted to refactor another one
  reviewTicketId: number | null;
  reviewLeft: number;
  inMeeting: boolean;
  offUntil: number; // compensating night deploy hours: only arrives at this time
  bugId: number | null; // in a bug swarm (drops everything else)
}

export interface DeploySession {
  devId: number;
  start: number;
  end: number;
  envs: Set<string>;
}

/** Release: snapshot of main that goes to production. Holds 1+ PRs and moves P1 → P2 → P3 as a unit. */
export interface Tag {
  id: number;
  name: string;
  ticketIds: number[];
  envIndex: number; // next environment (or the one currently in canary)
  deploying: boolean;
  createdAt: number;
  doneAt: number | null;
  status: 'active' | 'done' | 'merged' | 'rolledback';
  includes: string[]; // older tags absorbed (tags are cumulative)
  hotfix: boolean;
}

export interface Env {
  name: string;
  tagId: number | null; // tag in canary on this environment
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

const TL_NAMES = ['Rita', 'Otávio', 'Lúcia'];
export const MAX_PEOPLE = 9; // desks in the office
const FEATURES = [
  'SSO login', 'CSV export', 'Dark mode', 'Payment webhook', 'Advanced filter',
  'Push notification', 'Catalog cache', 'Voice search', 'Onboarding screen', 'Monthly report',
  'Discount coupon', 'Bulk upload', 'Access audit', 'Pix integration', 'Feature flag UI',
  'API rate limit', '1-click checkout', 'Multi-language', 'Support chat', 'Metrics dashboard',
  'Password recovery', 'Scheduled send', 'Spreadsheet import', 'Order history', '5-star rating',
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
  if (tk.stage === 'review' && tk.awaitingMerge) return 'mergeQueue';
  if (tk.stage !== 'deploy') return tk.stage;
  return tk.tagId == null && tk.hotfixEnds == null ? 'main' : `deploy:${tk.envIndex}`;
}

export class Sim {
  t = 0;
  work = 0; // accumulated working hours
  tickets: Ticket[] = [];
  devs: Dev[] = [];
  envs: Env[] = [];
  meeting: Meeting | null = null;
  devHours = emptyHours();
  deploySession: DeploySession | null = null;
  tags: Tag[] = [];
  private releaseSeq = 0;
  private nextTagId = 1;
  nightHours = 0; // late-night hours accumulated in deploys
  aiSaved = 0; // dev-hours AI saved (faster coding, fewer issues below the sweet spot)
  aiCost = 0; // dev-hours AI cost (bigger reviews, extra comments/bugs/conflicts, harder debugging)
  private lastDeployNight = -1;
  private deployDay = -1; // current "deploy day" (the night window counts for the day it started)
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
    this.t = 8; // Monday, 08:00
    this.work = 0;
    this.tickets = [];
    this.meeting = null;
    this.events = [];
    this.nextId = 1;
    this.devHours = emptyHours();
    this.deploySession = null;
    this.tags = [];
    this.releaseSeq = 0;
    this.nextTagId = 1;
    this.nightHours = 0;
    this.aiSaved = 0;
    this.aiCost = 0;
    this.lastDeployNight = -1;
    this.deployDay = -1;
    this.envsDeployedToday = 0;
    this.rotation = 0;
    const tls = Math.min(this.cfg.techLeads, MAX_PEOPLE - 1);
    // composition: seniors, then mids, then juniors (capped by the desks available)
    const levels: Level[] = [
      ...Array<Level>(Math.max(0, this.cfg.seniors)).fill('senior'),
      ...Array<Level>(Math.max(0, this.cfg.mids)).fill('mid'),
      ...Array<Level>(Math.max(0, this.cfg.juniors)).fill('junior'),
    ].slice(0, Math.min(MAX_DEVS, MAX_PEOPLE - tls));
    if (!levels.length) levels.push('mid');
    const devs = levels.length;
    this.devs = Array.from({ length: devs + tls }, (_, i) => ({
      id: i,
      role: i < devs ? ('dev' as const) : ('techlead' as const),
      level: i < devs ? levels[i] : ('senior' as Level),
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
      name, tagId: null, batch: [], startedAt: 0, endsAt: 0, fail: false, result: null, resultAt: -1,
    }));
    for (let i = 0; i < 4; i++) this.spawn();
    this.nextArrival = this.t + this.expo(this.cfg.arrivalEveryDays * 24);
  }

  /** Index of the first production environment (P1). */
  get firstProdEnv() {
    return Math.max(0, this.envs.length - Math.max(1, this.cfg.prodEnvCount));
  }

  isProdEnv(i: number) {
    return i >= this.firstProdEnv;
  }

  // ---- AI assistance ----------------------------------------------------------

  private get aiU() {
    return Math.min(1, Math.max(0, this.cfg.aiUsage / 100));
  }

  /** Coding time multiplier (< 1 = faster). */
  private aiSpeed() {
    return 1 - (this.cfg.aiSpeedup / 100) * this.aiU;
  }

  /**
   * Quality multiplier on review-comment and bug chances. Up to the sweet spot AI catches
   * small mistakes (down to 0.85×); beyond it over-reliance kicks in and it grows (convex)
   * up to 0.85 + penalty at 100%. Juniors are hit harder, seniors less.
   */
  aiQuality(level: Level) {
    const u = this.aiU;
    const s = Math.min(0.99, Math.max(0.01, this.cfg.aiSweetSpot / 100));
    if (u <= s) return 1 - 0.15 * (u / s);
    const over = (u - s) / (1 - s);
    const levelFactor = { junior: 1.5, mid: 1, senior: 0.6 }[level];
    return 0.85 + (this.cfg.aiQualityPenalty / 100) * levelFactor * Math.pow(over, 1.5);
  }

  /** Bigger AI-generated diffs: more review effort and more merge conflicts. */
  private aiDiff() {
    return 1 + (this.cfg.aiReviewOverhead / 100) * this.aiU;
  }

  /** Debugging code nobody really wrote: only above the sweet spot. */
  private aiDebug() {
    const s = Math.min(0.99, Math.max(0.01, this.cfg.aiSweetSpot / 100));
    return 1 + (this.cfg.aiDebugPenalty / 100) * Math.max(0, (this.aiU - s) / (1 - s));
  }

  /** Coding hours with AI applied; credits the saved time. */
  private aiCoding(hours: number) {
    const eff = hours * this.aiSpeed();
    this.aiSaved += hours - eff;
    return eff;
  }

  /** Books the expected cost (or saving) of a probability change caused by AI. */
  private aiLedger(baseP: number, aiP: number, hoursIfHappens: number) {
    const delta = (aiP - baseP) / 100;
    if (delta > 0) this.aiCost += delta * hoursIfHappens;
    else this.aiSaved += -delta * hoursIfHappens;
  }

  /** Traits of a level, read live from the config. */
  levelProfile(level: Level): LevelProfile {
    const c = this.cfg;
    return {
      junior: { daysPerFeature: c.juniorDays, commentPct: c.juniorCommentPct, bugPct: c.juniorBugPct, reviewPickup: c.juniorPickup },
      mid: { daysPerFeature: c.midDays, commentPct: c.midCommentPct, bugPct: c.midBugPct, reviewPickup: c.midPickup },
      senior: { daysPerFeature: c.seniorDays, commentPct: c.seniorCommentPct, bugPct: c.seniorBugPct, reviewPickup: c.seniorPickup },
    }[level];
  }

  /** Traits of dev `id` (by their level). */
  profile(id: number): LevelProfile & { level: Level } {
    const level = this.devs[id]?.level ?? 'mid';
    return { level, ...this.levelProfile(level) };
  }

  private authorProfile(tk: Ticket) {
    return this.profile(tk.author ?? 0);
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

  static readonly START_T = 8; // Monday 08:00

  /** Simulated time at which the run ends (Infinity when unlimited). */
  get endT() {
    return this.cfg.maxDays > 0 ? Sim.START_T + this.cfg.maxDays * 24 : Infinity;
  }

  get finished() {
    return this.t >= this.endT - 1e-9;
  }

  /** 0..1 of the configured run length. */
  get progress() {
    return Number.isFinite(this.endT) ? Math.min(1, (this.t - Sim.START_T) / (this.endT - Sim.START_T)) : 0;
  }

  step(hours: number) {
    let left = Math.min(hours, this.endT - this.t);
    while (left > 1e-9) {
      const h = Math.min(0.1, left);
      this.tick(h);
      left -= h;
    }
  }

  // ---- core -----------------------------------------------------------------

  private tick(h: number) {
    const wasWorking = this.working;
    const wasDaily = this.inDaily;
    this.t += h;
    const working = this.working;
    if (working) this.work += h;
    if (working && !wasWorking) this.emit('info', 'Good morning! Team arriving at the office.');
    if (!working && wasWorking) this.emit('info', 'End of the workday. Only the canary works at night.');
    if (this.inDaily && !wasDaily) this.emit('info', 'Daily: team gathered at the board to pick tasks');
    if (working) for (const d of this.devs) if (d.role === 'dev') this.devHours[this.activity(d)] += h;

    while (this.t >= this.nextArrival) {
      const tk = this.spawn();
      this.emit('info', `New demand #${tk.id} "${tk.title}" arrived in the backlog`, { ticketId: tk.id });
      this.nextArrival += this.expo(this.cfg.arrivalEveryDays * 24);
    }

    if (working) {
      this.updateMeeting();
      this.flushMergeQueue();
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
      conflicts: 0,
      awaitingMerge: false,
      approvedAt: 0,
      size: 0,
      reworkHours: 0,
      doneAt: null,
      kind: 'feature',
      parentId: null,
      bugAt: null,
      swarm: [],
      hotfixEnds: null,
      tagId: null,
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
        tk.size = this.uniform(this.cfg.devDaysMin, this.cfg.devDaysMax);
        tk.workOriginal = tk.workTotal = tk.size * WORK_HOURS_PER_DAY;
      });
    }
    for (const id of m.devIds) this.devs[id].inMeeting = false;
    this.emit('good', `Refinement done: ${m.ticketIds.map((i) => '#' + i).join(', ')} ready for dev`);
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
      // Nobody free and nothing ready: someone stops coding to refine.
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
    this.emit('info', `Refinement with PO and ${people.map((d) => d.name).join(', ')} (${items.length} demands)`);
  }

  private assignWork() {
    // New tasks only leave the board at the daily; rework is picked up by the author right away.
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
        if (tk.author == null) {
          tk.author = dev.id;
          // the same feature takes longer for a slower dev (feature size is calibrated for a mid-level dev)
          const mid = (this.cfg.devDaysMin + this.cfg.devDaysMax) / 2 || 1;
          tk.workOriginal = tk.size * (this.profile(dev.id).daysPerFeature / mid) * WORK_HOURS_PER_DAY;
          tk.workTotal = this.aiCoding(tk.workOriginal);
        }
      });
      dev.ticketId = tk.id;
      this.emit('info', `${dev.name} started ${tk.rework ? 'rework on ' : ''}#${tk.id}`, { devId: dev.id, ticketId: tk.id });
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
        // done: go back to the feature that had been interrupted, if any
        dev.ticketId = dev.pausedTicketId;
        dev.pausedTicketId = null;
        this.openPR(tk);
        if (dev.ticketId != null) this.emit('info', `${dev.name} went back to #${dev.ticketId}`, { devId: dev.id, ticketId: dev.ticketId });
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
      tk.awaitingMerge = false;
      tk.reviewRounds++;
      const urgent = tk.kind === 'bug'; // priority review: reviewer picks it up right away
      tk.reviews = picked.map((d) => ({
        devId: d.id,
        role: d.role,
        dueWork: urgent
          ? this.work
          : this.work +
          (d.role === 'techlead'
            ? this.uniform(this.cfg.tlReviewWaitDaysMin, this.cfg.tlReviewWaitDaysMax)
            : this.uniform(this.cfg.reviewWaitDaysMin, this.cfg.reviewWaitDaysMax) * this.profile(d.id).reviewPickup) *
            WORK_HOURS_PER_DAY,
        started: false,
        done: false,
      }));
    });
    const author = this.devs[tk.devId!];
    this.emit(tk.kind === 'bug' ? 'warn' : 'info', `${author.name} opened ${tk.kind === 'bug' ? '🚑 hotfix ' : ''}PR #${tk.id}${k ? ` (reviewers: ${picked.map((d) => d.name).join(', ')})` : ''}`, {
      devId: author.id,
      ticketId: tk.id,
    });
    if (k === 0) this.tryMerge(tk);
  }

  private updateReviews(h: number) {
    // Reviews in progress
    for (const dev of this.devs) {
      if (this.activity(dev) !== 'reviewing') continue;
      dev.reviewLeft -= h;
      const tk = this.ticket(dev.reviewTicketId)!;
      tk.activeHours += h;
      if (dev.reviewLeft > 0) continue;
      dev.reviewTicketId = null;
      const rv = tk.reviews.find((r) => r.devId === dev.id && r.started && !r.done);
      if (!rv) continue;
      const author = this.authorProfile(tk);
      const commentP = author.commentPct * this.aiQuality(author.level);
      if (tk.kind === 'feature')
        this.aiLedger(author.commentPct, commentP, tk.workOriginal * ((this.cfg.refactorPctMin + this.cfg.refactorPctMax) / 200));
      if (tk.kind === 'feature' && this.rand() * 100 < commentP) {
        tk.comments++;
        const hours = this.aiCoding(this.reworkHoursFor(tk, this.cfg.refactorPctMin / 100, this.cfg.refactorPctMax / 100));
        this.emit('review-changes', `${dev.name} flagged an issue on PR #${tk.id}: ~${hours.toFixed(0)}h refactor`, {
          devId: dev.id,
          ticketId: tk.id,
        });
        this.sendBack(tk, hours);
      } else {
        rv.done = true;
        this.emit('review-ok', `${dev.name} approved PR #${tk.id}`, { devId: dev.id, ticketId: tk.id });
        if (tk.reviews.every((r) => r.done)) this.tryMerge(tk);
      }
    }
    // Reviewers picking up PRs whose turn has come
    const queue = this.inStage('review').sort((a, b) => (a.kind === 'bug' ? 0 : 1) - (b.kind === 'bug' ? 0 : 1));
    for (const tk of queue) {
      for (const rv of tk.reviews) {
        if (rv.started || rv.done || this.work < rv.dueWork) continue;
        const dev = this.devs[rv.devId];
        const act = this.activity(dev);
        if (act === 'meeting' || act === 'reviewing' || act === 'away') continue;
        rv.started = true;
        dev.reviewTicketId = tk.id;
        dev.reviewLeft = this.cfg.reviewEffortHours * (tk.kind === 'feature' ? this.aiDiff() : 1);
        this.aiCost += dev.reviewLeft - this.cfg.reviewEffortHours;
      }
    }
  }

  /**
   * Sends the ticket back to its author as rework (review issue, merge conflict or canary bug).
   * The author interrupts the current feature, fixes it and then resumes. If they already
   * have a paused feature, the rework goes to the "ready for dev" queue.
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
      tk.awaitingMerge = false;
      tk.deploying = false;
      tk.envIndex = 0;
      tk.tagId = null;
      tk.workDone = 0;
      tk.workTotal = hours;
    });
    if (direct) {
      if (author!.ticketId != null) {
        author!.pausedTicketId = author!.ticketId;
        this.emit('warn', `${author!.name} paused #${author!.ticketId} to refactor #${tk.id}`, { devId: author!.id, ticketId: tk.id });
      }
      author!.ticketId = tk.id;
    }
  }

  private reworkHoursFor(tk: Ticket, minFrac: number, maxFrac: number) {
    return Math.max(1, tk.workOriginal * this.uniform(minFrac, maxFrac));
  }

  private mainFull() {
    return this.cfg.maxMainPRs > 0 && this.inMain().length >= this.cfg.maxMainPRs;
  }

  /** Approved: merges if main has room; otherwise joins the merge queue. Hotfixes don't wait. */
  private tryMerge(tk: Ticket) {
    if (tk.kind === 'feature' && this.mainFull()) {
      this.move(tk, () => {
        tk.awaitingMerge = true;
        tk.approvedAt = this.t;
      });
      this.emit('warn', `🔒 Main is full (${this.inMain().length}/${this.cfg.maxMainPRs}): PR #${tk.id} approved, waiting for a merge slot`, {
        ticketId: tk.id,
      });
      return;
    }
    this.merge(tk);
  }

  /** Main has room again (tag cut): merge approved PRs in approval order. */
  private flushMergeQueue() {
    const queue = this.inStage('review')
      .filter((tk) => tk.awaitingMerge)
      .sort((a, b) => a.approvedAt - b.approvedAt);
    for (const tk of queue) {
      if (this.mainFull()) break;
      if (tk.stage !== 'review' || !tk.awaitingMerge) continue; // may have conflicted on the previous merge
      this.move(tk, () => (tk.awaitingMerge = false));
      this.merge(tk);
    }
  }

  /** Each merge to main may conflict with unmerged PRs: they go back to the author and to review. */
  private rollConflicts(merged: Ticket) {
    const open = this.inStage('review').filter((tk) => tk.kind === 'feature' && tk !== merged);
    for (const tk of open) {
      const p = Math.min(100, this.cfg.conflictPct * this.aiDiff());
      this.aiLedger(this.cfg.conflictPct, p, (this.cfg.conflictHoursMin + this.cfg.conflictHoursMax) / 2);
      if (this.rand() * 100 >= p) continue;
      tk.conflicts++;
      const hours = this.aiCoding(this.uniform(this.cfg.conflictHoursMin, this.cfg.conflictHoursMax));
      this.emit('review-changes', `⚔ Merging #${merged.id} conflicted with PR #${tk.id}: back to resolve (~${hours.toFixed(0)}h) and re-review`, {
        devId: tk.author ?? undefined,
        ticketId: tk.id,
      });
      this.sendBack(tk, hours);
    }
  }

  private merge(tk: Ticket) {
    this.rollConflicts(tk);
    if (tk.kind === 'bug') {
      // hotfix: straight to production, outside the night window
      const base = [...this.tags].reverse().find((t) => t.status === 'done' || t.status === 'active');
      const tag = this.newTag(base ? patchName(base.name, this.tags) : 'v1.0.1', [tk], this.envs.length - 1, true);
      tag.deploying = true;
      this.move(tk, () => {
        tk.stage = 'deploy';
        tk.envIndex = this.envs.length - 1;
        tk.deploying = true;
        tk.devId = null;
        tk.tagId = tag.id;
        tk.hotfixEnds = this.t + this.cfg.hotfixHours;
      });
      const prod = this.envs.slice(this.firstProdEnv).map((e) => e.name).join(', ');
      this.emit('warn', `🚑 Hotfix #${tk.id} approved: tag ${tag.name} rolling out straight to ${prod} (exempt from the 1 env/day rule)`, { ticketId: tk.id });
      return;
    }
    this.move(tk, () => {
      tk.stage = 'deploy';
      tk.envIndex = 0;
      tk.deploying = false;
      tk.devId = null;
      tk.tagId = null;
    });
    this.emit('good', `PR #${tk.id} merged into main (waiting for the next tag)`, { ticketId: tk.id });
  }

  private updateDeploys() {
    for (const tk of this.tickets) {
      if (tk.hotfixEnds == null || tk.stage !== 'deploy' || this.t < tk.hotfixEnds) continue;
      this.move(tk, () => {
        tk.stage = 'done';
        tk.doneAt = this.t;
        tk.deploying = false;
      });
      const ht = this.tag(tk.tagId);
      if (ht) {
        ht.status = 'done';
        ht.deploying = false;
        ht.doneAt = this.t;
      }
      this.emit('good', `✅ Bug #${tk.id} fixed in production (${days(tk.doneAt! - tk.createdAt)} after it showed up)`, { ticketId: tk.id });
    }
    this.envs.forEach((env, i) => {
      if (env.tagId != null && this.t >= env.endsAt) {
        const tag = this.tag(env.tagId)!;
        const batch = tag.ticketIds.map((id) => this.ticket(id)!);
        env.batch = [];
        env.tagId = null;
        env.result = env.fail ? 'fail' : 'ok';
        env.resultAt = this.t;
        tag.deploying = false;
        if (env.fail) {
          // whole tag rolled back; the culprit PR is reverted and the rest becomes a patch tag that restarts at P1
          const culprit = batch[Math.floor(this.rand() * batch.length)];
          culprit.rollbacks++;
          tag.status = 'rolledback';
          for (const tk of batch) tk.deploying = false;
          this.sendBack(culprit, this.aiCoding(this.reworkHoursFor(culprit, 0.1, 0.3)));
          const rest = batch.filter((tk) => tk !== culprit);
          const patch = rest.length ? this.newTag(patchName(tag.name, this.tags), rest, 0, false) : null;
          if (patch) for (const tk of rest) this.move(tk, () => ((tk.tagId = patch.id), (tk.envIndex = 0)));
          this.emit(
            'bad',
            `Canary of ${tag.name} failed on ${env.name}! Rollback, #${culprit.id} reverted${patch ? `; ${patch.name} restarts at ${this.envs[0].name}` : ''}`,
            { ticketId: culprit.id },
          );
        } else {
          tag.envIndex++;
          if (tag.envIndex >= this.envs.length) {
            tag.status = 'done';
            tag.doneAt = this.t;
          }
          for (const tk of batch) {
            this.move(tk, () => {
              tk.deploying = false;
              tk.envIndex++;
              // reached the first production environment: real users, a bug may show up
              if (i === this.firstProdEnv && tk.bugAt == null && tk.kind === 'feature') {
                const author = this.authorProfile(tk);
                const bugP = author.bugPct * this.aiQuality(author.level);
                const fixHours = ((this.cfg.bugFixHoursMin + this.cfg.bugFixHoursMax) / 2) * this.aiDebug();
                this.aiLedger(author.bugPct, bugP, fixHours);
                if (this.rand() * 100 < bugP) tk.bugAt = this.t + this.rand() * this.cfg.bugMaxDaysAfter * 24;
              }
              if (tk.envIndex >= this.envs.length) {
                tk.stage = 'done';
                tk.doneAt = this.t;
              }
            });
          }
          const suffix = i === this.envs.length - 1 ? ' ✅ delivered to all environments' : i === this.firstProdEnv ? ' 🚀 in production' : '';
          this.emit('good', `Canary ok for ${tag.name} on ${env.name} (${batch.map((tk) => '#' + tk.id).join(', ')})${suffix}`);
        }
      }
    });

    // Rule: at most `envsPerDay` environments per day, closest to production first.
    if (this.cfg.deployAtNight ? !this.deploySession : !this.working || !this.isDeployDay(Math.floor(this.t / 24))) return;
    const day = this.deploySession ? Math.floor(this.deploySession.start / 24) : Math.floor(this.t / 24);
    if (day !== this.deployDay) {
      this.deployDay = day;
      this.envsDeployedToday = 0;
    }
    for (let i = this.envs.length - 1; i >= 0 && this.envsDeployedToday < this.cfg.envsPerDay; i--) {
      const env = this.envs[i];
      if (env.tagId != null) continue;
      const waiting = this.tagsWaiting(i);
      if (i === 0) {
        // release cut: everything on main becomes a new tag
        const main = this.inMain();
        if (main.length) {
          const tag = this.newTag(`v1.${++this.releaseSeq}`, main, 0, false);
          for (const tk of main) this.move(tk, () => ((tk.tagId = tag.id), (tk.envIndex = 0)));
          this.emit('info', `🏷 Tag ${tag.name} cut from main with ${main.map((tk) => '#' + tk.id).join(', ')}`);
          waiting.push(tag);
        }
      }
      if (!waiting.length) continue;
      // tags are cumulative: deploy the newest, which already contains the older ones queued for this environment
      const tag = waiting[waiting.length - 1];
      for (const old of waiting.slice(0, -1)) {
        old.status = 'merged';
        tag.includes.push(old.name, ...old.includes);
        for (const id of old.ticketIds) this.ticket(id)!.tagId = tag.id;
        tag.ticketIds.push(...old.ticketIds);
        old.ticketIds = [];
      }
      this.envsDeployedToday++;
      const hours = Math.min(24, this.uniform(this.cfg.canaryHoursMin, this.cfg.canaryHoursMax));
      const batch = tag.ticketIds.map((id) => this.ticket(id)!);
      for (const tk of batch) tk.deploying = true;
      tag.deploying = true;
      env.tagId = tag.id;
      env.batch = [...tag.ticketIds];
      env.startedAt = this.t;
      env.endsAt = this.t + hours;
      env.fail = this.rand() * 100 < this.cfg.canaryFailPct;
      this.deploySession?.envs.add(env.name);
      const who = this.deploySession ? `${this.devs[this.deploySession.devId].name} deployed ` : '';
      const inc = tag.includes.length ? ` (includes ${tag.includes.join(', ')})` : '';
      this.emit('info', `🌙 ${who}${tag.name}${inc} to ${env.name}: ${batch.length} PRs (canary ${hours.toFixed(0)}h)`);
    }
  }

  /** Calendar rule: deploys Monday to Thursday (Friday only if allowed). */
  isDeployDay(day: number) {
    const dow = day % 7; // 0 = Monday
    return dow <= 3 || (dow === 4 && this.cfg.deployOnFriday);
  }

  tag(id: number | null | undefined) {
    return id == null ? undefined : this.tags.find((t) => t.id === id);
  }

  /** Merged PRs that are not in any tag yet. */
  inMain() {
    return this.tickets.filter((tk) => tk.stage === 'deploy' && tk.tagId == null && tk.hotfixEnds == null);
  }

  tagsWaiting(envIndex: number) {
    return this.tags.filter((t) => t.status === 'active' && !t.hotfix && t.envIndex === envIndex && !t.deploying);
  }

  private newTag(name: string, tickets: Ticket[], envIndex: number, hotfix: boolean): Tag {
    const tag: Tag = {
      id: this.nextTagId++,
      name,
      ticketIds: tickets.map((tk) => tk.id),
      envIndex,
      deploying: false,
      createdAt: this.t,
      doneAt: null,
      status: 'active',
      includes: [],
      hotfix,
    };
    this.tags.push(tag);
    return tag;
  }

  /** Is any free environment waiting for something? (otherwise nobody needs to stay on call) */
  private hasDeployableEnv() {
    return this.envs.some(
      (env, i) => env.tagId == null && (this.tagsWaiting(i).length > 0 || (i === 0 && this.inMain().length > 0)),
    );
  }

  // ---- production bugs ----------------------------------------------------------

  private detectBugs() {
    for (const f of this.tickets) {
      if (f.bugAt == null || this.t < f.bugAt) continue;
      f.bugAt = null;
      const id = this.nextId++;
      const base = this.uniform(this.cfg.bugFixHoursMin, this.cfg.bugFixHoursMax);
      const hours = base * this.aiDebug();
      this.aiCost += hours - base;
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
        conflicts: 0,
        awaitingMerge: false,
        approvedAt: 0,
        size: 0,
        reworkHours: 0,
        doneAt: null,
        swarm: [],
        hotfixEnds: null,
        tagId: null,
      };
      this.tickets.push(bug);
      this.emit('bad', `🐞 Production BUG in #${f.id} "${f.title}"! Opening #${id}`, { ticketId: id });
    }
  }

  /** Open bugs pull in N devs (preferably the feature's author), who drop whatever they are doing. */
  private formSwarms() {
    for (const bug of this.tickets) {
      if (bug.kind !== 'bug' || bug.stage !== 'ready') continue;
      const parent = this.ticket(bug.parentId);
      const free = this.devs.filter((d) => d.role === 'dev' && d.bugId == null && this.activity(d) !== 'away');
      if (!free.length) continue; // at night / nobody available: wait for the team to arrive
      free.sort((a, b) => (a.id === parent?.author ? -1 : b.id === parent?.author ? 1 : 0));
      const crew = [free[0], ...this.shuffle(free.slice(1))].slice(0, Math.max(1, this.cfg.bugSwarmDevs));
      for (const d of crew) {
        d.bugId = bug.id;
        if (d.reviewTicketId != null) {
          // drops the review halfway: it goes back to the queue
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
      this.emit('bad', `🚨 ${crew.map((d) => d.name).join(', ')} dropped everything to tackle bug #${bug.id}`, { ticketId: bug.id });
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

  /** Night window: 1 dev (rotating) stays N hours doing the deploys and compensates the next day. */
  private updateDeploySession(h: number) {
    const s = this.deploySession;
    if (s) {
      this.nightHours += h;
      if (this.t < s.end) return;
      const dev = this.devs[s.devId];
      const hours = s.end - s.start;
      dev.offUntil = nextWorkdayStart(this.t) + hours;
      this.deploySession = null;
      this.emit('info', `${dev.name} finished the deploy (${hours.toFixed(1)}h late at night); compensates by arriving at ${clock(dev.offUntil)}`, { devId: dev.id });
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
    this.emit('warn', `🌙 Deploy window: ${dev.name} stays until ${clock(this.t + hours)}`, { devId: dev.id });
  }

  // ---- metrics --------------------------------------------------------------

  /** Whole-run summary for the final report. */
  report() {
    const days = (this.t - Sim.START_T) / 24;
    const weeks = Math.max(1 / 7, days / 7);
    const features = this.tickets.filter((tk) => tk.kind === 'feature' && tk.doneAt != null);
    const leads = features.map((tk) => (tk.doneAt! - tk.createdAt) / 24).sort((a, b) => a - b);
    const pct = (q: number) => (leads.length ? leads[Math.min(leads.length - 1, Math.floor(q * leads.length))] : 0);
    const bugs = this.tickets.filter((tk) => tk.kind === 'bug');
    const fixed = bugs.filter((tk) => tk.doneAt != null);
    const releases = this.tags.filter((t) => !t.hotfix && t.status === 'done');
    const weekly: number[] = Array.from({ length: Math.ceil(days / 7) }, () => 0);
    for (const tk of features) weekly[Math.min(weekly.length - 1, Math.floor((tk.doneAt! - Sim.START_T) / 168))]++;
    const team = this.devs
      .filter((d) => d.role === 'dev')
      .map((d) => {
        const mine = features.filter((tk) => tk.author === d.id);
        return {
          name: d.name,
          level: d.level,
          delivered: mine.length,
          devDays: mine.length ? mine.reduce((s, tk) => s + (tk.time.doing ?? 0), 0) / mine.length / 24 : 0,
          comments: mine.length ? mine.reduce((s, tk) => s + tk.comments, 0) / mine.length : 0,
          bugs: bugs.filter((b) => this.ticket(b.parentId)?.author === d.id).length,
        };
      });
    return {
      days,
      finished: this.finished,
      demands: this.tickets.filter((tk) => tk.kind === 'feature').length,
      delivered: features.length,
      throughputWeek: features.length / weeks,
      lead: { avg: leads.length ? leads.reduce((a, b) => a + b, 0) / leads.length : 0, p50: pct(0.5), p85: pct(0.85) },
      wipEnd: this.tickets.filter((tk) => !['backlog', 'done'].includes(tk.stage)).length,
      backlogEnd: this.inStage('backlog').length,
      all: this.metrics(Math.ceil(days) + 1),
      bugs: bugs.length,
      bugsOpen: bugs.length - fixed.length,
      mttrHours: fixed.length ? fixed.reduce((s, tk) => s + (tk.doneAt! - tk.createdAt), 0) / fixed.length : 0,
      rollbacks: this.tags.filter((t) => t.status === 'rolledback').length,
      releases: releases.length,
      hotfixes: this.tags.filter((t) => t.hotfix).length,
      nightHours: this.nightHours,
      aiSaved: this.aiSaved,
      aiCost: this.aiCost,
      weekly,
      team,
    };
  }

  metrics(windowDays = 30) {
    const since = this.t - windowDays * 24;
    const done = this.tickets.filter((tk) => tk.kind === 'feature' && tk.doneAt != null && tk.doneAt >= since);
    const bugs = this.tickets.filter((tk) => tk.kind === 'bug' && tk.createdAt >= since);
    const fixed = bugs.filter((tk) => tk.doneAt != null);
    const elapsedDays = Math.min(windowDays, (this.t - 8) / 24);
    const avg = (f: (tk: Ticket) => number) => (done.length ? done.reduce((s, tk) => s + f(tk), 0) / done.length : 0);
    const groups: Record<string, (tk: Ticket) => number> = {
      Backlog: (tk) => tk.time.backlog ?? 0,
      Refinement: (tk) => tk.time.refining ?? 0,
      'Ready queue': (tk) => tk.time.ready ?? 0,
      Development: (tk) => tk.time.doing ?? 0,
      'Code review': (tk) => tk.time.review ?? 0,
      'Merge queue': (tk) => tk.time.mergeQueue ?? 0,
      Main: (tk) => tk.time.main ?? 0,
      ...(this.firstProdEnv > 0 ? { 'Pre-prod deploy': (tk: Ticket) => this.deployTime(tk, false) } : {}),
      'Production deploy': (tk) => this.deployTime(tk, true),
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
      conflictsPerPR: avg((tk) => tk.conflicts),
      mergeQueue: this.inStage('review').filter((tk) => tk.awaitingMerge).length,
      prsPerTag: (() => {
        const ts = this.tags.filter((t) => !t.hotfix && t.status === 'done' && t.doneAt! >= since);
        return ts.length ? ts.reduce((sum, t) => sum + t.ticketIds.length, 0) / ts.length : 0;
      })(),
      bugs: bugs.length,
      openBugs: this.tickets.filter((tk) => tk.kind === 'bug' && tk.stage !== 'done').length,
      mttrHours: fixed.length ? fixed.reduce((sum, tk) => sum + (tk.doneAt! - tk.createdAt), 0) / fixed.length : 0,
      aiSavedWeek: this.t > 8 ? (this.aiSaved / ((this.t - 8) / 24)) * 7 : 0,
      aiCostWeek: this.t > 8 ? (this.aiCost / ((this.t - 8) / 24)) * 7 : 0,
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

  /** Share of the devs' working time per activity (since the start). */
  devTimeShare() {
    const total = Object.values(this.devHours).reduce((a, b) => a + b, 0) || 1;
    const share = (a: Activity) => this.devHours[a] / total;
    const rework = this.tickets.reduce((sum, tk) => sum + tk.reworkHours, 0);
    return {
      reworkOfCoding: this.devHours.coding ? rework / this.devHours.coding : 0,
      bugfix: share('bugfix'),
      coding: share('coding'), reviewing: share('reviewing'), meetings: share('daily') + share('meeting'), idle: share('idle') };
  }

  // ---- utilities ------------------------------------------------------------

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
