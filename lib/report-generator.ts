import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import nodemailer from 'nodemailer';
import { createJiraClient } from '@/lib/jira-client';
import { calculateSprintUtilization } from '@/lib/utilization-calculator';
import { calculateSprintReport } from '@/lib/sprint-report-calculator';
import { calculateEpicBreakdowns } from '@/lib/epic-breakdown-calculator';
import SprintReportPDF from '@/components/SprintReportPDF';
import teamRoster from '@/config/team-roster.json';
import { prisma } from '@/lib/db';
import { WorklogReportData } from '@/types';
import { generateDateRange } from '@/lib/date-utils';
import { generateText } from 'ai';

export interface ReportResult {
    boardId: number;
    status: string;
    sprintName?: string;
    sentTo?: string;
    reason?: string;
}

export async function generateAndSendReportForBoard(
    boardId: number,
    emailGroup: string,
): Promise<ReportResult> {
    const client = createJiraClient();

    const allSprints = await client.getSprints(boardId);
    if (!allSprints || allSprints.length === 0) {
        return { boardId, status: 'skipped', reason: 'No sprints found' };
    }

    const activeSprint = allSprints.find(s => s.state === 'active');
    if (!activeSprint) {
        return { boardId, status: 'skipped', reason: 'No active sprint found' };
    }
    const sprintId = activeSprint.id;

    const [sprint, issues] = await Promise.all([
        client.getSprint(sprintId),
        client.getSprintIssuesWithChangelog(sprintId, boardId)
    ]);
    const utilization = await calculateSprintUtilization(sprint, issues, boardId);
    const sprintReport = await calculateSprintReport(sprint, issues);

    // ── Epic breakdowns ──
    let epicBreakdowns: any[] = [];
    try {
        const epics = await client.getEpics(boardId);
        epicBreakdowns = calculateEpicBreakdowns(epics, issues);
    } catch (err) {
        console.warn('Could not fetch epic breakdowns for PDF:', err);
    }

    // ── Team name ──
    let teamName = '';
    const team = Object.values(teamRoster.teams).find((t: any) => t.boardId === boardId);
    teamName = (team as any)?.name || '';

    // ── Worklogs ──
    let worklogData: WorklogReportData | null = null;
    try {
        const teamMembersMap = new Map<string, any>();
        let usedDb = false;
        if (prisma) {
            try {
                const dbTeams = await prisma.team.findMany({ where: { boardId }, include: { members: true } });
                if (dbTeams.length > 0) {
                    usedDb = true;
                    for (const t of dbTeams) {
                        for (const member of t.members) {
                            teamMembersMap.set(member.accountId, { ...member, teamId: t.id, teamName: t.name });
                        }
                    }
                }
            } catch (err) { }
        }
        if (!usedDb) {
            for (const [teamId, teamConfig] of Object.entries((teamRoster as any).teams)) {
                if ((teamConfig as any).boardId === boardId) {
                    for (const member of (teamConfig as any).members) {
                        teamMembersMap.set(member.accountId, { ...member, teamId, teamName: (teamConfig as any).name });
                    }
                }
            }
        }

        if (teamMembersMap.size > 0 && sprint.startDate && sprint.endDate) {
            const dates = generateDateRange(sprint.startDate, sprint.endDate);
            const memberWorklogsMap = new Map<string, any>();
            const memberLogIndex = new Map<string, Map<string, any>>();
            for (const [accountId, member] of teamMembersMap.entries()) {
                const dailyLogs = dates.map((date: any) => ({ date, hours: 0 }));
                const idx = new Map<string, any>();
                for (const dl of dailyLogs) idx.set(dl.date, dl);
                memberLogIndex.set(accountId, idx);
                memberWorklogsMap.set(accountId, {
                    accountId,
                    displayName: member.name,
                    avatarUrl: '',
                    role: member.role as 'qa' | 'engineer',
                    title: member.title,
                    dailyLogs,
                    totalHours: 0
                });
            }

            for (const issue of issues) {
                if (issue.fields.assignee && memberWorklogsMap.has(issue.fields.assignee.accountId)) {
                    const m = memberWorklogsMap.get(issue.fields.assignee.accountId)!;
                    if (!m.avatarUrl && issue.fields.assignee.avatarUrls?.['48x48']) {
                        m.avatarUrl = issue.fields.assignee.avatarUrls['48x48'];
                    }
                }
                const wData = issue.fields.worklog;
                if (!wData || !wData.worklogs || wData.worklogs.length === 0) continue;

                for (const log of wData.worklogs) {
                    const authorId = log.author.accountId;
                    if (!memberWorklogsMap.has(authorId)) continue;
                    const member = memberWorklogsMap.get(authorId)!;
                    const startedDate = new Date(log.started);
                    const tDate = `${startedDate.getFullYear()}-${String(startedDate.getMonth() + 1).padStart(2, '0')}-${String(startedDate.getDate()).padStart(2, '0')}`;
                    if (dates.includes(tDate)) {
                        const hours = log.timeSpentSeconds / 3600;
                        const dailyLog = memberLogIndex.get(authorId)?.get(tDate);
                        if (dailyLog) {
                            dailyLog.hours += hours;
                            member.totalHours += hours;
                        }
                    }
                }
            }

            const memberWorklogs = Array.from(memberWorklogsMap.values()).sort((a, b) => {
                if (a.role !== b.role) return a.role === 'engineer' ? -1 : 1;
                return a.displayName.localeCompare(b.displayName);
            });

            worklogData = { sprintId, dates, memberWorklogs };
        }
    } catch (err) {
        console.warn('Could not fetch worklogs for PDF:', err);
    }

    // ── AI Summary ──
    let finalAiSummary: string | null = null;
    try {
        const prompt = `
You are an expert Agile Scrum Master analyzing a sprint report. 
Please generate an executive-level summary of the sprint's performance based on the specific data provided.

The output MUST follow this STRICT markdown format, with exactly these headings. Do not include introductory or concluding remarks. Just output the content exactly as formatted below.

**Key Highlights**
- **Sprint Goal & Delivery**: [Assess overall story point completion rate and delivery momentum based on the overall completion percentage]
- **Top Contributors**: [Highlight 1-3 top performing engineers/QA based on completed points and utilization percentage]
- **Quick Wins**: [Highlight any fast turnarounds or notable positive momentum]

**Epic Summary**
[For EVERY Epic heavily worked on this sprint, create a brief bullet point stating its name, completion percentage, points completed/total, and a 1-sentence analytical observation about its specific progress. Keep it dense and analytical.]

**Key Areas of Concern**
- **Backlog & Risk**: [Analyze the status distribution — how many points were left in To Do vs In Progress. E.g. "A critical X% of points remained in To Do..."]
- **Capacity & Utilization**: [Call out specific team members who were significantly over-utilized (e.g. >100%) or under-utilized, referencing exact percentages and roles]
- **Stalled Items**: [Highlight exactly which epics or areas struggled to move forward, referencing 0% progress or low completion rates]

Use a professional but analytical tone. Be specific with numbers, names, and percentages provided in the data.

---
Here is the Sprint Data to analyze:

**Sprint Info:**
- Name: ${sprint.name}
- Total Points: ${utilization.totalStoryPoints}
- Total Working Days: ${utilization.totalWorkingDays}

**Overall Delivery (Report Data):**
- Completed Points: ${sprintReport?.completedPoints || 0} (${sprintReport?.completionPercent || 0}%)
- Status Groups (Backlog vs In Progress vs Done): 
${JSON.stringify(sprintReport?.statusGroups || [])}

**Team Utilization (Members):**
${JSON.stringify(
            utilization.userUtilizations.map((u: any) => ({
                name: u.user.displayName,
                role: u.role,
                utilizationPercent: u.utilizationPercent,
                completedPoints: u.storyPoints,
                assignedDays: u.availableDays
            }))
        )}

**Epic Breakdown (Progress):**
${JSON.stringify(
            (epicBreakdowns || []).map((e: any) => ({
                key: e.epicKey,
                name: e.epicName,
                totalPoints: e.totalPoints,
                completedPoints: e.completedPoints,
                completionPercent: e.completionPercent
            }))
        )}
`;

        const { text } = await generateText({
            model: process.env.AI_MODEL ?? 'google/gemini-2.5-flash',
            system: 'You are an expert Agile coach assisting a team with their sprint review. Strictly adhere to formatting requested.',
            prompt: prompt,
        });
        finalAiSummary = text;
    } catch (err) {
        console.error("AI summarization inside PDF failed:", err);
    }

    // ── Generate PDF ──
    const pdfBuffer = await renderToBuffer(
        React.createElement(SprintReportPDF, {
            summary: utilization,
            report: sprintReport,
            epicBreakdowns,
            worklogData,
            teamName,
            aiSummary: finalAiSummary,
        }) as any
    );

    // ── Send Email ──
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    await transporter.sendMail({
        from: `"Jira Reporter Bot" <${process.env.SMTP_USER}>`,
        to: emailGroup,
        subject: `Daily Sprint Update: ${sprint.name}`,
        text: 'Attached is the latest Sprint Executive Summary Report.',
        attachments: [
            {
                filename: `Sprint_Report_${sprint.name.replace(/ /g, '_')}.pdf`,
                content: Buffer.from(pdfBuffer),
                contentType: 'application/pdf',
            },
        ],
    });

    return { boardId, status: 'success', sprintName: sprint.name, sentTo: emailGroup };
}
