import https from 'https';

const email = 'armanda.c.cornelis@banksinarmas.com';
const token = 'ATATT3xFfGF0IikL7MOSGq8zKGzPBLisgvqgJ_4ppfIZkiBjnde2J0C7N1HPRZ1D71uw_W0eN3uVUVT27oTOwZHHbEU0HoyXUx_bTHPaqRTv_u3xj5SJ6-H-PhE_06abxo-g7dRJdIRV5y4w3V6JoLogWyK8NYtQcczA3cUB6RqSzODffFDTubg=BB4FFF5B';

const authHeader = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;

const options = {
    hostname: 'bank-sinarmas.atlassian.net',
    port: 443,
    path: '/rest/api/2/issuetype',
    method: 'GET',
    headers: {
        'Authorization': authHeader,
        'Accept': 'application/json'
    }
};

const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        try {
            const types = JSON.parse(data);
            console.log('\n--- ALL SUBTASK TYPES ---');
            types.filter((t: any) => t.subtask).forEach((t: any) => {
                console.log(`- ${t.name} [ID: ${t.id}]`);
            });

            console.log('\n--- ALL CHORE TYPES ---');
            types.filter((t: any) => t.name.toLowerCase().includes('chore')).forEach((t: any) => {
                console.log(`- ${t.name} [ID: ${t.id}, Subtask flag: ${t.subtask}]`);
            });
        } catch (e) {
            console.error('Failed to parse JSON', e);
        }
    });
});

req.on('error', (e) => {
    console.error('Request error', e);
});

req.end();
