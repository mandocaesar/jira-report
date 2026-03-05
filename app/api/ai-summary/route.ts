import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const { summary, reportData, epicBreakdowns } = await req.json();

        const prompt = `
You are an expert Agile Scrum Master analyzing a sprint report. 
Please generate an executive-level summary of the sprint's performance based on the specific data provided.

The output MUST follow this STRICT markdown format, with exactly these headings. Do not include introductory or concluding remarks. Just output the content exactly as formatted below.

**Key Highlights**
- **Primary Epic Progress**: [Briefly highlight 1-2 major epics that saw significant progress, referencing points and completion percentage]
- **Top Contributors**: [Highlight 1-3 top performing engineers/QA based on completed points and utilization percentage]
- **Quick Wins**: [If any epics reached 100% or had very fast turnaround, highlight them. If none, mention other positive momentum]

**Key Areas of Concern**
- **Massive "To Do" Backlog**: [Analyze the status distribution—how many points were left in To Do vs In Progress. E.g. "A critical X% of points remained in To Do..."]
- **Team-Wide Over utilization**: [Call out specific team members who were significantly over-utilized (e.g. >100%) or under-utilized, referencing their exact percentages and roles]
- **Stalled Epics**: [Highlight 1-3 epics that had high points but 0% progress, or struggled to move forward]

Use a professional but analytical tone. Be specific with numbers, names, and percentages provided in the data.

---
Here is the Sprint Data to analyze:

**Sprint Info:**
- Name: ${summary.sprint.name}
- Total Points: ${summary.totalStoryPoints}
- Total Working Days: ${summary.totalWorkingDays}

**Overall Delivery (Report Data):**
- Completed Points: ${reportData?.completedPoints || 0} (${reportData?.completionPercent || 0}%)
- Status Groups (Backlog vs In Progress vs Done): 
${JSON.stringify(reportData?.statusGroups || [])}

**Team Utilization (Members):**
${JSON.stringify(
            summary.userUtilizations.map((u: any) => ({
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

        return NextResponse.json({ summary: text });
    } catch (error) {
        console.error('Error generating AI summary:', error);
        return NextResponse.json(
            { error: 'Failed to generate summary.' },
            { status: 500 }
        );
    }
}
