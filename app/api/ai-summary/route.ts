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
