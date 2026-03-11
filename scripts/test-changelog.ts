import { createJiraClient } from '../lib/jira-client';

async function main() {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    console.log("JIRA_DOMAIN", process.env.JIRA_DOMAIN);
    const client = createJiraClient();
    const boards = await client.getBoards();
    let boardId = boards.values[0].id;
    if (process.env.JIRA_BOARD_TEAM_MAP) {
        boardId = parseInt(process.env.JIRA_BOARD_TEAM_MAP.split(':')[0]);
    }
    const sprints = await client.getSprints(boardId);
    let sprint = sprints.find(s => s.state === 'active') || sprints[0];
    const sprintId = sprint.id;
    console.log("Testing sprint:", sprint);
    const issues = await client.getSprintIssuesWithChangelog(sprintId, boardId);

    console.log(`Found ${issues.length} issues`);
    let found = 0;
    for (const issue of issues) {
        if (issue.changelog && issue.changelog.histories.length > 0) {
            const historySnippets = issue.changelog.histories.map(h => ({
                created: h.created,
                items: h.items
            })).filter(h => h.items.some(i => i.field === 'Sprint' || i.field === 'Story Points' || i.field === 'QA Story Point'));
            if (historySnippets.length > 0) {
                console.log(`--- Issue: ${issue.key} ---`);
                console.log(JSON.stringify(historySnippets, null, 2));
                found++;
            }
        }
        if (found > 3) break;
    }
}
main().catch(console.error);
