import { NextResponse } from 'next/server';
import { prisma, isDatabaseAvailable } from '@/lib/db';

// POST /api/settings/jira-connection/test — test the Jira connection
export async function POST() {
    try {
        if (!isDatabaseAvailable() || !prisma) {
            return NextResponse.json(
                { success: false, error: 'Database not configured' },
                { status: 503 }
            );
        }

        const connection = await prisma.jiraConnection.findFirst();
        if (!connection) {
            return NextResponse.json(
                { success: false, error: 'No Jira connection configured' },
                { status: 404 }
            );
        }

        // Test the connection by calling Jira's /rest/api/3/myself
        const url = `${connection.baseUrl.replace(/\/$/, '')}/rest/api/3/myself`;
        const auth = Buffer.from(`${connection.email}:${connection.apiToken}`).toString('base64');

        const response = await fetch(url, {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/json',
            },
            signal: AbortSignal.timeout(10000),
        });

        const now = new Date();

        if (response.ok) {
            const user = await response.json();
            await prisma.jiraConnection.update({
                where: { id: connection.id },
                data: {
                    connectionStatus: 'OK',
                    lastTestedAt: now,
                },
            });
            return NextResponse.json({
                success: true,
                data: {
                    status: 'OK',
                    user: user.displayName,
                    testedAt: now.toISOString(),
                },
            });
        }

        await prisma.jiraConnection.update({
            where: { id: connection.id },
            data: {
                connectionStatus: 'ERROR',
                lastTestedAt: now,
            },
        });

        return NextResponse.json({
            success: false,
            error: `Jira returned ${response.status}: ${response.statusText}`,
            data: { status: 'ERROR', testedAt: now.toISOString() },
        });
    } catch (error) {
        console.error('Error testing Jira connection:', error);

        // Update status to ERROR in DB if possible
        try {
            if (prisma) {
                const conn = await prisma.jiraConnection.findFirst();
                if (conn) {
                    await prisma.jiraConnection.update({
                        where: { id: conn.id },
                        data: { connectionStatus: 'ERROR', lastTestedAt: new Date() },
                    });
                }
            }
        } catch { /* ignore */ }

        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Connection test failed' },
            { status: 500 }
        );
    }
}
