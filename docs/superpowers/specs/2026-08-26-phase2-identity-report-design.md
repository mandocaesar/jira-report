# Phase 2 — Identity, Report & Plan tabs

**Date:** 2026-08-26 · **Status:** Approved (UX proposal §7 Phase 2 + §9; user said "start phase 2")

## Scope

### 1. Identity (replaces shared password)
- Prisma: `User` (id, email unique, name, passwordHash, role: admin|em|lead|viewer, createdAt/updatedAt), `SquadMembership` (userId, teamId, role: em|lead|viewer, unique [userId, teamId]), `AuditLog` (id, userId, userName, action, entity, entityId, teamId?, before Json?, after Json?, at).
- bcryptjs for hashing.
- `/api/auth/login`: `{email, password}` → verify user → JWT `{sub: userId, role, name}`. **Legacy bootstrap:** body with only `{password}` matching `AUTH_PASSWORD` → auto-creates (once) admin user `armand.caesar@gmail.com` with that password, logs in as it. Old sessions/cookie name unchanged.
- Login page gains email field (password-only still works = legacy path).

### 2. Authorization
- `lib/authz.ts`: `getSessionUser(req)` (verify JWT, load role), pure `can(user, action, teamId?)`:
  - `admin` → everything
  - `edit_report`, `edit_leave`: membership `em`|`lead` on that team
  - `manage_roster`: membership `em`
  - `admin_settings`, `view_audit`: global admin only
  - viewers/no membership: read-only
- Enforced server-side on mutating routes: `/api/leave` POST, `/api/sprint-performance/em-report` POST, `/api/settings/holidays*` writes (admin), squads sync (manage_roster or admin), `/api/organisation/squads/[id]/allocations` writes if present.

### 3. Audit trail
- `lib/audit.ts`: `writeAudit(prismaTx, {user, action, entity, entityId, teamId, before, after})`; same-transaction where practical.
- Wired into the routes above. Reads never logged.
- `SprintEmNote` gains `updatedByName` — Report rows show "edited by X · 2h ago" provenance chip.
- Admin → Audit page (`/admin/audit`): filterable table (user, entity, date), before→after JSON viewer; API `/api/admin/audit` (admin only).

### 4. Home tabs: Check | Report | Plan
- Tab shell under the ContextBar (URL `?view=check|report|plan`), keyboard-accessible (`role="tablist"`).
- **Check** = existing home content (unchanged).
- **Report** = `EmReportTable` promoted here (removed from `/analytics`); provenance chips; edit fields disabled without `edit_report` (server enforces too).
- **Plan** = member capacity table for the selected sprint (theoretical, leave, allocation factor) with **inline leave editing** (day-count input per member, saved via `/api/leave`, engine numbers refresh); breakdown line (working days − holidays − non-dev). New light endpoint `GET /api/plan?boardId&sprintId` (loadSprintCapacity + SprintLeave counts).
- Retire orphaned adjustment UI: delete `CapacityAdjustmentModal`, `/api/capacity` (EngineerCapacity CRUD, zero readers), and its button on `/planning/capacity`.

### 5. Sync preserves manual roles
- `/api/organisation/squads/sync`: existing members keep their DB `role`/`title`/`excludeFromUtilization`; sync updates name/email, adds new members, removes departed ones. (Fixes the "re-sync resets QA roles" trap.)

## Out of scope
Portfolio, mobile breakpoint, Trends/Admin merge (Phase 3); per-area lead restriction on report rows; SSO.

## Verification
- Vitest: `can()` matrix (10+ cases); suite green; tsc; build.
- Browser: legacy login still works then user login; Report tab edit + provenance; Plan inline leave changes theoretical instantly; forbidden write → 403; audit rows appear; roles survive a squad re-sync.
