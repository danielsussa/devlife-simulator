# DevLife Simulator

A visual (top-down, Gather-style) simulator of a software team's delivery flow:
demand arriving in the backlog, refinement, daily standup, development, code review (dev + tech lead),
review comments and refactoring, merge queue with a limit on PRs in main and merge conflicts,
release tags (1+ PRs) deployed at night by an on-call dev with time compensation, canary per
production environment (P1 → P2 → P3, 1 environment per day, Monday to Thursday) and production bugs
with a swarm, priority review and hotfix.

Each developer has a profile (level junior/mid/senior, average days per feature, % of PRs with review comments,
% of deliveries with a production bug, review pickup speed), and the sidebar shows per-dev results.

Everything is configurable (⚙ Settings, shareable via the URL) and the metrics show lead time, throughput, bottleneck,
flow efficiency, idle time, rework, night hours and bug fix time.

## Running

```bash
npm install
npm run dev
```

## Structure

- `src/sim.ts`: simulation engine (plain TypeScript, no rendering dependency)
- `src/office.ts`: office floor plan and pathfinding
- `src/scene.ts`: Phaser scene (characters, cards, canary, night, alarms)
- `src/ui.ts`: kanban, metrics, log and parameters form
- `src/assets.ts`: the only place that knows the tilesets (change it here to use another pack)

## Credits

Tiles and characters: [Kenney](https://kenney.nl) (CC0).
