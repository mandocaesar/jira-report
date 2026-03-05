import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import { createJiraClient } from '@/lib/jira-client';
import { calculateSprintUtilization } from '@/lib/utilization-calculator';
import { calculateSprintReport } from '@/lib/sprint-report-calculator';
import SprintReportPDF from '@/components/SprintReportPDF';
import teamRoster from '@/config/team-roster.json';

// GET /api/report/pdf?sprintId=xxx&boardId=xxx
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const sprintIdParam = searchParams.get('sprintId');
        const boardIdParam = searchParams.get('boardId');

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
            jiraClient.getSprintIssues(sprintId, boardId),
        ]);

        // 2. Calculate utilization + report
        const [utilization, sprintReport] = await Promise.all([
            calculateSprintUtilization(sprint, issues, boardId),
            calculateSprintReport(sprint, issues, boardId),
        ]);

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

        // 5. Render PDF
        const pdfBuffer = await renderToBuffer(
            React.createElement(SprintReportPDF, {
                summary: utilization,
                report: sprintReport,
                epicBreakdowns,
                teamName,
            }) as any
        );

        // 6. Return PDF as downloadable file
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
