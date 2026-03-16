import { NextRequest, NextResponse } from 'next/server';

import { generateText } from 'ai';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import { createJiraClient } from '@/lib/jira-client';
import { calculateSprintUtilization } from '@/lib/utilization-calculator';
import { calculateSprintReport } from '@/lib/sprint-report-calculator';
import SprintReportPDF from '@/components/SprintReportPDF';
import teamRoster from '@/config/team-roster.json';
import { prisma, isDatabaseAvailable } from '@/lib/db';
import { WorklogReportData } from '@/types';

// Helper to generate date range
function generateDateRange(startIso: string, endIso: string): string[] {
    const dates: string[] = [];
    const startDate = new Date(startIso);
    const endDate = new Date(endIso);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getDate()).padStart(2, '0');
        dates.push(`${year}-${month}-${day}`);
        currentDate.setDate(currentDate.getDate() + 1);
    }
    return dates;
}

// POST /api/report/pdf
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const sprintIdParam = body.sprintId;
        const boardIdParam = body.boardId;
        const aiSummary = body.aiSummary || null;

        if (!sprintIdParam) {
            return NextResponse.json(
                { success: false, error: 'sprintId is required' },
                { status: 400 }
            );
        }

        const sprintId = parseInt(sprintIdParam, 10);
        const boardId = boardIdParam ? parseInt(boardIdParam, 10) : undefined;

        const jiraClient = createJiraClient();

        // 1. Fetch sprint + issues
        const [sprint, issues] = await Promise.all([
            jiraClient.getSprint(sprintId),
            jiraClient.getSprintIssuesWithChangelog(sprintId, boardId),
        ]);

        // 2. Calculate utilization + report
        const [utilization, sprintReport] = await Promise.all([
            calculateSprintUtilization(sprint, issues, boardId),
            calculateSprintReport(sprint, issues, boardId),
        ]);

        // 2b. Compute per-member sprint performance (Team Sprint Performance section)
        const teamPerformanceData = (() => {
            function _statusCat(name: string): string {
                const l = name.toLowerCase();
                if (['to do', 'open', 'backlog', 'new', 'reopened', 'funnel', 'selected for development'].some(s => l === s)) return 'To Do';
                if (['done', 'closed', 'resolved', 'released', 'completed'].some(s => l === s)) return 'Done';
                return 'In Progress';
            }
            function _bizDays(start: Date, end: Date): number {
                if (end <= start) return 0;
                let count = 0;
                const cur = new Date(start); cur.setHours(0, 0, 0, 0);
                const endN = new Date(end); endN.setHours(0, 0, 0, 0);
                while (cur <= endN) { if (cur.getDay() !== 0 && cur.getDay() !== 6) count++; cur.setDate(cur.getDate() + 1); }
                return Math.max(count, 1);
            }
            const mp = new Map<string, { dST: number; dSC: number; dO: number; tST: number; tSC: number; tO: number; ct: number[]; lt: number[]; thru: number }>();
            for (const issue of issues) {
                const aid = issue.fields.assignee?.accountId;
                if (!aid) continue;
                if (!mp.has(aid)) mp.set(aid, { dST: 0, dSC: 0, dO: 0, tST: 0, tSC: 0, tO: 0, ct: [], lt: [], thru: 0 });
                const m = mp.get(aid)!;
                const typeName = issue.fields.issuetype.name.toLowerCase();
                const isDone = issue.fields.status?.statusCategory?.name === 'Done';
                if (typeName === 'sub-task' || (issue.fields.issuetype.subtask && typeName !== 'sub-chore')) {
                    m.tST++; if (isDone) m.dST++;
                } else if (typeName === 'sub-chore') {
                    m.tSC++; if (isDone) m.dSC++;
                } else {
                    m.tO++; if (isDone) m.dO++;
                }
                if (isDone) {
                    m.thru++;
                    const histories = issue.changelog?.histories || [];
                    const sorted = [...histories].sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());
                    let firstIP: Date | null = null, doneDate: Date | null = null;
                    for (const h of sorted) {
                        for (const item of h.items) {
                            if (item.field !== 'status') continue;
                            if (!firstIP && item.toString && _statusCat(item.toString) === 'In Progress') firstIP = new Date(h.created);
                            if (item.toString && _statusCat(item.toString) === 'Done') doneDate = new Date(h.created);
                        }
                    }
                    if (doneDate) {
                        const lead = _bizDays(new Date(issue.fields.created), doneDate);
                        m.lt.push(lead);
                        m.ct.push(firstIP ? _bizDays(firstIP, doneDate) : lead);
                    }
                }
            }
            return utilization.userUtilizations.map(u => {
                const m = mp.get(u.user.accountId) || { dST: 0, dSC: 0, dO: 0, tST: 0, tSC: 0, tO: 0, ct: [], lt: [], thru: 0 };
                const totalAssigned = m.tST + m.tSC + m.tO;
                const totalDelivered = m.dST + m.dSC + m.dO;
                const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : null;
                return {
                    accountId: u.user.accountId,
                    name: u.user.displayName,
                    role: u.role,
                    title: u.title,
                    storyPoints: u.storyPoints,
                    availableDays: u.availableDays,
                    utilizationPercent: Math.round(u.utilizationPercent * 10) / 10,
                    completionRate: totalAssigned > 0 ? Math.round((totalDelivered / totalAssigned) * 100) : 0,
                    cycleTimeAvg: avg(m.ct),
                    leadTimeAvg: avg(m.lt),
                    throughput: m.thru,
                    deliveredSubTasks: m.dST, totalSubTasks: m.tST,
                    deliveredSubChores: m.dSC, totalSubChores: m.tSC,
                    deliveredOther: m.dO, totalOther: m.tO,
                };
            });
        })();

        // 3. Fetch epic breakdown
        let epicBreakdowns: any[] = [];
        if (boardId) {
            try {
                const epics = await jiraClient.getEpics(boardId);
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

        // 5. Fetch Worklogs
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
                            dailyLogs: dates.map(date => ({ date, hours: 0 })),
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

        // 6. Generate AI Summary directly on PDF generation
        let finalAiSummary = aiSummary;
        if (!finalAiSummary) {
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
                    model: process.env.AI_MODEL ?? 'google/gemini-2.5-flash-lite',
                    system: 'You are an expert Agile coach assisting a team with their sprint review. Strictly adhere to formatting requested.',
                    prompt: prompt,
                });
                finalAiSummary = text;
            } catch (err) {
                console.error("AI summarization inside PDF failed:", err);
            }
        }

        // 7. Render PDF
        const pdfBuffer = await renderToBuffer(
            React.createElement(SprintReportPDF, {
                summary: utilization,
                report: sprintReport,
                epicBreakdowns,
                worklogData,
                teamName,
                aiSummary: finalAiSummary,
                teamPerformanceData,
            }) as any
        );

        // 8. Return PDF as downloadable file
        const safeSprintName = sprint.name.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/ /g, '_');
        const filename = `Sprint_Report_${safeSprintName}.pdf`;

        return new NextResponse(new Uint8Array(pdfBuffer), {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    } catch (error) {
        console.error('Error generating PDF report:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Failed to generate PDF' },
            { status: 500 }
        );
    }
}
