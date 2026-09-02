# Phase 1 — Context Bar + Check View

**Date:** 2026-08-26 · **Status:** Approved (UX proposal §2/§4/§7, user said "start Phase 1")

## Goal
Pick squad + sprint once, keep it everywhere, land on the active sprint by default. Fix the accessibility criticals in the same stroke. Enrich Home into the "Check" view.

## Scope

### 1. Accessibility foundation (audit criticals)
- Global `:focus-visible` ring in `app/globals.css` (2px accent outline, offset 2)
- Skip link (`Skip to content`) first element in layout, `sr-only` until focused, targets `#main-content`
- Single `<main id="main-content">`; sidebar brand demoted from `<h1>`

### 2. ContextBar component (`components/ContextBar.tsx`)
Replaces BoardSelector + SprintSelector on the home page:
- **Squad picker** + **sprint picker** as accessible listboxes: `aria-haspopup="listbox"`, `aria-expanded`, `role="listbox"/"option"`, `aria-activedescendant`; keyboard: Enter/Space opens, Arrow Up/Down moves, Enter selects, **Escape closes**, outside click closes
- **Sprint stepper** ◀ ▶ buttons (aria-labels), disabled at ends; order = chronological
- **Data-health chip**: green `✓ data healthy` / amber `⚠ N issues` with `title` + click → popover list; from new health endpoint
- Sprint labels: `Sprint 12 · Jun 15–26` + state badge (active/closed/future)

### 3. URL state + defaults (home page)
- `/?board=3816&sprint=17677` ⇄ component state (router.replace, no history spam); loading a URL with params selects them
- localStorage `lastContext` {boardId, sprintId}; on bare `/`: restore last board, then auto-select its **active** sprint (fallback: latest closed)
- Board switch → auto-select that board's active sprint (not blank)

### 4. Health endpoint (`GET /api/context/health?boardId&sprintId`)
Returns `{ checks: [{id, ok, label, hint}], ok }`:
- `roles`: team in DB and has ≥1 qa and ≥1 engineer (wrong-roles class)
- `holidays`: `Holiday` rows exist for the sprint's year(s) (unseeded-year class)
- `team`: board has DB Team row (degraded-mode class)
- `sync`: `Team.lastSyncedAt` within 7 days (stale-roster class)
Pure helper `computeHealth(inputs)` unit-tested; route is thin IO.

### 5. Check enrichment (home page)
Below existing summary (buffer strip stays): new collapsible **"Delivery & Accuracy"** section fed by existing `/api/sprint-performance` response: completion rate, avg/median cycle time, task-accuracy team ratio + top-5 worst-estimated tasks. No new math — reuse response fields.

## Out of scope (later phases)
Tab shell (Check/Report/Plan/Trends), path-style URLs, Portfolio, ACL, mobile breakpoint, analytics merge, sprint snapshots.

## Verification
- Vitest: `computeHealth` cases (5+); suite stays green
- tsc + build clean
- Browser: keyboard-only walk (Tab ring visible, Escape closes pickers), URL round-trip, default landing on active sprint, health chip states (healthy FT vs 0-QA warning)
