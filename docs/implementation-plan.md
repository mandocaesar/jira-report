# Engineering Performance Tracker — Implementation Plan

> **Target**: Transform jira-report from a sprint utilization viewer into a full Engineering Performance Tracker per the requirements specification.
>
> **Branch**: `feature/organisation-hierarchy`
> **Last updated**: 2026-03-19

---

## Progress Tracker

| Phase | Name | Status | Milestone |
|-------|------|--------|-----------|
| 1 | Database Schema Overhaul | ✅ Complete | 2026-03-19 |
| 2 | Settings Pages | ✅ Complete | 2026-03-19 |
| 3 | Organisation — Engineers & Leaves | ✅ Complete | 2026-03-19 |
| 4 | Organisation — Squad Detail Rewrite | ✅ Complete | 2026-03-19 |
| 5 | Sprint Performance Page | ✅ Complete | 2026-03-20 |
| 6 | Leadership Dashboard | 🔲 Not Started | — |
| 7 | Timesheet (Worklog Enhancement) | 🔲 Not Started | — |

---

## Phase 1 — Database Schema Overhaul

**Goal**: Establish the data foundation. No UI work until this is solid.

**Why first**: Every other phase depends on these models.

### Tasks

| # | Task | Details | Status |
|---|------|---------|--------|
| 1.1 | Extend TeamMember with NIK/gender | Added `nik` (unique) and `gender` fields to `TeamMember`. | ✅ |
| 1.2 | Extend Team with code/isActive | Added `code` (unique) and `isActive` fields to `Team`. | ✅ |
| 1.3 | Add CapacityAllocation | Per engineer/squad/sprint. Type: SPRINT or BAU. FK to TeamMember + Team. | ✅ |
| 1.4 | Add NonDevDay | Per sprint/team: date + reason. Unique on team+sprint+date. | ✅ |
| 1.5 | Add Holiday to DB | Date (unique), name, isActive, year. Indexed by year+active. | ✅ |
| 1.6 | Add DataSource | Name, boardId, JQL, isActive, sync status, linked to team. | ✅ |
| 1.7 | Add JiraConnection | Singleton: baseUrl, email, apiToken, sync config, test status. | ✅ |
| 1.8 | Add WorkTypeLabel | Jira label name (unique) → category mapping. | ✅ |
| 1.9 | Add Leave | TeamMember FK, start/end date (DATE), type (annual/sick/personal). | ✅ |
| 1.10 | Migration file | `20260319000000_phase1_schema_overhaul` — applied to local Docker PG. | ✅ |
| 1.11 | Keep legacy models | `SprintLeave`, `EngineerCapacity` kept for backward compat. | ✅ |

### New/Changed Models

```
Engineer          — NIK, fullName, gender, title, teamId, departmentId
CapacityAllocation — engineerId, teamId, sprintId?, type, startDate, endDate, capacityPercent
NonDevDay         — sprintId, teamId, date, reason
Holiday           — date, name, isActive, year
DataSource        — name, boardId, jqlQuery, isActive, lastSyncAt, issueCount, teamId
JiraConnection    — baseUrl, email, apiToken, status (singleton)
WorkTypeLabel     — labelName, description, isActive
Leave             — engineerId, startDate, endDate, type, notes
```

### Migration Strategy
- Keep `TeamMember`, `SprintLeave`, `EngineerCapacity` temporarily for backward compat
- New models added alongside existing ones
- Data migration script copies existing records into new models
- Old models deprecated after Phase 5

---

## Phase 2 — Settings Pages

**Goal**: Configuration UIs that populate the new models.

**Depends on**: Phase 1

### Tasks

| # | Task | Route | Status |
|---|------|-------|--------|
| 2.1 | Jira Integration page | `/settings/jira` | ✅ |
| 2.2 | National Holidays page | `/settings/holidays` | ✅ |
| 2.3 | Work Type Labels page | `/settings/work-type-labels` | ✅ |
| 2.4 | Update Sidebar | Add 3 new settings links | ✅ |

### `/settings/jira` Sections
- **Connection**: Base URL, email, API token, Save/Test buttons
- **Sync Config**: Auto-sync toggle, schedule (15min / daily)
- **Connection Status**: Not configured / Saved / OK / Error
- **Data Sources**: CRUD table (name, boardId, JQL, active, sync now, force re-sync, fetch worklogs toggle)

### `/settings/holidays` Features
- CRUD table, filter by year
- "Fetch from API" button (imports via lib/holiday-source.ts: Google Calendar ICS → guangrei fallback, skips duplicates)
- Active/Inactive toggle per holiday

