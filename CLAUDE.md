# Jira Sprint Report — Project Documentation

## Overview

Internal dashboard for tracking Jira sprint utilization, team mandays, and capacity planning. Built for **Bank Sinarmas** engineering teams.

**Key concept**: In this project, **story points = mandays** (1 story point = 1 man-day).

---

## Tech Stack

| Layer       | Technology                              |
|-------------|----------------------------------------|
| Framework   | Next.js 16 (App Router)                |
| Language    | TypeScript                             |
| Styling     | Tailwind CSS v4 (dark theme, purple/pink gradients) |
| Database    | PostgreSQL 16 (via Docker Compose)     |
| ORM         | Prisma 5                               |
| Auth        | JWT (jose) with password login         |
| Font        | Inter (Google Fonts)                   |
| Deployment  | Vercel                                 |
| External APIs | Jira REST API, Indonesian Holiday sources (Google Calendar ICS, fallback guangrei dataset) |

---

## Project Structure

```
jira-report/
├── app/
│   ├── page.tsx                    # Home — Sprint Overview (board → sprint → utilization cards)
│   ├── layout.tsx                  # Root layout with Sidebar wrapper
│   ├── globals.css                 # Global styles
│   ├── login/page.tsx              # Password login page
│   ├── planning/
│   │   └── capacity/page.tsx       # Capacity planning — forecast sprint capacity
│   ├── settings/
│   │   ├── leave/page.tsx          # Manage sprint leave per engineer
│   │   └── team/page.tsx           # View team members (read-only from roster)
│   └── api/                        # API Routes (see API section below)
├── components/
│   ├── Sidebar.tsx                 # Collapsible sidebar navigation
│   ├── BoardSelector.tsx           # Dropdown to pick a Jira board
│   ├── SprintSelector.tsx          # Dropdown to pick a sprint (depends on board)
│   ├── SprintSummary.tsx           # Summary cards (working days, points, QA/Eng breakdown)
│   ├── UserUtilizationCard.tsx     # Individual engineer utilization card
│   ├── EpicBreakdown.tsx           # Epic-level point distribution
│   └── CapacityAdjustmentModal.tsx # Modal to add/edit capacity adjustments
├── lib/
│   ├── jira-client.ts              # Jira REST API client (boards, sprints, issues, epics)
│   ├── utilization-calculator.ts   # Sprint utilization calculations
│   ├── team-roster.ts              # Team config helpers (lookup by board/accountId)
│   ├── holiday-service.ts          # Indonesian holiday API integration + working days
│   └── db.ts                       # Prisma client singleton
├── config/
│   └── team-roster.json            # Team definitions (members, roles, board mappings)
├── types/
│   └── index.ts                    # TypeScript interfaces
├── prisma/
│   └── schema.prisma               # Database schema
├── middleware.ts                    # JWT auth middleware
├── docker-compose.yml              # PostgreSQL local dev
└── .env.local                      # Environment variables (never commit)
```

---

## Teams

Defined in `config/team-roster.json`:

| Team                | Board ID | Engineers | QA |
|--------------------|----------|-----------|-----|
| Fund Transfer      | 3816     | 6         | 1   |
| Payment Collection | 3817     | 10        | 2   |

Each member has: `accountId` (Jira), `name`, `email`, `role` (engineer/qa), `title`.

---

## Database (Prisma Models)

| Model              | Purpose                                           |
|--------------------|--------------------------------------------------|
| `SprintLeave`      | Leave days per engineer per sprint                |
| `EngineerCapacity` | Capacity adjustments (training, leave, part-time) |
| `SprintMetrics`    | Historical sprint metrics snapshots               |

**Connection**: Set `POSTGRES_PRISMA_URL` in `.env.local`. Local dev uses Docker Compose PostgreSQL.

---

## API Routes

| Method  | Endpoint                          | Purpose                                    |
|---------|-----------------------------------|--------------------------------------------|
| POST    | `/api/auth/login`                 | Password login → JWT cookie                |
| POST    | `/api/auth/logout`                | Clear auth cookie                          |
| GET     | `/api/boards`                     | List Jira boards                           |
| GET     | `/api/sprints?boardId=X`          | List sprints for a board                   |
| GET     | `/api/sprint/[id]?boardId=X`      | Sprint detail with utilization data        |
| GET     | `/api/epics?boardId=X`            | List epics for a board                     |
| GET     | `/api/epic-breakdown?boardId&sprintId` | Epic-level point breakdown            |
| GET     | `/api/holidays?year=X`            | Indonesian public holidays                 |
| GET     | `/api/team-members`               | All team members from roster               |
| GET/POST| `/api/leave`                      | Manage sprint leave days                   |
| CRUD    | `/api/capacity`                   | Manage engineer capacity adjustments       |
| GET     | `/api/planning/forecast?boardId&months` | Sprint capacity forecast              |

---

## Authentication

