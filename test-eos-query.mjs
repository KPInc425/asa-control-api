import AsaQuery from 'asa-query';

const q = new AsaQuery();
q.maxResults = 100;

console.log('Querying Epic Online Services for ASA servers...');

try {
  const res = await q.unofficial().exec();
  console.log('Total unofficial servers found on EOS:', res.sessions?.length || 0);
  
  if (res.sessions && res.sessions.length > 0) {
    console.log('\nFirst 3 servers:');
    for (let i = 0; i < Math.min(3, res.sessions.length); i++) {
      const s = res.sessions[i];
      const name = s.attributes?.SESSIONNAME_s || 'unnamed';
      const map = s.attributes?.MAPNAME_s || '?';
      console.log(`  ${i+1}. "${name}" | Map: ${map} | Players: ${s.totalPlayers}`);
    }
    
    const ours = res.sessions.find(s => 
      (s.attributes?.SESSIONNAME_s || '').includes('Lost Colony')
    );
    if (ours) {
      console.log('\nOUR SERVER IS LISTED on Epic Online Services!');
    } else {
      console.log('\n"Lost Colony" NOT found on EOS');
    }
  } else {
    console.log('No servers returned from EOS');
  }
} catch (e) {
  console.log('EOS Query Error:', e.message);
  if (e.message.includes('access_token')) {
    console.log('Cannot authenticate with Epic Online Services - token issue');
  } else if (e.message.includes('Network')) {
    console.log('Network error - cannot reach Epic APIs');
  }
}