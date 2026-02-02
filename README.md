# Jira Sprint Report Dashboard

A Next.js dashboard for tracking Jira sprint utilization and team metrics.

## Features

- 📊 Sprint utilization tracking by team member
- 👥 QA vs Engineer breakdown
- 📦 Epic breakdown by product category
- 🔐 Cookie-based authentication
- 🎨 Beautiful dark theme UI

## Setup

1. Clone the repository
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env.local` and fill in your values:

   ```bash
   cp .env.example .env.local
   ```

4. Configure your environment variables (see below)

5. Run the development server:

   ```bash
   npm run dev
   ```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `JIRA_DOMAIN` | Your Atlassian domain (e.g., `company.atlassian.net`) |
| `JIRA_EMAIL` | Your Jira account email |
| `JIRA_API_TOKEN` | Jira API token ([Generate here](https://id.atlassian.com/manage-profile/security/api-tokens)) |
| `JIRA_PROJECT_KEY` | Your Jira project key |
| `JIRA_BOARD_TEAM_MAP` | Board to Team ID mapping |
| `ADHOC_DAYS_PER_SPRINT` | Days reserved for adhoc work |
| `AUTH_PASSWORD` | Dashboard login password |
| `AUTH_SECRET` | JWT signing secret (use a random 32+ char string) |

## Deployment to Vercel

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy!

## License

MIT
