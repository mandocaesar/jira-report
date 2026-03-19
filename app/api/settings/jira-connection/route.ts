import { NextResponse } from 'next/server';
import { prisma, isDatabaseAvailable } from '@/lib/db';

// GET /api/settings/jira-connection — get the singleton Jira connection config
export async function GET() {
    try {
        if (!isDatabaseAvailable() || !prisma) {
            return NextResponse.json(
                { success: false, error: 'Database not configured' },
                { status: 503 }
            );
        }

        const connection = await prisma.jiraConnection.findFirst();

        // Return with apiToken masked
        if (connection) {
            return NextResponse.json({
                success: true,
                data: {
                    ...connection,
                    apiToken: connection.apiToken ? '••••••••' : '',
                },
            });
        }

        return NextResponse.json({ success: true, data: null });
    } catch (error) {
        console.error('Error fetching Jira connection:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Failed to fetch connection' },
            { status: 500 }
        );
    }
}

// POST /api/settings/jira-connection — create or update the Jira connection
export async function POST(request: Request) {
    try {
        if (!isDatabaseAvailable() || !prisma) {
            return NextResponse.json(
                { success: false, error: 'Database not configured' },
                { status: 503 }
            );
        }

        const body = await request.json();
        const { baseUrl, email, apiToken, autoSyncEnabled, syncSchedule } = body;

        if (!baseUrl || !email) {
            return NextResponse.json(
                { success: false, error: 'baseUrl and email are required' },
                { status: 400 }
            );
        }

        const existing = await prisma.jiraConnection.findFirst();

        // If apiToken is the masked placeholder, keep the old one
        const resolvedToken = apiToken === '••••••••' && existing
            ? existing.apiToken
            : apiToken || '';

        if (existing) {
            const updated = await prisma.jiraConnection.update({
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
            return NextResponse.json({
                success: true,
                data: { ...updated, apiToken: '••••••••' },
            });
        }

        const created = await prisma.jiraConnection.create({
            data: {
                baseUrl,
                email,
                apiToken: resolvedToken,
                autoSyncEnabled: autoSyncEnabled ?? false,
                syncSchedule: syncSchedule ?? '15min',
                connectionStatus: 'SAVED',
            },
        });

        return NextResponse.json({
            success: true,
            data: { ...created, apiToken: '••••••••' },
        });
    } catch (error) {
        console.error('Error saving Jira connection:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Failed to save connection' },
            { status: 500 }
        );
    }
}
