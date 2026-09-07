# Phase 3 — Snapshots, Portfolio, Trends, Mobile Report

**Date:** 2026-09-04 · **Status:** Approved (UX proposal §7 Phase 3, §8, §10, §11-lite; user said "start phase 3")

## Scope

### 1. Closed-sprint snapshots (speed)
- New `SprintSnapshot` model: `(boardId, sprintId, kind)` unique, `payload Json`, `computedAt`. Kinds: `check` (`/api/sprint/[id]` response body), `performance`, `em-report`.
- `lib/snapshot.ts`: `getSnapshot(boardId, sprintId, kind)` / `saveSnapshot(...)`.
- Wire read-through into the three routes: **closed** sprints only — snapshot hit returns instantly; miss computes then stores; `?refresh=true` recomputes and overwrites. Active/future sprints never snapshot.
- Payload includes `snapshotAt` so UIs can show "computed 3d ago · Refresh".

### 2. Portfolio (`/portfolio`)
- `GET /api/portfolio`: squads visible to the user (admin → all active teams; else teams in their `SquadMembership`; users with zero memberships → all active, read-only view). Per squad: id, name, boardId, active sprint (id/name/dates) from Jira, health checks (reuse `computeHealth` inputs).
- Page: card per squad — name, active sprint + dates, health chip; **lazy** buffer/util per card (client fetches `/api/sprint/[id]` per board, shimmer while loading, snapshot makes closed fetches instant; active sprint stays live-computed).
- Card click → `/?board=X&sprint=<active>` (context bar takes over).
- Sidebar: "Portfolio" at top of Dashboard section.

### 3. Trends tab (home, 4th tab)
- `computeAssignment` gains `deliveredFromCommitted` (done ∧ not added-mid-sprint, current points) per member + team — unit-tested.
- History route adds `deliveredFromCommitted` + `addedMidSprint` (already has) per row.
- Trends tab content (uses existing `/api/sprint-performance/history`):
  - KPI tiles with unicode sparklines + 3-sprint delta: **Throughput** (actual ÷ theoretical MD), **Plan hit rate** (deliveredFromCommitted ÷ assignedAtStart, ≤100), **Scope churn** (added ÷ assignedAtStart), **Utilization** (assigned ÷ theoretical)
  - Compact history table: sprint, period, throughput bar, utilization badge, churn badge, click → Check for that sprint (context bar follows)
- Not in v1 (parked): capacity-line chart annotations, member drill-down tiles, analytics-page deletion (page stays; full merge later).

### 4. Mobile Report
- `EmReportTable`: `<640px` renders card-per-area stack (`md:hidden` cards + `hidden md:block` table) — same data + editing; touch targets ≥44px on mobile controls.

### 5. Cosmetic
- Sidebar Settings section renamed "Admin".

## Verification
- Vitest: `deliveredFromCommitted` cases; snapshot helper logic (pure parts); suite green; tsc; build.
- Live: snapshot hit vs miss timing on a closed sprint (second load <1s); portfolio cards render + click-through; Trends tiles vs hand-checked numbers; mobile viewport (375px) Report card stack; refresh bypass works.
