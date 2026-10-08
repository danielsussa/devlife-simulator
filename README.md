# DevLife Simulator

Simulador visual (top-down, estilo Gather) do fluxo de entrega de um time de software:
demanda chegando no backlog, refinamento, daily, desenvolvimento, code review (dev + tech lead),
apontamentos e refatoração, merge, deploy noturno com plantão e compensação de horário,
canary por ambiente (dev → staging → P1 → P2 → P3, 1 ambiente por dia) e bugs em produção
com mutirão, review prioritário e hotfix.

Tudo é parametrizável (⚙ Parâmetros) e as métricas mostram lead time, throughput, gargalo,
eficiência de fluxo, ociosidade, retrabalho, horas de madrugada e tempo de correção de bugs.

## Rodando

```bash
npm install
npm run dev
```

## Estrutura

- `src/sim.ts`: motor da simulação (TypeScript puro, sem dependência de renderização)
- `src/office.ts`: planta do escritório e pathfinding
- `src/scene.ts`: cena Phaser (personagens, cards, canary, noite, alarmes)
- `src/ui.ts`: kanban, métricas, log e formulário de parâmetros
- `src/assets.ts`: único lugar que conhece os tilesets (troque aqui pra usar outro pack)

## Créditos

Tiles e personagens: [Kenney](https://kenney.nl) (CC0).
