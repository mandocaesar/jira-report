# Local Development Database Setup

This guide shows how to set up a local PostgreSQL database for development.

## Quick Start with Docker Compose

1. **Start the database**:

   ```bash
   docker-compose up -d
   ```

2. **Update your `.env.local`** with local database URLs:

   ```bash
   POSTGRES_PRISMA_URL=postgresql://postgres:postgres@localhost:5432/jira_report
   POSTGRES_URL_NON_POOLING=postgresql://postgres:postgres@localhost:5432/jira_report
   ```

3. **Run Prisma migrations**:

   ```bash
   npx prisma migrate dev --name init
   ```

4. **Verify the database**:

   ```bash
   npx prisma studio
   ```

   This opens a web UI at <http://localhost:5555> to view your database.

## Alternative: Install PostgreSQL Locally

If you don't want to use Docker:

### macOS (using Homebrew)

```bash
brew install postgresql@16
brew services start postgresql@16
createdb jira_report
```

### Connection URL

```bash
POSTGRES_PRISMA_URL=postgresql://$(whoami)@localhost:5432/jira_report
POSTGRES_URL_NON_POOLING=postgresql://$(whoami)@localhost:5432/jira_report
```

## Useful Commands

- **Stop database**: `docker-compose down`
- **Reset database**: `docker-compose down -v && docker-compose up -d`
- **View logs**: `docker-compose logs -f postgres`
- **Run migrations**: `npx prisma migrate dev`
- **Generate client**: `npx prisma generate`
- **Open Prisma Studio**: `npx prisma studio`