### `/settings/work-type-labels` Features
- CRUD table: Jira label → category
- Issues without matching labels grouped as "Other"

---

## Phase 3 — Organisation: Engineers & Leaves

**Goal**: People management. Prerequisite for capacity allocations.

**Depends on**: Phase 1

### Tasks

| # | Task | Route | Status |
|---|------|-------|--------|
| 3.1 | Engineers list page | `/organisation/engineers` | ✅ |
| 3.2 | Engineer detail page | `/organisation/engineers/[id]` | ✅ |
| 3.3 | Leaves management page | `/organisation/leaves` | ✅ |
| 3.4 | CRUD APIs | `/api/organisation/engineers`, `/api/organisation/leaves` | ✅ |
| 3.5 | Update Sidebar | Add Engineers + Leaves under Organisation | ✅ |

### `/organisation/engineers` Features
- Paginated, searchable table (name, NIK)
- Cascading filter modal: Group → Division → Department → Squad
- Add Engineer: NIK, name, title, gender, hierarchy dropdowns
- View → detail page, Delete with cascading check

### `/organisation/engineers/[id]` Features
- Profile card, allocations list, leaves list, sprint history

### `/organisation/leaves` Features
- CRUD table with search (NIK/name), filter by engineer/date range
- Add: engineer (searchable), start/end date, type (Annual/Sick/Personal)
- Columns: NIK, Name, Team, Dept, Division, Start, End, Duration, Type

---

## Phase 4 — Organisation: Squad Detail Rewrite

**Goal**: Replace `/metrics/squad/[id]` with the full-spec squad hub.

**Depends on**: Phase 1, Phase 3

### Tasks

| # | Task | Status |
|---|------|--------|
| 4.1 | Squad list page (`/organisation/squads`) | ✅ |
| 4.2 | Squad Info Card (editable Working Hours/Day) | ✅ |
| 4.3 | Period Selection (Yearly / Custom Date Range) | ✅ |
| 4.4 | Data Source Links section | ✅ |
| 4.5 | Performance Statistics (full KPI cards) | ✅ |
| 4.6 | Distribution Charts (Epic + Label) | ✅ |
| 4.7 | Leadership Roles display | ✅ |
| 4.8 | Members Table (full KPI columns) | ✅ |
| 4.9 | Sprints Table (sortable) | ✅ |
| 4.10 | Capacity Allocations Table (SPRINT/BAU, CRUD) | ✅ |
| 4.11 | Overallocation protection (100%/day validation) | ✅ |
| 4.12 | Redirect `/metrics/squad/[id]` → `/organisation/squads/[id]` | ✅ |

---

## Phase 5 — Sprint Performance Page

**Goal**: The core daily-use page for squads and EMs.

**Depends on**: Phase 1, Phase 4

### Tasks

| # | Task | Status |
|---|------|--------|
| 5.1 | Capacity pipeline (prorated allocation formula) | ✅ |
| 5.2 | Hours-based metrics (Committed Hours, Logged Hours, Planned/Exec Util, SP/Hour) | ✅ |
| 5.3 | Sprint Performance page (`/sprint-performance`) | ✅ |
| 5.4 | Sprint Report tab (Overview, Totals, 8 KPIs, Non-Dev Days, Allocations, Charts, Issues, Engineer Metrics) | ✅ |
| 5.5 | History tab (past sprints table) | ✅ |
| 5.6 | Export XLSX + CSV | ✅ |
| 5.7 | Refactor home page | ⏭️ Deferred |
| 5.8 | Refine AI Summary prompt for Scrum Master insights | ✅ |

### Capacity Pipeline (Section 8 of spec)
```
1. Determine allocation date range
2. Determine sprint date range (start → effective end)
3. Calculate overlap
4. For each day in overlap:
   Weekend? → Exclude | Holiday? → Exclude | Non-Dev Day? → Exclude | Leave? → Exclude | else → Working Day
5. fullWorkingDays = working days in full allocation period
6. workingDaysInOverlap = working days in overlap window
7. ratio = workingDaysInOverlap / fullWorkingDays
8. proratedWorkingDays = fullWorkingDays × ratio
9. allocatedHours = proratedWorkingDays × workingHoursPerDay × (capacityPercent / 100)
```

### 8 KPI Cards
| Metric | Formula |
|--------|---------|
| Planned Utilisation | Committed Hours / Capacity Hours |
| Execution Utilisation | Logged Hours / Capacity Hours |
| Exec vs Commitment | Logged Hours / Committed Hours |
| Completion Rate | Completed Tasks / Committed Tasks |
| SP per Hour | Committed SP / Committed Hours |
| Avg Velocity | Total SP / Active Sprint Count |
| Avg Cycle Time | Avg hours In Progress → Resolution (working hours) |
| Median Cycle Time | Median of above |

