# DevLife Simulator

A visual (top-down, Gather-style) simulator of a software team's delivery flow:
demand arriving in the backlog, refinement, daily standup, development, code review (dev + tech lead),
review comments and refactoring, merge queue with a limit on PRs in main and merge conflicts,
release tags (1+ PRs) deployed at night by an on-call dev with time compensation, canary per
production environment (P1 → P2 → P3, 1 environment per day, Monday to Thursday) and production bugs
with a swarm, priority review and hotfix.

The team is defined by its composition (seniors / mid-levels / juniors) and per-level traits (average days per
feature, % of PRs with review comments, % of deliveries with a production bug, review pickup speed); the sidebar
shows per-dev results.

**AI-powered mode** models the pros and cons of AI usage: faster coding and slightly fewer mistakes up to a
sweet spot; beyond it, over-reliance increases review comments and production bugs (juniors hit harder), diffs get
bigger (more review effort and merge conflicts) and bugs take longer to debug. The sidebar keeps an AI ledger of
dev-hours saved vs. lost.

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
