// Office floor plan in tile coordinates. Positions are floats (0.5 = tile center).
import { F } from './assets';

export const MAP_W = 34;
export const MAP_H = 24;

export interface Pt {
  x: number;
  y: number;
}

export type FloorKind = 'wood' | 'wood2' | 'carpet' | 'carpet2' | 'green' | 'tile' | 'prod';

export interface Prop {
  frame: number;
  x: number; // tile
  y: number;
  flat?: boolean; // rugs: lie on the floor, below everything
  block?: boolean;
}

export interface Layout {
  wall: boolean[][];
  blocked: boolean[][];
  floor: FloorKind[][];
  props: Prop[];
  labels: { text: string; x: number; y: number }[];
  board: { x: number; y: number; w: number; h: number; title: string }[];
  desks: { seat: Pt; card: Pt; monitor: Pt }[];
  poSeat: Pt;
  poMeetingSeat: Pt;
  deployConsole: { seat: Pt; monitor: Pt };
  meetingSeats: Pt[];
  meetingCard: (i: number) => Pt;
  idleSpots: Pt[];
  standupSpots: Pt[]; // in front of the board: daily standup and where devs pick up tasks
  poStandup: Pt;
  readyCard: (i: number) => Pt;
  readyCapacity: number;
  backlogCard: (i: number) => Pt;
  backlogCapacity: number;
  reviewCard: (i: number) => Pt;
  reviewCapacity: number;
  racks: { label: Pt; bar: Pt; canaryCard: (i: number) => Pt; queueCard: (i: number) => Pt }[];
  mainCard: (i: number) => Pt;
  mainCapacity: number;
  doneCard: (i: number) => Pt;
  doneCapacity: number;
  door: Pt;
  outside: Pt;
}

const grid = <T>(v: T) => Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, () => v));

