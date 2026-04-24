
import { generateText } from 'ai';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { apiError } from '@/lib/api-helpers';

export async function POST(req: Request) {
    try {
        const { summary, reportData, epicBreakdowns } = await req.json();

        const sprintId = summary?.sprint?.id;
        const boardId = summary?.sprint?.originBoardId;

        // Check cache first (24h TTL)
        if (sprintId) {
            try {
                const cached = await prisma?.aiSummaryCache.findUnique({
                    where: { type_sprintId_boardId: { type: 'sprint', sprintId, boardId: boardId || 0 } }
                });
                if (cached) {
                    const ageMs = Date.now() - new Date(cached.createdAt).getTime();
                    if (ageMs < 24 * 60 * 60 * 1000) {
                        return NextResponse.json({ summary: cached.summary, cached: true });
                    }
                    // Expired — delete stale entry
                    await prisma?.aiSummaryCache.delete({ where: { id: cached.id } });
                }
            } catch {
                // DB unavailable, continue to generate
            }
        }

        const prompt = `
You are an expert Agile Scrum Master and Agile Coach analyzing a sprint report.
Your goal is to provide deep, actionable insights to help the team improve their processes, beyond just reading the numbers.
Generate an executive-level summary organized into exactly these 4 sections.

IMPORTANT FORMATTING RULES:
- Use EXACTLY these 4 section headings, each on its own line with ** markers.
- Under each heading, use bullet points starting with "- ".
- Be specific with numbers, names, and percentages from the data.
- Include actionable coaching recommendations where appropriate.
- Do NOT add introductory or concluding remarks. Just the 4 sections.

**Sprint Delivery**
- Summarize overall story point completion rate (X of Y points completed = Z%)
- Assess delivery momentum and velocity compared to capacity, providing a Scrum Master perspective on whether the sprint goal was likely met
- Call out the status distribution (how many in Done vs In Progress vs To Do)
- Note any backlog risk if significant points remain undone, and suggest process improvements (e.g., better refinement)

**Top Contributors & Quick Wins**
- Highlight the top 2-3 performing team members by completed points and utilization %, mentioning their names and roles
- Note any standout positive momentum, such as exceptional efficiency (high points relative to available working days)
- For Engineers, provide an encouraging and motivating narration celebrating their heavy lifting, delivery velocity, and dedication in driving the sprint's momentum
- For QA members, recognize their crucial contribution to unblocking the board and ensuring stories reach the "Done" state

**Epic Summary**
- For EVERY epic worked on this sprint, create a bullet point with: Epic name, completion % (X/Y points), and a brief analytical observation about progress
- Flag any epics at 0% or very low progress as stalled and recommend next steps (e.g., breaking down stories, unblocking dependencies)
- Highlight epics nearing completion as wins

**Key Areas of Concern**
- Call out specific team members who were significantly over-utilized (>110%) or under-utilized (<70%), referencing exact percentages and roles
- Identify potential bottlenecks (e.g., too many items In Progress, testing delays) and suggest WIP limits or pairing
- Note capacity risks or workload imbalances across the team, providing 1-2 actionable Scrum Master recommendations to address them

---
Sprint Data:

Sprint: ${summary.sprint.name}
Total Points: ${summary.totalStoryPoints} | Working Days: ${summary.totalWorkingDays}
Completed: ${reportData?.completedPoints || 0} (${reportData?.completionPercent || 0}%)
Status Groups: ${JSON.stringify(reportData?.statusGroups || [])}

Team Members:
${JSON.stringify(
            summary.userUtilizations.map((u: any) => ({
                name: u.user.displayName,
                role: u.role,
                utilization: u.utilizationPercent.toFixed(0) + '%',
                points: u.storyPoints,
                days: u.workingDays - u.leaveDays
            }))
        )}

Epics:
${JSON.stringify(
            (epicBreakdowns || []).map((e: any) => ({
                key: e.epicKey,
                name: e.epicName,
                total: e.totalPoints,
                done: e.completedPoints,
                pct: e.completionPercent.toFixed(0) + '%'
            }))
        )}
`;

        const { text } = await generateText({
            model: process.env.AI_MODEL ?? 'google/gemini-2.5-flash',
            system: 'You are an expert Agile coach assisting a team with their sprint review. Strictly adhere to formatting requested.',
            prompt: prompt,
        });

        // Cache the result
        if (sprintId) {
            try {
                await prisma?.aiSummaryCache.upsert({
                    where: { type_sprintId_boardId: { type: 'sprint', sprintId, boardId: boardId || 0 } },
                    update: { summary: text, createdAt: new Date() },
                    create: { type: 'sprint', sprintId, boardId: boardId || 0, summary: text }
                });
            } catch {
                // DB unavailable, skip caching
            }
        }

        return NextResponse.json({ summary: text });
    } catch (error) {
        console.error('Error generating AI summary:', error);
        return apiError('Failed to generate summary.', 500);
    }
}
