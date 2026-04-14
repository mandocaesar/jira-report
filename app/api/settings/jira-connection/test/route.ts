import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { apiSuccess, apiError, requireDatabase } from '@/lib/api-helpers';

// POST /api/settings/jira-connection/test — test the Jira connection
export async function POST() {
    try {
        const dbErr = requireDatabase(); if (dbErr) return dbErr;

        const connection = await prisma!.jiraConnection.findFirst();
        if (!connection) {
            return apiError('No Jira connection configured', 404);
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
            await prisma!.jiraConnection.update({
                where: { id: connection.id },
                data: {
                    connectionStatus: 'OK',
                    lastTestedAt: now,
                },
            });
            return apiSuccess({
                status: 'OK',
                user: user.displayName,
                testedAt: now.toISOString(),
            });
        }

        await prisma!.jiraConnection.update({
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
                const conn = await prisma!.jiraConnection.findFirst();
                if (conn) {
                    await prisma!.jiraConnection.update({
                        where: { id: conn.id },
                        data: { connectionStatus: 'ERROR', lastTestedAt: new Date() },
                    });
                }
            }
        } catch { /* ignore */ }

        return apiError(error instanceof Error ? error.message : 'Connection test failed', 500);
    }
}
