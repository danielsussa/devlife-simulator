import Phaser from 'phaser';
import { DEV_SPRITES, PO_SPRITE, SHEETS, TILE, TL_SPRITES } from './assets';
import { buildLayout, findPath, Layout, MAP_H, MAP_W, Pt } from './office';
import { Activity, DAY_END, DAY_START, Sim, SimEvent, Ticket } from './sim';

const FLOOR_COLORS: Record<string, [string, string]> = {
  wood: ['#b98a5a', '#ad7f50'],
  wood2: ['#a8794d', '#9c6f45'],
  carpet: ['#5f7d93', '#58758a'],
  carpet2: ['#7a6a8c', '#716282'],
  green: ['#4f8a5b', '#4a8256'],
  tile: ['#c9ced3', '#bcc2c8'],
  prod: ['#d9c3a5', '#cfb898'],
};

interface Walker {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  bubble: Phaser.GameObjects.Text;
  pos: Pt;
  path: Pt[];
  goal: Pt | null;
  visible: boolean;
  bob: number;
}

interface Card {
  img: Phaser.GameObjects.Image;
  pos: Pt;
  dots: Phaser.GameObjects.Graphics;
  stage: string;
  picked: boolean; // in 'doing': the dev already went to the board to fetch the card
  carrying: boolean; // between the board and the desk: the card is in the dev's hand
}

export interface SceneHooks {
  sim: () => Sim;
  tick: (dtSeconds: number) => void;
  hoursPerSecond: () => number;
  highlightId: () => number | null;
}

export class OfficeScene extends Phaser.Scene {
  private layout!: Layout;
  private devs: Walker[] = [];
  private po!: Walker;
  private cards = new Map<number, Card>();
  private flashes = new Map<number, { text: string; until: number }>();
  private overlay!: Phaser.GameObjects.Graphics;
  private dyn!: Phaser.GameObjects.Graphics;
  private night!: Phaser.GameObjects.Rectangle;
  private lamp!: Phaser.GameObjects.Graphics;
  private hlText!: Phaser.GameObjects.Text;
  private rackTexts: Phaser.GameObjects.Text[] = [];
  private overflowTexts: Phaser.GameObjects.Text[] = [];
  private built = false;

  constructor(private hooks: SceneHooks) {
    super('office');
  }

  preload() {
    for (const s of Object.values(SHEETS))
      this.load.spritesheet(s.key, s.url, { frameWidth: TILE, frameHeight: TILE, spacing: s.spacing });
  }

  create() {
    this.makeTextures();
    this.rebuild();
    this.scale.on('resize', () => this.fitCamera());
  }

  /** Rebuilds the whole world (called when the simulation resets). */
  rebuild() {
    this.children.removeAll(true);
    this.cards.clear();
    this.flashes.clear();
    this.rackTexts = [];
    this.overflowTexts = [];
    const sim = this.hooks.sim();
    this.layout = buildLayout(sim.envs.length, sim.cfg.prodEnvCount);
    this.drawFloor();
    this.drawProps();

    this.dyn = this.add.graphics().setDepth(5);
    this.overlay = this.add.graphics().setDepth(20000);

    sim.envs.forEach((env, i) => {
      const r = this.layout.racks[i];
      const t = this.label(env.name.toUpperCase(), r.label.x, r.label.y, 8).setDepth(20001).setAlign('center');
      if (sim.isProdEnv(i)) t.setColor('#ffd59a');
      this.rackTexts.push(t);
    });
    this.hlText = this.label('', 0, 0, 7).setDepth(32000).setColor('#ffe14d').setVisible(false);
    for (let i = 0; i < 4; i++) this.overflowTexts.push(this.label('', 0, 0, 8).setDepth(20001).setColor('#ffe9a8'));

    let tl = 0;
    this.devs = sim.devs.map((d, i) =>
      this.makeWalker(d.role === 'techlead' ? TL_SPRITES[tl++ % TL_SPRITES.length] : DEV_SPRITES[i % DEV_SPRITES.length], this.layout.outside),
    );
    this.po = this.makeWalker(PO_SPRITE, this.layout.poSeat);

    this.nightAlpha = 0;
    this.night = this.add.rectangle(0, 0, MAP_W * TILE, MAP_H * TILE, 0x0b1030, 0).setOrigin(0).setDepth(30000);
    // desk lamp for the on-call deployer
    const c = this.layout.deployConsole.seat;
    this.lamp = this.add.graphics().setDepth(30001).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    for (let r = 44; r > 0; r -= 4) this.lamp.fillStyle(0xffd27a, 0.025).fillCircle(c.x * TILE, c.y * TILE, r);
    this.built = true;
    this.fitCamera();
  }

