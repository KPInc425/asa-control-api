// Debug EOS API authentication and query
const deployment_id = 'ad9a8feffb3b4b2ca315546f038c3ae2';
const client_id = 'xyza7891muomRmynIIHaJB9COBKkwj6n';
const client_secret = 'PP5UGxysEieNfSrEicaD1N2Bb3TdXuD7xHYcsdUHZ7s';
const api_endpoint = 'https://api.epicgames.dev';

// Step 1: Get auth token
const auth = Buffer.from(client_id + ':' + client_secret).toString('base64');
const tokenUrl = api_endpoint + '/auth/v1/oauth/token';
const params = new URLSearchParams();
params.append('grant_type', 'client_credentials');
params.append('deployment_id', deployment_id);

console.log('1. Getting EOS access token...');
const tokenRes = await fetch(tokenUrl, {
  method: 'POST',
  headers: {
    'Authorization': 'Basic ' + auth,
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: params
});

const tokenData = await tokenRes.json();
console.log('   Token response status:', tokenRes.status);
console.log('   Has access_token:', !!tokenData.access_token);
console.log('   Has expires_in:', !!tokenData.expires_in);

if (tokenData.access_token) {
  // Step 2: Query servers
  console.log('\n2. Querying EOS matchmaking API...');
  const queryUrl = api_endpoint + '/matchmaking/v1/' + deployment_id + '/filter';
  
  const body = JSON.stringify({
    criteria: [
      { key: 'attributes.ADVERTISEDBS_s', op: 'EQUAL', value: 'true' }
    ],
    maxResults: 20
  });
  
  console.log('   POST', queryUrl);
  const queryRes = await fetch(queryUrl, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + tokenData.access_token,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body
  });
  
  console.log('   Response status:', queryRes.status);
  const text = await queryRes.text();
  console.log('   Response body:', text.substring(0, 500));
  
  if (queryRes.ok) {
    const data = JSON.parse(text);
    console.log('\n   Servers found:', data.sessions?.length || 0);
    
    if (data.sessions?.length > 0) {
      console.log('\n   First 3 servers:');
      for (let i = 0; i < Math.min(3, data.sessions.length); i++) {
        const s = data.sessions[i];
        console.log(`     ${i+1}. "${s.attributes?.SESSIONNAME_s || 'unnamed'}" (${s.attributes?.MAPNAME_s || '?'})`);
      }
      
      const ours = data.sessions.find(s => 
        (s.attributes?.SESSIONNAME_s || '').includes('Lost Colony')
      );
      if (ours) {
        console.log('\n   *** OUR SERVER IS ON EOS! ***');
      } else {
        console.log('\n   "Lost Colony" NOT found on EOS');
      }
    }
  } else {
    console.log('   Full response:', text.substring(0, 1000));
  }
}