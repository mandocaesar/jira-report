import { prisma } from '@/lib/db';
import { apiSuccess, apiError, requireDatabase } from '@/lib/api-helpers';

// GET /api/settings/jira-connection — get the singleton Jira connection config
export async function GET() {
    try {
        const dbErr = requireDatabase(); if (dbErr) return dbErr;

        const connection = await prisma!.jiraConnection.findFirst();

        // Return with apiToken masked
        if (connection) {
            return apiSuccess({
                ...connection,
                apiToken: connection.apiToken ? '••••••••' : '',
            });
        }

        return apiSuccess(null);
    } catch (error) {
        console.error('Error fetching Jira connection:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to fetch connection', 500);
    }
}

// POST /api/settings/jira-connection — create or update the Jira connection
export async function POST(request: Request) {
    try {
        const dbErr = requireDatabase(); if (dbErr) return dbErr;

        const body = await request.json();
        const { baseUrl, email, apiToken, autoSyncEnabled, syncSchedule } = body;

        if (!baseUrl || !email) {
            return apiError('baseUrl and email are required', 400);
        }

        const existing = await prisma!.jiraConnection.findFirst();

        // If apiToken is the masked placeholder, keep the old one
        const resolvedToken = apiToken === '••••••••' && existing
            ? existing.apiToken
            : apiToken || '';

        if (existing) {
            const updated = await prisma!.jiraConnection.update({
                where: { id: existing.id },
                data: {
                    baseUrl,
                    email,
                    apiToken: resolvedToken,
                    ...(autoSyncEnabled !== undefined && { autoSyncEnabled }),
                    ...(syncSchedule !== undefined && { syncSchedule }),
                    connectionStatus: 'SAVED',
                },
            });
            return apiSuccess({ ...updated, apiToken: '••••••••' });
        }

        const created = await prisma!.jiraConnection.create({
            data: {
                baseUrl,
                email,
                apiToken: resolvedToken,
                autoSyncEnabled: autoSyncEnabled ?? false,
                syncSchedule: syncSchedule ?? '15min',
                connectionStatus: 'SAVED',
            },
        });

        return apiSuccess({ ...created, apiToken: '••••••••' });
    } catch (error) {
        console.error('Error saving Jira connection:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to save connection', 500);
    }
}