  onSimEvent(e: SimEvent) {
    if (e.devId == null) return;
    if (e.kind === 'review-ok') this.flashes.set(e.devId, { text: `✅ approved #${e.ticketId}`, until: this.time.now + 1800 });
    if (e.kind === 'review-changes') this.flashes.set(e.devId, { text: `✋ changes #${e.ticketId}`, until: this.time.now + 1800 });
  }

  update(_: number, deltaMs: number) {
    if (!this.built) return;
    const dt = Math.min(deltaMs / 1000, 0.1);
    this.hooks.tick(dt);
    const sim = this.hooks.sim();
    // ~20 tiles per simulated hour: crossing the office takes ~1.5h on the sim clock
    const walkSpeed = Math.max(6, this.hooks.hoursPerSecond() * 20); // tiles/s

    this.updatePeople(sim, dt, walkSpeed);
    this.updateCards(sim, dt);
    this.drawOverlay(sim);
    this.updateNight(sim, dt);
  }

  // ---- people ---------------------------------------------------------------

  private updatePeople(sim: Sim, dt: number, speed: number) {
    const L = this.layout;
    let idleIdx = 0;
    sim.devs.forEach((dev, i) => {
      const w = this.devs[i];
      const act: Activity = sim.activity(dev);
      let goal: Pt;
      let text = '';
      const standup = L.standupSpots[i % L.standupSpots.length];
      // Freshly pulled task: the card is still on the board, the dev goes to fetch it.
      const own = sim.ticket(dev.ticketId);
      const ownCard = own && this.cards.get(own.id);
      const mustFetch = !!ownCard && !ownCard.picked && act === 'coding';
      // spot in front of the board, under the card (after the daily everyone fetches their own)
      const fetchSpot = ownCard ? { x: Phaser.Math.Clamp(ownCard.pos.x, 1.6, 10.4), y: 2.55 } : standup;
      switch (act) {
        case 'away':
          goal = L.outside;
          break;
        case 'bugfix': {
          // swarm around the desk of whoever leads the fix
          const bug = sim.ticket(dev.bugId)!;
          const k = Math.max(0, bug.swarm.indexOf(dev.id));
          const lead = L.desks[(bug.devId ?? i) % L.desks.length].seat;
          const off = [[0, 0], [-0.9, 0.15], [0.9, 0.15], [-0.7, -0.75], [0.7, -0.75], [0, -0.9]][k % 6];
          goal = { x: lead.x + off[0], y: lead.y + off[1] };
          text = `🐞 #${bug.id} ${Math.floor((100 * bug.workDone) / bug.workTotal)}%`;
          break;
        }
        case 'deploying': {
          goal = L.deployConsole.seat;
          const envs = sim.envs.filter((e) => e.batch.length).map((e) => e.name);
          text = `🌙 deploy${envs.length ? ' ' + envs.join(', ') : ''}`;
          break;
        }
        case 'daily':
          goal = standup;
          text = own ? `🗂 #${own.id}` : '🧍 daily';
          break;
        case 'meeting': {
          const k = sim.meeting?.devIds.indexOf(dev.id) ?? 0;
          goal = L.meetingSeats[Math.max(0, k) % L.meetingSeats.length];
          text = '🗣 refining';
          break;
        }
        case 'reviewing':
          goal = L.desks[i % L.desks.length].seat;
          text = `👀 ${dev.role === 'techlead' ? 'TL ' : ''}PR #${dev.reviewTicketId}`;
          break;
        case 'coding': {
          goal = mustFetch ? fetchSpot : L.desks[i % L.desks.length].seat;
          const tk = sim.ticket(dev.ticketId)!;
          text = `${tk.rework ? '🔧' : sim.cfg.aiUsage > 0 ? '🤖' : '💻'} #${tk.id} ${Math.floor((100 * tk.workDone) / tk.workTotal)}%`;
          break;
        }
        default:
          if (dev.role === 'techlead') {
            goal = L.desks[i % L.desks.length].seat; // TL with no PR to review stays at the desk
            text = '🧭 TL';
          } else {
            goal = L.idleSpots[idleIdx++ % L.idleSpots.length];
            text = '☕';
          }
      }
      const flash = this.flashes.get(i);
      if (flash && flash.until > this.time.now) text = flash.text;
      this.steer(w, goal, act !== 'away');
      w.bubble.setBackgroundColor(act === 'deploying' ? '#ffe9a8' : act === 'bugfix' ? '#ffc9c9' : '#ffffffee');
      this.moveWalker(w, dt, speed, text);
      if (mustFetch && !w.path.length && Math.hypot(w.pos.x - fetchSpot.x, w.pos.y - fetchSpot.y) < 0.1) {
        ownCard!.picked = true;
        ownCard!.carrying = true;
      }
    });

    // PO: at their desk, or at the head of the meeting table
    const poGoal = !sim.working ? L.outside : sim.inDaily ? L.poStandup : sim.meeting ? L.poMeetingSeat : L.poSeat;
    this.steer(this.po, poGoal, sim.working);
    this.moveWalker(this.po, dt, speed, sim.inDaily ? '📋 daily' : sim.meeting ? '📋 PO' : '');
  }

