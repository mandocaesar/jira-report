import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import nodemailer from 'nodemailer';
import { createJiraClient } from '@/lib/jira-client';
import { calculateSprintUtilization } from '@/lib/utilization-calculator';
import { calculateSprintReport } from '@/lib/sprint-report-calculator';
import SprintReportPDF from '@/components/SprintReportPDF';
import teamRoster from '@/config/team-roster.json';
import { prisma, isDatabaseAvailable } from '@/lib/db';
import { WorklogReportData } from '@/types';
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';

// IMPORTANT: This route MUST be protected by a Secret (e.g. CRON_SECRET)
// that the scheduler (Vercel Cron, GitHub Actions, AWS EventBridge) passes in.
// e.g., headers: { 'Authorization': 'Bearer YOUR_CRON_SECRET' }

function generateDateRange(startIso: string, endIso: string): string[] {
    const dates: string[] = [];
    const startDate = new Date(startIso);
    const endDate = new Date(endIso);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
        dates.push(`${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`);
        currentDate.setDate(currentDate.getDate() + 1);
    }
    return dates;
}

export async function GET(request: Request) {
    try {
        // 1. Security check
        const authHeader = request.headers.get('authorization');
        if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return new Response('Unauthorized', { status: 401 });
        }

        // 2. Determine target teams via parameter OR via DB config
        const { searchParams } = new URL(request.url);
        const boardIdParam = searchParams.get('boardId');

        let targetTeams: { boardId: number, reportEmailGroup: string, name: string }[] = [];

        if (boardIdParam) {
            targetTeams.push({
                boardId: parseInt(boardIdParam, 10),
                reportEmailGroup: searchParams.get('to') || process.env.SMTP_USER || 'team@yourcompany.com',
                name: 'Requested Board'
            });
        } else {
            if (isDatabaseAvailable() && prisma) {
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
            return NextResponse.json({ success: true, message: 'No teams configured for scheduled reporting.' });
        }

        const client = createJiraClient();
        const executionResults: any[] = [];

        // 3. Iterate over each target team and build their report
        for (const target of targetTeams) {
            const boardId = target.boardId;
            const emailGroup = target.reportEmailGroup;

            try {
                const allSprints = await client.getSprints(boardId);
                if (!allSprints || allSprints.length === 0) {
                    executionResults.push({ boardId, status: 'skipped', reason: 'No sprints found' });
                    continue;
                }

                const activeSprint = allSprints.find(s => s.state === 'active');
                if (!activeSprint) {
                    executionResults.push({ boardId, status: 'skipped', reason: 'No active sprint found' });
                    continue;
                }
                const sprintId = activeSprint.id;

                // --- Execute standard PDF gathering logic here ---
                const [sprint, issues] = await Promise.all([
                    client.getSprint(sprintId),
                    client.getSprintIssuesWithChangelog(sprintId, boardId)
                ]);
                const utilization = await calculateSprintUtilization(sprint, issues, boardId);
                const sprintReport = await calculateSprintReport(sprint, issues);

                let epicBreakdowns: any[] = [];
                if (boardId) {
                    try {
                        const epics = await client.getEpics(boardId);
                        const epicMap = new Map<string, { key: string; name: string }>();
                        for (const epic of epics) {
                            epicMap.set(epic.key, { key: epic.key, name: epic.summary || epic.name || epic.key });
                        }

                        const epicBreakdownMap = new Map<string, any>();
                        const noEpicKey = 'NO_EPIC';
                        const issueEpicMap = new Map<string, string>();

                        for (const issue of issues) {
                            let epicKey = issue.fields['customfield_10014'];
                            if (!epicKey && issue.fields.parent && issue.fields.parent.fields.issuetype?.name === 'Epic') {
                                epicKey = issue.fields.parent.key;
                            }
                            if (epicKey) issueEpicMap.set(issue.key, epicKey);
                        }

                        for (const issue of issues) {
                            let epicKey = issueEpicMap.get(issue.key);
                            if (!epicKey && issue.fields.parent) {
                                epicKey = issueEpicMap.get(issue.fields.parent.key);
                            }
                            epicKey = epicKey || noEpicKey;
                            const epicInfo = epicMap.get(epicKey) || { key: epicKey, name: epicKey === noEpicKey ? 'No Epic' : epicKey };

                            if (!epicBreakdownMap.has(epicKey)) {
                                epicBreakdownMap.set(epicKey, {
                                    epicKey: epicInfo.key,
                                    epicName: epicInfo.name,
                                    stories: [],
                                    totalPoints: 0,
                                    completedPoints: 0,
                                    completionPercent: 0,
                                });
                            }

                            const breakdown = epicBreakdownMap.get(epicKey)!;
                            const storyPointsFields = ['customfield_10036', 'customfield_10052'];
                            let points = 0;
                            for (const f of storyPointsFields) {
                                if (typeof issue.fields[f] === 'number') { points = issue.fields[f]; break; }
                            }
                            const statusCat = issue.fields.status?.statusCategory?.name || 'To Do';
                            const isCompleted = statusCat === 'Done';

                            breakdown.totalPoints += points;
                            if (isCompleted) breakdown.completedPoints += points;

                            const parentKey = issue.fields.parent?.key || 'Standalone';
                            const parentSummary = issue.fields.parent?.fields.summary || 'Standalone Issues';

                            let storyGroup = breakdown.stories.find((sg: any) => sg.key === parentKey);
                            if (!storyGroup) {
                                storyGroup = { key: parentKey, summary: parentSummary, issues: [], totalPoints: 0, completedPoints: 0 };
                                breakdown.stories.push(storyGroup);
                            }

                            storyGroup.issues.push({
                                key: issue.key,
                                summary: issue.fields.summary,
                                issueType: issue.fields.issuetype.name,
                                storyPoints: points,
                                assignee: issue.fields.assignee?.displayName || null,
                                status: issue.fields.status?.name || 'Unknown',
                                statusCategory: statusCat,
                            });
                            storyGroup.totalPoints += points;
                            if (isCompleted) storyGroup.completedPoints += points;
                        }

                        epicBreakdowns = Array.from(epicBreakdownMap.values())
                            .map(b => ({ ...b, completionPercent: b.totalPoints > 0 ? (b.completedPoints / b.totalPoints) * 100 : 0 }))
                            .sort((a, b) => b.totalPoints - a.totalPoints);
                    } catch (err) {
                        console.warn('Could not fetch epic breakdowns for PDF:', err);
                    }
                }

                // 4. Determine team name
                let teamName = '';
                if (boardId) {
                    const team = Object.values(teamRoster.teams).find((t: any) => t.boardId === boardId);
                    teamName = (team as any)?.name || '';
                }

                let worklogData: WorklogReportData | null = null;
                if (boardId) {
                    try {
                        const teamMembersMap = new Map<string, any>();
                        let usedDb = false;
                        if (isDatabaseAvailable() && prisma) {
                            try {
                                const dbTeams = await prisma.team.findMany({ where: { boardId }, include: { members: true } });
                                if (dbTeams.length > 0) {
                                    usedDb = true;
                                    for (const team of dbTeams) {
                                        for (const member of team.members) {
                                            teamMembersMap.set(member.accountId, { ...member, teamId: team.id, teamName: team.name });
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
                            for (const [accountId, member] of teamMembersMap.entries()) {
                                memberWorklogsMap.set(accountId, {
                                    accountId,
                                    displayName: member.name,
                                    avatarUrl: '',
                                    role: member.role as 'qa' | 'engineer',
                                    title: member.title,
                                    dailyLogs: dates.map((date: any) => ({ date, hours: 0 })),
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
                                        const dailyLog = member.dailyLogs.find((dl: any) => dl.date === tDate);
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
                }

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
- **Backlog & Risk**: [Analyze the status distribution—how many points were left in To Do vs In Progress. E.g. "A critical X% of points remained in To Do..."]
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
                            assignedDays: u.workingDays - u.leaveDays
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
                        model: google('gemini-2.5-flash-lite'),
                        system: 'You are an expert Agile coach assisting a team with their sprint review. Strictly adhere to formatting requested.',
                        prompt: prompt,
                    });
                    finalAiSummary = text;
                } catch (err) {
                    console.error("AI summarization inside PDF failed:", err);
                }

                // Generate PDF Buffer
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

                // --- SMTP EMAIL DISPATCH ---
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

                executionResults.push({ boardId, status: 'success', sprintName: sprint.name, sentTo: emailGroup });

            } catch (teamError) {
                console.error(`Error processing board ${target.boardId}:`, teamError);
                executionResults.push({ boardId: target.boardId, status: 'error', reason: String(teamError) });
            }
        } // End Iterator

        return NextResponse.json({ success: true, message: 'Cron execution completed', results: executionResults });

    } catch (error) {
        console.error('CRON ERROR:', error);
        return new Response('Internal Server Error', { status: 500 });
    }
}
