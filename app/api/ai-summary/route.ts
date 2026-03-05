import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const data = await req.json();

        const prompt = `
You are an expert Agile Scrum Master analyzing a sprint report. 
Given the following sprint data, write a short, executive-level summary of the sprint's performance.

Sprint constraints:
- Name: ${data.sprint.name}
- Total Points: ${data.totalStoryPoints}
- Total Working Days: ${data.totalWorkingDays}

Engineers (Count: ${data.engineerStats.count}):
- Mandays: ${data.engineerStats.mandays}
- Leave Days: ${data.engineerStats.leaveDays}
- Points Delivered: ${data.engineerStats.storyPoints}
- Utilization: ${((data.engineerStats.storyPoints / data.engineerStats.mandays) * 100).toFixed(0)}%
- Work Type: ${JSON.stringify(data.engineerStats.workTypeStats)}

QA (Count: ${data.qaStats.count}):
- Mandays: ${data.qaStats.mandays}
- Leave Days: ${data.qaStats.leaveDays}
- Points Delivered: ${data.qaStats.storyPoints}
- Utilization: ${((data.qaStats.storyPoints / data.qaStats.mandays) * 100).toFixed(0)}%

Provide 3 to 4 concise bullet points summarizing:
1. Overall delivery and velocity.
2. Team capacity and utilization (call out if they are over/under utilized compared to standard 100%).
3. Work type distribution (e.g. heavy product focus vs tech debt/incidents).
4. Any potential risks or notable achievements based on the data.

Use professional, encouraging tone. Keep it strictly to the facts presented. Formatted in simple markdown. Do not include introductory phrases like "Here is the summary". Just give me the bullet points.
`;

        const { text } = await generateText({
            model: google('gemini-2.5-flash-lite'),
            system: 'You are an expert Agile coach assisting a team with their sprint review.',
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