  private makeWalker(frame: number, at: Pt): Walker {
    const shadow = this.add.ellipse(0, 0, 10, 4, 0x000000, 0.25);
    const sprite = this.add.sprite(0, 0, SHEETS.chars.key, frame).setOrigin(0.5, 1);
    const bubble = this.add
      .text(0, 0, '', {
        fontFamily: 'ui-monospace, Menlo, monospace',
        fontSize: '7px',
        color: '#1d1d1f',
        backgroundColor: '#ffffffee',
        padding: { x: 2, y: 1 },
        resolution: 4,
      })
      .setOrigin(0.5, 1);
    const w: Walker = { sprite, shadow, bubble, pos: { ...at }, path: [], goal: null, visible: true, bob: 0 };
    this.placeWalker(w);
    return w;
  }

  private steer(w: Walker, goal: Pt, inside: boolean) {
    if (w.goal && w.goal.x === goal.x && w.goal.y === goal.y) return;
    w.goal = goal;
    const L = this.layout;
    const outside = w.pos.x > MAP_W;
    if (!inside) {
      w.path = outside ? [] : [...findPath(L, w.pos, L.door), L.outside];
    } else if (outside) {
      w.path = [L.door, ...findPath(L, L.door, goal)];
    } else {
      w.path = findPath(L, w.pos, goal);
    }
  }

  private moveWalker(w: Walker, dt: number, speed: number, text: string) {
    let budget = speed * dt;
    const moving = w.path.length > 0;
    while (budget > 0 && w.path.length) {
      const p = w.path[0];
      const dx = p.x - w.pos.x, dy = p.y - w.pos.y;
      const d = Math.hypot(dx, dy);
      if (d <= budget) {
        w.pos = { ...p };
        w.path.shift();
        budget -= d;
      } else {
        w.pos.x += (dx / d) * budget;
        w.pos.y += (dy / d) * budget;
        budget = 0;
      }
      if (dx < -0.01) w.sprite.setFlipX(true);
      else if (dx > 0.01) w.sprite.setFlipX(false);
    }
    w.bob = moving ? w.bob + dt * 14 : 0;
    w.visible = w.pos.x < MAP_W - 0.6;
    w.bubble.setText(moving ? '' : text);
    this.placeWalker(w);
  }

