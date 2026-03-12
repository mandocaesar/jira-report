import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const { sprintMetrics, boardMetrics, type } = await req.json();

        let prompt = '';

        if (type === 'sprint') {
            prompt = `
You are an expert Agile Delivery Manager. Analyze this sprint's delivery flow and throughput.
Please generate an executive-level summary of the delivery speed and issue flow based on the data.

The output MUST follow this STRICT markdown format:

**Speed Highlights**
- **Delivery Velocity**: [Analyze Mean Time to Deliver and Mean Time to Done. Are they fast or slow?]
- **Testing Bottlenecks**: [Analyze Mean Time to Test. Is QA keeping up with Engineering?]

**Flow & Completion**
- **Throughput**: [Analyze completion rate and total issues done. E.g. "Completed X% of 50 issues."]
- **Weekly Trends**: [Did the team deliver steadily or was everything dumped in the final week?]

Use an analytical tone. Reference specific numbers in hours/days and percentages.

---
Sprint Metrics Data:
**Time Metrics:**
- Mean Time to Deliver: ${sprintMetrics.timeMetrics.meanTimeToDeliver?.toFixed(1) || 'N/A'} hrs
- Mean Time to Test: ${sprintMetrics.timeMetrics.meanTimeToTest?.toFixed(1) || 'N/A'} hrs
- Mean Time to Done: ${sprintMetrics.timeMetrics.meanTimeToDone?.toFixed(1) || 'N/A'} hrs

**Totals:**
- Total Issues: ${sprintMetrics.totals.totalCount}
- Completion Rate: ${sprintMetrics.totals.completionRate.toFixed(1)}%
- Done Count: ${sprintMetrics.totals.doneCount}

**Weekly Breakdown:**
${JSON.stringify(sprintMetrics.weeklyMetrics)}
`;
        } else {
            prompt = `
You are an expert Agile Portfolio Manager. Analyze this team's delivery trends over the year.
Please generate an executive-level summary of their overall stability and speed.

The output MUST follow this STRICT markdown format:

**Trend Highlights**
- **Overall Delivery Speed**: [Analyze the trend of Mean Time to Done across the sprints. Is it improving or getting worse?]
- **Consistency**: [Are the delivery times consistent or highly variable from sprint to sprint?]

Use an analytical tone. Reference specific sprint names and numbers.

---
Board Annual Metrics Data:
${JSON.stringify(
                boardMetrics.sprintMetrics.map((sm: any) => ({
                    sprint: sm.sprint.name,
                    meanTimeToDeliver: sm.timeMetrics?.meanTimeToDeliver ? sm.timeMetrics.meanTimeToDeliver.toFixed(1) + ' hrs' : 'N/A',
                    meanTimeToDone: sm.timeMetrics?.meanTimeToDone ? sm.timeMetrics.meanTimeToDone.toFixed(1) + ' hrs' : 'N/A'
                }))
            )}
`;
        }

        const { text } = await generateText({
            model: google('gemini-2.5-flash'),
            system: 'You are an expert Agile coach assisting a team with flow metrics. Strictly adhere to the requested markdown formatting.',
            prompt: prompt,
        });

        return NextResponse.json({ summary: text });
    } catch (error) {
        console.error('Error generating AI metrics summary:', error);
        return NextResponse.json(
            { error: 'Failed to generate metrics summary.' },
            { status: 500 }
        );
    }
}