Color coding: Green (≥90%), Yellow (75–90%), Orange (50–75%), Red (<50%)

---

## Phase 6 — Leadership Dashboard

**Goal**: Executive view replacing the home page.

**Depends on**: Phase 1–5

### Tasks

| # | Task | Status |
|---|------|--------|
| 6.1 | Hierarchical aggregation lib (Squad → Dept → Division → Group) | 🔲 |
| 6.2 | Dashboard page (replace `/`) | 🔲 |
| 6.3 | Filters (View As, Scope, Period) | 🔲 |
| 6.4 | Aggregated KPI Cards (12 metrics) | 🔲 |
| 6.5 | Squad Comparison Table (sortable) | 🔲 |
| 6.6 | Charts (Epic distribution, Label distribution, Performance Ranking) | 🔲 |

### Aggregated KPI Cards
- Total Squads / Total Engineers
- Sprint / BAU / Total Capacity
- Committed SP, Avg Velocity, SP per Hour
- Logged Hours, Planned / Execution Utilisation
- Completion Rate, Avg & Median Cycle Time

---

## Phase 7 — Timesheet (Worklog Enhancement)

**Goal**: Standalone timesheet page. Enhances existing WorklogReport.

**Depends on**: Phase 1 (for Leave/Holiday DB models), but can start partially independent.

### Tasks

| # | Task | Status |
|---|------|--------|
| 7.1 | New `/timesheet` page with engineer selector + date range picker (max 31 days) | 🔲 |
| 7.2 | Extend `/api/worklogs` for engineerId + startDate/endDate params | 🔲 |
| 7.3 | Enhanced grid — ticket key + summary per cell, grouped by time slot | 🔲 |
| 7.4 | Visual indicators — Holiday (yellow), Leave (blue), Weekend (gray), Working (white) | 🔲 |
| 7.5 | Export — XLSX, CSV, Print-optimized CSS | 🔲 |
| 7.6 | Keep existing WorklogReport on home page (team heatmap view) | 🔲 |

### Existing Assets (reusable)
- `components/WorklogReport.tsx` — heatmap grid, heatmap colors, weekend detection
- `/api/worklogs` — fetches Jira worklogs by board/sprint, aggregates per member per day
- `WorklogReportData`, `MemberWorklog`, `DailyWorklog` types

### Delta from existing WorklogReport
| Feature | WorklogReport (current) | Timesheet (target) |
|---------|------------------------|-------------------|
| Scope | All team members in sprint | Single engineer, custom date range |
| Cell content | Hours only (heatmap) | Ticket key + summary per time slot |
| Day indicators | Weekend shading only | Weekend + Holiday + Leave colors |
| Export | None | XLSX, CSV, Print |
| Route | Embedded in home page | Standalone `/timesheet` |

---

## Dependency Graph

```
Phase 1 (Schema) ─────────────────────────────────────────┐
  ├── Phase 2 (Settings)                                   │
  ├── Phase 3 (Engineers & Leaves)                         │
  │     └── Phase 4 (Squad Detail)                         │
  │           └── Phase 5 (Sprint Performance)             │
  │                 └── Phase 6 (Leadership Dashboard)     │
  └── Phase 7 (Timesheet) ← partially independent         │
```

---

## Migration Strategy

- **No big-bang rewrite.** Each phase ships independently.
- **Backward compat:** Old pages keep working until replacements ship.
- **One Prisma migration per phase** for clean rollbacks.
- Old models (`TeamMember`, `SprintLeave`, `EngineerCapacity`) deprecated after Phase 5.

---

## Changelog

| Date | Milestone | Notes |
|------|-----------|-------|
| 2026-03-19 | Plan created | Gap analysis complete, 7 phases defined |
| 2026-03-19 | Phase 1 complete | Schema overhaul: 7 new models + 2 model extensions. Migration `20260319000000_phase1_schema_overhaul` applied to local Docker PG. Prisma client generated, TypeScript compiles clean. |
| 2026-03-19 | Phase 2 complete | Settings pages: Jira Integration (`/settings/jira`), National Holidays (`/settings/holidays`), Work Type Labels (`/settings/work-type-labels`). 6 API routes + 3 UI pages + Sidebar updated. TypeScript clean. |
| 2026-03-19 | Phase 3 complete | Organisation pages: Engineers list + detail (`/organisation/engineers`, `/organisation/engineers/[id]`), Leaves management (`/organisation/leaves`). 3 API routes + 3 UI pages + Sidebar updated. TypeScript clean. |