  private placeWalker(w: Walker) {
    const px = w.pos.x * TILE, py = w.pos.y * TILE + 6;
    const lift = Math.abs(Math.sin(w.bob)) * 2;
    w.sprite.setPosition(px, py - lift).setDepth(py).setVisible(w.visible);
    w.shadow.setPosition(px, py - 1).setDepth(py - 0.5).setVisible(w.visible);
    w.bubble.setPosition(px, py - 17).setDepth(31000 + py).setVisible(w.visible && w.bubble.text !== '');
  }

  // ---- cards (tickets) ------------------------------------------------------

  private updateCards(sim: Sim, dt: number) {
    const L = this.layout;
    const counters = { backlog: 0, ready: 0, review: 0, done: 0, meeting: 0, main: 0 };
    const queue = sim.envs.map(() => 0);
    const canary = sim.envs.map(() => 0);
    const highlight = this.hooks.highlightId();
    const seen = new Set<number>();
    const overflow = { backlog: 0, ready: 0, review: 0, done: 0 };

    // most recently done first
    const ordered = [...sim.tickets].sort((a, b) =>
      a.stage === 'done' && b.stage === 'done' ? b.doneAt! - a.doneAt! : 0,
    );

    for (const tk of ordered) {
      let target: Pt | null = null;
      switch (tk.stage) {
        case 'backlog':
          if (counters.backlog < L.backlogCapacity) target = L.backlogCard(counters.backlog++);
          else overflow.backlog++;
          break;
        case 'refining':
          target = L.meetingCard(counters.meeting++);
          break;
        case 'ready':
          if (counters.ready < L.readyCapacity) target = L.readyCard(counters.ready++);
          else overflow.ready++;
          break;
        case 'doing': {
          const c = this.cards.get(tk.id);
          const w = this.devs[tk.devId!];
          const desk = L.desks[tk.devId! % L.desks.length];
          // paused feature (dev interrupted by a refactor) sits next to it, not stacked
          const paused = sim.devs[tk.devId!]?.pausedTicketId === tk.id;
          const spot = paused ? { x: desk.card.x - 0.45, y: desk.card.y } : desk.card;
          if (c && (c.stage !== 'doing' || !c.picked)) target = { ...c.pos }; // waits on the board
          else if (c?.carrying && w) {
            // carried from the board to the desk; once at the chair, the card goes down on the desk
            const atDesk = !w.path.length && Math.hypot(w.pos.x - desk.seat.x, w.pos.y - desk.seat.y) < 0.2;
            if (atDesk || !w.visible) c.carrying = false;
            target = c.carrying ? { x: w.pos.x + 0.3, y: w.pos.y - 0.1 } : spot;
          } else target = spot;
          break;
        }
        case 'review':
          if (counters.review < L.reviewCapacity) target = L.reviewCard(counters.review++);
          else overflow.review++;
          break;
        case 'deploy': {
          if (tk.tagId == null && tk.hotfixEnds == null) {
            target = counters.main < L.mainCapacity ? L.mainCard(counters.main++) : null;
            break;
          }
          const r = L.racks[tk.envIndex];
          target = tk.deploying ? r.canaryCard(canary[tk.envIndex]++) : r.queueCard(queue[tk.envIndex]++);
          break;
        }
        case 'done':
          if (counters.done < L.doneCapacity) target = L.doneCard(counters.done++);
          else overflow.done++;
          break;
      }
      if (!target) continue;
      seen.add(tk.id);
      let card = this.cards.get(tk.id);
      if (!card) {
        const start = tk.stage === 'backlog' ? { x: L.door.x, y: L.door.y } : { ...target };
        card = {
          img: this.add.image(0, 0, 'card'),
          pos: start,
          dots: this.add.graphics(),
          stage: tk.stage,
          picked: tk.stage === 'doing',
          carrying: false,
        };
        this.cards.set(tk.id, card);
      }
      if (card.stage !== tk.stage) {
        // only needs fetching from the board if it left the "ready" column; rework goes straight to the desk
        card.picked = card.stage !== 'ready' || tk.kind === 'bug';
        card.carrying = false;
        card.stage = tk.stage;
      }
      const carried = tk.stage === 'doing' && card.carrying;
      const k = carried ? 1 : Math.min(1, dt * 6);
      card.pos.x += (target.x - card.pos.x) * k;
      card.pos.y += (target.y - card.pos.y) * k;
      const px = card.pos.x * TILE, py = card.pos.y * TILE;
      const hl = highlight === tk.id;
      card.img
        .setPosition(px, py)
        .setTint(tk.color)
        .setScale(1)
        .setDepth(hl ? 26000 : tk.stage === 'backlog' || (tk.stage === 'ready' && card.pos.y < 2) ? 3 : carried ? 24000 : (Math.floor(card.pos.y) + 1) * TILE + 2);
      this.drawCardDots(card, tk, px, py);
    }
    for (const [id, card] of this.cards) {
      if (!seen.has(id)) {
        card.img.destroy();
        card.dots.destroy();
        this.cards.delete(id);
      }
    }

    const ov: [number, Pt][] = [
      [overflow.backlog, { x: 6.2, y: 1.95 }],
      [overflow.ready, { x: 10.1, y: 1.95 }],
      [overflow.review, { x: 31.6, y: 10.4 }],
      [overflow.done, { x: 31.5, y: 22.2 }],
    ];
    ov.forEach(([n, p], i) => {
      this.overflowTexts[i].setText(n ? `+${n}` : '').setPosition(p.x * TILE, p.y * TILE);
    });
  }