- **Method**: Simple password auth (no user accounts)
- **Password**: Set via `AUTH_PASSWORD` env var
- **Token**: JWT stored in `auth-token` cookie, verified by `middleware.ts`
- **Secret**: `AUTH_SECRET` env var (for JWT signing)
- **Public routes**: `/login`, `/api/auth/login`

---

## Key Business Logic

The capacity model is **days-only** — mandays are computed purely from calendar days, leave-day
counts, and allocation percentages. Hours never feed capacity math anywhere; hours exist only as a
separate, display-only accuracy lens (see below).

### Capacity Engine (`lib/capacity-engine.ts`)

- Sprint working days = weekdays in the sprint − Indonesian holidays − non-dev days (team-specific
  non-working dates, e.g. offsites)
- Theoretical mandays per roster member = sprint working days × allocation factor − leave days
  (clamped to ≥ 0; a negative leave-day count also clamps to 0)
- Leave days come from `SprintLeave` (day counts per engineer per sprint, entered via
  Capacity Planning), not date ranges
- Allocation factor comes from `CapacityAllocation` (% of the sprint a member is allocated to this
  team); defaults to 1 (fully allocated) when no allocation record exists
- Excluded roster members (e.g. EMs) always contribute 0 theoretical mandays

### SP Assignment & Buffer (`lib/sprint-assignment.ts`)

- Assigned-at-start mandays = story points assigned to a member as of sprint start (1 SP = 1
  manday)
- Buffer = theoretical mandays − assigned-at-start mandays (positive = spare capacity, negative =
  already overloaded at sprint start)
- Added-during-sprint = points added mid-sprint (scope creep); overload SP = the portion of that
  addition that didn't fit inside the buffer
- Verdict = `fit` or `overload`, computed per member and for the team
- Utilization % = team assigned-at-start mandays ÷ team theoretical mandays × 100

### Task Accuracy — hours lens (`lib/task-accuracy.ts`)

- `HOURS_PER_MANDAY` (`lib/constants.ts`) = **6** — the only SP↔hours conversion anywhere in the app
- Expected hours per issue = story points × `HOURS_PER_MANDAY`
- Accuracy ratio = logged worklog hours ÷ expected hours, per issue/member/team
- Display-only: this ratio is a calibration/coaching signal and never adjusts capacity or
  utilization numbers

### Capacity Planning (`app/planning/capacity/page.tsx`)

- Forecasts upcoming sprint capacity per engineer using the days-only capacity engine
- Accounts for leave days, non-dev days, holidays, and allocation records
- Shows: theoretical mandays, buffer, and team capacity per sprint

### Issue Categorization

- **Product**: Story, Task, Sub-task (default)
- **Technical Initiatives**: Technical Initiative, Chore
- **Incident**: Incident, Bug, Defect

### Team Filtering

- Uses `JIRA_BOARD_TEAM_MAP` env var (format: `boardId1:teamId1,boardId2:teamId2`)
- Filters issues by `customfield_10001` (Team field) client-side

---

## Environment Variables

```env
# Jira API
JIRA_DOMAIN=your-domain.atlassian.net
JIRA_EMAIL=your-email@company.com
JIRA_API_TOKEN=your-jira-api-token
JIRA_PROJECT_KEY=YOUR_PROJECT
JIRA_BOARD_TEAM_MAP=boardId1:teamId1,boardId2:teamId2

# Auth
AUTH_PASSWORD=changeme123
AUTH_SECRET=generate-a-random-32-character-string

# Database (local Docker)
POSTGRES_PRISMA_URL=postgresql://postgres:postgres@localhost:5432/jira_report
```

---

## Development Commands

```bash
# Start local database
docker compose up -d

# Run Prisma migrations
npx prisma migrate dev

# Start dev server
pnpm run dev

# Generate Prisma client
npx prisma generate

# Open Prisma Studio
npx prisma studio
```

---

## Design Guidelines

- **Theme**: Dark mode with purple/pink gradient accents
- **Colors**: Gray-900 backgrounds, purple-500/pink-500 accents, glassmorphism effects
- **Cards**: `rounded-2xl`, `backdrop-blur-sm`, gradient borders
- **Animations**: Fade-in, pulse, spin loaders
- **Font**: Inter
- **UI Pattern**: Board selector → Sprint selector → Data display
- **Sidebar**: Collapsible, dark themed, sections: Dashboard, Planning, Settings, Analytics

---

## Important Notes

1. **Story Points = Mandays**: This is a fundamental assumption in this project
2. **Jira custom fields**: Story points use `customfield_10036` and `customfield_10052` (QA)
3. **Holidays**: DB `Holiday` table is the primary source (Settings → Holidays); external fallback/import uses Google Calendar ICS with guangrei dataset backup (`lib/holiday-source.ts`, cached 24h). `libur.deno.dev` is dead.
4. **Database is optional**: The app works without a database (gracefully degrades)
5. **Team roster is static**: Defined in JSON, not in the database
6. **Deployed on Vercel**: Uses Vercel Postgres in production
