# jira-report — File Map

## Pages
- `app/page.tsx` — Home: Sprint Overview (board → sprint → utilization)
- `app/login/page.tsx` — Login page
- `app/planning/capacity/page.tsx` — Capacity planning forecast
- `app/planning/velocity/page.tsx` — Sprint velocity
- `app/metrics/page.tsx` — Metrics dashboard
- `app/reports/team/page.tsx` — Team report
- `app/settings/leave/page.tsx` — Manage sprint leave
- `app/settings/team/page.tsx` — View team members
- `app/settings/title-days/page.tsx` — Title-based day settings

## Components
- `BoardSelector.tsx` — Board dropdown
- `SprintSelector.tsx` — Sprint dropdown
- `SprintSummary.tsx` — Summary cards (days, points, breakdown)
- `UserUtilizationCard.tsx` — Engineer utilization card
- `EpicBreakdown.tsx` — Epic point distribution
- `CapacityAdjustmentModal.tsx` — Edit capacity adjustments
- `Sidebar.tsx` — Collapsible nav sidebar
- `SprintReport.tsx` — Sprint report view
- `SprintReportPDF.tsx` — PDF export
- `WorklogReport.tsx` — Worklog report view
- `CollapsibleSection.tsx` — Collapsible UI section
- `ThemeProvider.tsx` / `ThemeToggle.tsx` — Theme system

## Core Logic (lib/)
- `jira-client.ts` — Jira REST API (boards, sprints, issues, epics)
- `utilization-calculator.ts` — Utilization % math
- `sprint-report-calculator.ts` — Sprint report aggregations
- `metrics-calculator.ts` — Metrics computations
- `team-roster.ts` — Team lookups from config JSON
- `holiday-service.ts` — Indonesian holidays (libur.deno.dev)
- `issue-helpers.ts` — Issue type categorization
- `cache.ts` — Caching utilities
- `db.ts` — Prisma singleton

## API Routes (app/api/)
- `auth/login` / `auth/logout` — JWT auth
- `boards` — List Jira boards
- `sprints` — List sprints for a board
- `sprint/[id]` — Sprint detail + utilization
- `epics` — List epics
- `epic-breakdown` — Epic point breakdown
- `holidays` — Indonesian public holidays
- `team-members` — All members from roster
- `team-report` — Team-level report
- `team-report/member` — Individual member report
- `leave` — Sprint leave CRUD
- `capacity` — Capacity adjustments CRUD
- `worklogs` — Worklog data
- `metrics` — Sprint metrics
- `metrics/board` — Board-level metrics
- `planning/forecast` — Sprint capacity forecast
- `planning/sprint-velocity` — Velocity trends
- `ai-summary` — AI sprint summary
- `ai-metrics-summary` — AI metrics summary
- `report/pdf` — PDF export
- `settings/teams` — Team management
- `settings/teams/members` — Team member management
- `settings/teams/sync` — Sync teams from Jira
- `settings/title-days` — Title-based day config
- `settings/seed` — Seed data
- `cron` — Scheduled tasks

## Config
- `config/team-roster.json` — Team definitions (members, roles, boards)
- `middleware.ts` — JWT auth guard
- `prisma/schema.prisma` — DB schema