  private drawCardDots(card: Card, tk: Ticket, px: number, py: number) {
    const g = card.dots;
    g.clear();
    g.setDepth(card.img.depth + 1);
    if (tk.stage === 'review' && tk.reviews.length) {
      tk.reviews.forEach((rv, i) => {
        const x = px - (tk.reviews.length - 1) * 2.5 + i * 5;
        g.fillStyle(rv.done ? 0x35c46a : rv.started ? 0xffd34d : 0x5b5b66, 1);
        if (rv.role === 'techlead') g.fillRect(x - 1.8, py - 9.8, 3.6, 3.6); // TL = square
        else g.fillCircle(x, py - 8, 1.8);
      });
    }
    if (tk.rework) {
      g.fillStyle(0xe5484d, 1);
      g.fillCircle(px + 4, py - 5, 1.6);
    }
  }

  // ---- dynamic overlays --------------------------------------------------------

  private drawOverlay(sim: Sim) {
    const g = this.overlay;
    g.clear();
    const L = this.layout;
    // canary bars
    sim.envs.forEach((env, i) => {
      const r = L.racks[i];
      const x = r.bar.x * TILE - 14, y = r.bar.y * TILE;
      g.fillStyle(0x1b1f24, 0.85).fillRoundedRect(x - 1, y - 1, 30, 5, 2);
      if (env.batch.length) {
        const p = Phaser.Math.Clamp((sim.t - env.startedAt) / (env.endsAt - env.startedAt), 0, 1);
        g.fillStyle(0xf2b33d, 1).fillRoundedRect(x, y, 28 * p, 3, 1.5);
        this.rackTexts[i].setText(`${env.name.toUpperCase()}\n${sim.tag(env.tagId)?.name ?? ''} ${Math.round(p * 100)}%`);
      } else {
        const recent = env.result && sim.t - env.resultAt < 3;
        if (recent) g.fillStyle(env.result === 'ok' ? 0x35c46a : 0xe5484d, 1).fillRoundedRect(x, y, 28, 3, 1.5);
        this.rackTexts[i].setText(`${env.name.toUpperCase()}\n `);
      }
      // rack LEDs
      const lx = r.label.x * TILE - 10, ly = 18 * TILE + 3;
      const busy = env.batch.length > 0;
      for (let k = 0; k < 4; k++) {
        const on = busy ? Math.floor(this.time.now / 150 + k) % 2 === 0 : k === 0;
        g.fillStyle(on ? (busy ? 0xffc23d : 0x35c46a) : 0x2c3036, 1).fillRect(lx + k * 6, ly, 2, 2);
      }
    });

    // highlight of the card under the mouse in the kanban: pulsing ring + number
    const hl = this.hooks.highlightId();
    const hc = hl != null ? this.cards.get(hl) : undefined;
    if (hc) {
      const x = hc.pos.x * TILE, y = hc.pos.y * TILE;
      const r = 8 + 2 * Math.sin(this.time.now / 120);
      g.lineStyle(1.5, 0xffe14d, 1).strokeCircle(x, y, r);
      g.lineStyle(1, 0xffe14d, 0.35).strokeCircle(x, y, r + 3);
      this.hlText.setText(`#${hl}`).setPosition(x, y - r - 9).setVisible(true);
    } else this.hlText.setVisible(false);

    // incident alarm
    if (sim.tickets.some((tk) => tk.kind === 'bug' && tk.stage !== 'done')) {
      const a = 0.35 + 0.35 * Math.sin(this.time.now / 180);
      g.lineStyle(3, 0xff3b3b, a).strokeRect(1.5, 1.5, MAP_W * TILE - 3, MAP_H * TILE - 3);
      const prod = L.racks[L.racks.length - 1];
      g.fillStyle(0xff3b3b, a * 0.5).fillCircle(prod.label.x * TILE, 18.5 * TILE, 14);
    }

    // line from the reviewer to the PR being read
    const d = this.dyn;
    d.clear();
    sim.devs.forEach((dev, i) => {
      if (sim.activity(dev) !== 'reviewing') return;
      const card = this.cards.get(dev.reviewTicketId!);
      const w = this.devs[i];
      if (!card || w.path.length) return;
      d.lineStyle(1, 0xffd34d, 0.5);
      d.lineBetween(w.pos.x * TILE, w.pos.y * TILE - 4, card.pos.x * TILE, card.pos.y * TILE);
    });
    d.setDepth(19000);
  }

