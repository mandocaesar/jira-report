require('dotenv').config({ path: '.env.local' });
const fs = require('fs');

async function test() {
    const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');
    const headers = {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };

    const baseUrl = `https://${process.env.JIRA_DOMAIN}/rest/agile/1.0`;

    // get sprints for 3816
    const res = await fetch(`${baseUrl}/board/3816/sprint`, { headers });
    const data = await res.json();
    console.log("Sprints for 3816:", data.values.map(s => ({id: s.id, name: s.name})).slice(-10));

    // get sprints for 3817
    const res2 = await fetch(`${baseUrl}/board/3817/sprint`, { headers });
    const data2 = await res2.json();
    console.log("Sprints for 3817:", data2.values.map(s => ({id: s.id, name: s.name})).slice(-10));
}
test().catch(console.error);