export function buildLayout(envCount: number, prodCount: number): Layout {
  const wall = grid(false);
  const blocked = grid(false);
  const floor = grid<FloorKind>('wood');
  const props: Prop[] = [];
  const labels: Layout['labels'] = [];

  const setWall = (x: number, y: number) => {
    wall[y][x] = true;
    blocked[y][x] = true;
  };
  const fill = (x0: number, y0: number, x1: number, y1: number, k: FloorKind) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) floor[y][x] = k;
  };
  const put = (frame: number, x: number, y: number, block = true) => {
    props.push({ frame, x, y, block });
    if (block) blocked[y][x] = true;
  };
  const table = (x0: number, x1: number, y: number) => {
    for (let x = x0; x <= x1; x++) put(x === x0 ? F.tableL : x === x1 ? F.tableR : F.tableM, x, y);
  };
  const slots = (x0: number, y0: number, perRow: number, dx: number, dy: number) => (i: number): Pt => ({
    x: x0 + (i % perRow) * dx,
    y: y0 + Math.floor(i / perRow) * dy,
  });

  // Outer walls (the top one is 2 tiles tall, top-down style)
  for (let x = 0; x < MAP_W; x++) {
    setWall(x, 0);
    setWall(x, 1);
    setWall(x, MAP_H - 1);
  }
  for (let y = 0; y < MAP_H; y++) {
    setWall(0, y);
    if (y !== 12 && y !== 13) setWall(MAP_W - 1, y); // entrance door on the right
  }
  // Inner partitions
  for (let y = 2; y <= 10; y++) if (y !== 6 && y !== 7) setWall(11, y);
  for (let x = 0; x <= 11; x++) if (x !== 5 && x !== 6) setWall(x, 11);
  for (let y = 11; y < MAP_H; y++) if (y !== 13 && y !== 14) setWall(11, y);
  for (let x = 11; x < MAP_W; x++) if (x !== 20 && x !== 21) setWall(x, 15);

  fill(1, 12, 10, 22, 'wood2');
  fill(12, 2, 25, 11, 'carpet');
  fill(26, 2, 32, 11, 'carpet2');
  fill(12, 16, 32, 22, 'tile');

  // --- Product / backlog (top-left room) ---
  const board = [
    { x: 1.5, y: 0.15, w: 5.2, h: 1.7, title: 'BACKLOG' },
    { x: 7.0, y: 0.15, w: 3.5, h: 1.7, title: 'READY FOR DEV' },
    { x: 26.5, y: 0.15, w: 6, h: 1.7, title: 'PULL REQUESTS' },
  ];
  table(3, 4, 6);
  put(F.officeChair, 3, 5, false);
  put(F.stove, 1, 9); // coffee corner
  put(F.plant, 10, 10);
  labels.push({ text: 'PRODUCT', x: 5.5, y: 9.6 });

  // --- Refinement room ---
  fill(2, 14, 9, 20, 'green');
  table(3, 8, 17);
  const meetingSeats: Pt[] = [];
  for (const x of [3, 5, 7]) {
    put(F.chairFront, x, 16, false);
    meetingSeats.push({ x: x + 0.5, y: 16.5 });
  }
  for (const x of [4, 6, 8]) {
    put(F.chairBack, x, 18, false);
    meetingSeats.push({ x: x + 0.5, y: 18.5 });
  }
  put(F.plant, 1, 12);
  put(F.plant, 10, 22);
  labels.push({ text: 'REFINEMENT', x: 5.5, y: 12.6 });

  // --- Dev team ---
  const desks: Layout['desks'] = [];
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 3; col++) {
      const dx = 13 + col * 4;
      const dy = 4 + row * 3;
      table(dx, dx + 1, dy);
      put(F.officeChair, dx, dy - 1, false);
      desks.push({ seat: { x: dx + 0.5, y: dy - 0.45 }, card: { x: dx + 1.5, y: dy + 0.3 }, monitor: { x: dx + 0.5, y: dy - 0.05 } });
    }
  for (const x of [12, 25]) put(F.plantSmall, x, 2);
  labels.push({ text: 'DEV TEAM', x: 18.5, y: 11.6 });

  // --- Code review area ---
  table(27, 31, 5);
  table(27, 31, 8);
  labels.push({ text: 'CODE REVIEW', x: 29.5, y: 11.6 });

  // --- main branch: merged PRs waiting for the next tag ---
  table(23, 28, 13);
  labels.push({ text: 'MAIN', x: 26, y: 14.2 });

  // --- Infra: one rack per environment + production area ---
  const racks: Layout['racks'] = [];
  const span = 15 / Math.max(1, envCount);
  const firstProd = Math.max(0, envCount - Math.max(1, prodCount));
  const rackX = (i: number) => Math.round(13 + i * span + span / 2 - 1);
  // different floor under the production racks
  const prodStart = firstProd === 0 ? 12 : Math.max(12, rackX(firstProd) - 1);
  fill(prodStart, 16, 27, 22, 'prod');
  for (let i = 0; i < envCount; i++) {
    const rx = rackX(i);
    put(F.server, rx, 18);
    put(F.serverAlt, rx + 1, 18);
    racks.push({
      label: { x: rx + 1, y: 16.05 },
      bar: { x: rx + 1, y: 17.35 },
      canaryCard: slots(rx + 0.35, 18.35, 3, 0.65, 0.5),
      queueCard: slots(rx + 0.1, 20.2, 4, 0.5, 0.6),
    });
  }
  fill(28, 17, 32, 21, 'green');
  // deploy console (where the on-call dev sits at night)
  table(12, 13, 22);
  put(F.officeChair, 12, 21, false);
  if (prodStart > 13) labels.push({ text: 'PRE-PROD', x: (12 + prodStart) / 2, y: 22.6 });
  labels.push({ text: 'PRODUCTION', x: (prodStart + 28) / 2, y: 22.6 });
  labels.push({ text: 'DELIVERED', x: 30, y: 16.6 });

  return {
    wall,
    blocked,
    floor,
    props,
    labels,
    board,
    desks,
    poSeat: { x: 3.5, y: 5.55 },
    poMeetingSeat: { x: 2.5, y: 17.5 },
    deployConsole: { seat: { x: 12.5, y: 21.55 }, monitor: { x: 12.5, y: 21.95 } },
    meetingSeats,
    meetingCard: slots(3.35, 17.4, 8, 0.7, 0.3),
    idleSpots: [
      { x: 2.5, y: 9.4 }, { x: 3.4, y: 8.6 }, { x: 4.3, y: 9.5 }, { x: 2.2, y: 10.4 }, { x: 3.3, y: 10.5 },
      { x: 5.2, y: 8.7 }, { x: 4.4, y: 10.4 }, { x: 6.2, y: 9.6 }, { x: 5.4, y: 10.5 },
    ],
    standupSpots: Array.from({ length: 9 }, (_, i) => ({ x: 1.9 + i * 0.95, y: i % 2 ? 4.0 : 3.2 })),
    poStandup: { x: 6.2, y: 5.2 },
    readyCard: slots(7.35, 0.85, 7, 0.45, 0.45),
    readyCapacity: 21,
    backlogCard: slots(1.9, 0.85, 10, 0.5, 0.45),
    backlogCapacity: 30,
    reviewCard: slots(27.4, 5.35, 7, 0.65, 3),
    reviewCapacity: 14,
    racks,
    mainCard: slots(23.3, 13.35, 11, 0.5, 0.35),
    mainCapacity: 22,
    doneCard: slots(28.5, 17.6, 8, 0.5, 0.55),
    doneCapacity: 64,
    door: { x: 33.5, y: 12.5 },
    outside: { x: 35, y: 12.5 },
  };
}

/** 4-way BFS; returns the tile centers along the path (excluding the start point). */
export function findPath(layout: Layout, from: Pt, to: Pt): Pt[] {
  const sx = Math.floor(from.x), sy = Math.floor(from.y);
  const tx = Math.floor(to.x), ty = Math.floor(to.y);
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
  if (!inside(sx, sy) || !inside(tx, ty)) return [to];
  const prev = new Int32Array(MAP_W * MAP_H).fill(-1);
  const start = sy * MAP_W + sx;
  const goal = ty * MAP_W + tx;
  prev[start] = start;
  const queue = [start];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    if (cur === goal) break;
    const cx = cur % MAP_W, cy = (cur / MAP_W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (!inside(nx, ny)) continue;
      const n = ny * MAP_W + nx;
      if (prev[n] !== -1) continue;
      if (layout.blocked[ny][nx] && n !== goal) continue;
      prev[n] = cur;
      queue.push(n);
    }
  }
  if (prev[goal] === -1) return [to];
  const path: Pt[] = [];
  for (let c = goal; c !== start; c = prev[c]) path.push({ x: (c % MAP_W) + 0.5, y: ((c / MAP_W) | 0) + 0.5 });
  path.reverse();
  path[path.length - 1] = to; // last step goes exactly to the target point
  return path;
}