  private nightAlpha = 0;

  private updateNight(sim: Sim, dt: number) {
    const h = sim.t % 24;
    const day = Math.floor(sim.t / 24) % 7;
    let a: number;
    if (h >= DAY_START - 1 && h < DAY_END + 1) a = 0;
    else if (h >= DAY_START - 2 && h < DAY_START - 1) a = 0.45 * (DAY_START - 1 - h);
    else if (h >= DAY_END + 1 && h < DAY_END + 2) a = 0.45 * (h - DAY_END - 1);
    else a = 0.45;
    if (day >= 5) a = Math.max(a, 0.3);
    // At high speed the day/night cycle turns into flicker: fade the night out as
    // speed grows (full up to 4h/s, ~25% at 1d/s and above)...
    const hps = this.hooks.hoursPerSecond();
    const strength = Phaser.Math.Clamp(1 - (hps - 4) / 26, 0.25, 1);
    a *= strength;
    // ...and low-pass the alpha (~0.5s) so transitions never snap
    this.nightAlpha += (a - this.nightAlpha) * (1 - Math.exp(-dt / 0.5));
    this.night.setFillStyle(0x0b1030, this.nightAlpha);
    this.lamp.setVisible(!!sim.deploySession && this.nightAlpha > 0.1);
  }

  // ---- static setup ------------------------------------------------------------

  private makeTextures() {
    const g = this.make.graphics({}, false);
    // task card (white, tinted with the ticket color)
    g.fillStyle(0x000000, 0.35).fillRect(1, 1, 7, 8);
    g.fillStyle(0xffffff, 1).fillRect(0, 0, 7, 8);
    g.fillStyle(0xdddddd, 1).fillRect(1, 3, 5, 1).fillRect(1, 5, 4, 1);
    g.generateTexture('card', 8, 9);
    g.clear();
    // monitor
    g.fillStyle(0x24272b, 1).fillRect(0, 0, 12, 8);
    g.fillStyle(0x4fb3ff, 1).fillRect(1, 1, 10, 6);
    g.fillStyle(0x24272b, 1).fillRect(5, 8, 2, 2).fillRect(3, 10, 6, 1);
    g.generateTexture('monitor', 12, 11);
    g.destroy();
  }

