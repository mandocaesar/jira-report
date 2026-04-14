import { prisma } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/api-helpers';
import { generateAndSendReportForBoard } from '@/lib/report-generator';

// GET: Automated scheduler (protected by CRON_SECRET)
// POST: On-demand trigger from authenticated UI (protected by JWT middleware)

// ══════════════════════════════════════════════════════════════════
// GET: Automated scheduler (protected by CRON_SECRET)
// ══════════════════════════════════════════════════════════════════
export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;
        if (!cronSecret || !authHeader) {
            return new Response('Unauthorized', { status: 401 });
        }
        // Timing-safe comparison to prevent timing attacks
        const expected = `Bearer ${cronSecret}`;
        if (authHeader.length !== expected.length) {
            return new Response('Unauthorized', { status: 401 });
        }
        const { timingSafeEqual } = await import('crypto');
        const a = Buffer.from(authHeader);
        const b = Buffer.from(expected);
        if (!timingSafeEqual(a, b)) {
            return new Response('Unauthorized', { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const boardIdParam = searchParams.get('boardId');

        const targetTeams: { boardId: number; reportEmailGroup: string; name: string }[] = [];

        if (boardIdParam) {
            targetTeams.push({
                boardId: parseInt(boardIdParam, 10),
                reportEmailGroup: searchParams.get('to') || process.env.SMTP_USER || 'team@yourcompany.com',
                name: 'Requested Board'
            });
        } else {
            if (prisma) {
                const scheduledTeams = await prisma.team.findMany({
                    where: { isSchedulingEnabled: true }
                });
                for (const t of scheduledTeams) {
                    if (t.reportEmailGroup) {
                        targetTeams.push({
                            boardId: t.boardId,
                            reportEmailGroup: t.reportEmailGroup,
                            name: t.name
                        });
                    }
                }
            }
        }

        if (targetTeams.length === 0) {
            return apiSuccess(null, { extra: { message: 'No teams configured for scheduled reporting.' } });
        }

        const executionResults: any[] = [];
        for (const target of targetTeams) {
            try {
                const result = await generateAndSendReportForBoard(target.boardId, target.reportEmailGroup);
                executionResults.push(result);
            } catch (teamError) {
                console.error(`Error processing board ${target.boardId}:`, teamError);
                executionResults.push({ boardId: target.boardId, status: 'error', reason: String(teamError) });
            }
        }

        return apiSuccess(null, { extra: { message: 'Cron execution completed', results: executionResults } });

    } catch (error) {
        console.error('CRON ERROR:', error);
        return new Response('Internal Server Error', { status: 500 });
    }
}

// ══════════════════════════════════════════════════════════════════
// POST: On-demand trigger from authenticated UI (JWT protected)
// ══════════════════════════════════════════════════════════════════
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { boardId } = body;
        let { emailGroup } = body;

        if (!boardId) {
            return apiError('boardId is required', 400);
        }

        // If no emailGroup provided, look up from DB team config
        if (!emailGroup && prisma) {
            const team = await prisma.team.findFirst({
                where: { boardId: parseInt(boardId) }
            });
            emailGroup = team?.reportEmailGroup || null;
        }

        if (!emailGroup) {
            return apiError('No email group configured for this board. Please configure it in Team Settings first.', 400);
        }

        const result = await generateAndSendReportForBoard(parseInt(boardId), emailGroup);

        return apiSuccess(null, { extra: { result } });

    } catch (error) {
        console.error('SEND NOW ERROR:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to send report', 500);
    }
}