  private drawFloor() {
    const L = this.layout;
    const key = 'floor';
    if (this.textures.exists(key)) this.textures.remove(key);
    const tex = this.textures.createCanvas(key, MAP_W * TILE, MAP_H * TILE)!;
    const c = tex.getContext();
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        const px = x * TILE, py = y * TILE;
        if (L.wall[y][x]) {
          const front = y + 1 < MAP_H && !L.wall[y + 1][x];
          c.fillStyle = front ? '#e9e1d3' : '#3b3f4a';
          c.fillRect(px, py, TILE, TILE);
          if (front) {
            c.fillStyle = '#cfc5b3';
            c.fillRect(px, py + TILE - 3, TILE, 3);
          } else {
            c.fillStyle = '#2f323b';
            c.fillRect(px, py, TILE, 2);
          }
          continue;
        }
        const kind = L.floor[y][x];
        const [a, b] = FLOOR_COLORS[kind];
        c.fillStyle = (x + y) % 2 ? a : b;
        c.fillRect(px, py, TILE, TILE);
        c.fillStyle = 'rgba(0,0,0,0.07)';
        if (kind === 'wood' || kind === 'wood2') {
          c.fillRect(px, py + 7, TILE, 1);
          c.fillRect(px + ((y % 2) ? 4 : 11), py, 1, 7);
          c.fillRect(px + ((y % 2) ? 12 : 3), py + 8, 1, 8);
        } else if (kind === 'tile' || kind === 'prod') {
          c.fillRect(px, py, TILE, 1);
          c.fillRect(px, py, 1, TILE);
        }
      }
    // notice boards
    for (const b of L.board) {
      const x = b.x * TILE, y = b.y * TILE, w = b.w * TILE, h = b.h * TILE;
      c.fillStyle = '#6b4a2b';
      c.fillRect(x - 2, y - 1, w + 4, h + 3);
      c.fillStyle = '#c99a62';
      c.fillRect(x, y + 1, w, h - 1);
    }
    tex.refresh();
    this.add.image(0, 0, key).setOrigin(0).setDepth(0);
    for (const b of L.board) this.label(b.title, b.x + b.w / 2, b.y + 0.1, 7).setColor('#3a2614').setDepth(2);
  }

  private drawProps() {
    const L = this.layout;
    for (const p of L.props) {
      const img = this.add.image(p.x * TILE, (p.y + 1) * TILE, SHEETS.indoor.key, p.frame).setOrigin(0, 1);
      img.setDepth(p.flat ? 1 : (p.y + 1) * TILE + (p.block ? 0 : -10));
    }
    for (const m of [...L.desks.map((d) => d.monitor), L.deployConsole.monitor])
      this.add.image(m.x * TILE, m.y * TILE, 'monitor').setDepth(m.y * TILE + 12);
    for (const l of L.labels) this.label(l.text, l.x, l.y, 8).setDepth(4).setAlpha(0.75);
  }

  private label(text: string, x: number, y: number, size: number) {
    return this.add
      .text(x * TILE, y * TILE, text, {
        fontFamily: 'ui-monospace, Menlo, monospace',
        fontSize: `${size}px`,
        fontStyle: 'bold',
        color: '#ffffff',
        resolution: 4,
      })
      .setOrigin(0.5, 0);
  }

  private fitCamera() {
    const cam = this.cameras.main;
    const w = this.scale.width, h = this.scale.height;
    const zoom = Math.min(w / (MAP_W * TILE), h / (MAP_H * TILE));
    cam.setZoom(zoom);
    cam.centerOn((MAP_W * TILE) / 2, (MAP_H * TILE) / 2);
    cam.setBackgroundColor('#1c1f26');
  }
}
