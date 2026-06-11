import pkg from 'asa-query';
const { default: AsaQuery } = pkg;
import tokenPkg from 'asa-query/dist/eos/token.js';

const q = new AsaQuery();
q.maxResults = 100;

console.log('Querying Epic Online Services for ASA servers...');

try {
  const res = await q.unofficial().exec();
  console.log('Total unofficial servers found:', res.sessions?.length || 0);
  
  if (res.sessions && res.sessions.length > 0) {
    // Show a few examples
    console.log('\nFirst 5 servers:');
    for (let i = 0; i < Math.min(5, res.sessions.length); i++) {
      const s = res.sessions[i];
      const name = s.attributes?.SESSIONNAME_s || s.attributes?.CUSTOMSERVERNAME_s || 'unnamed';
      const map = s.attributes?.MAPNAME_s || '?';
      console.log(`  ${i+1}. "${name}" | Map: ${map} | Players: ${s.totalPlayers}`);
    }
    
    // Search for our server
    const ours = res.sessions.find(s => 
      (s.attributes?.SESSIONNAME_s || '').includes('Lost Colony')
    );
    if (ours) {
      console.log('\n✅ OUR SERVER IS LISTED on Epic Online Services!');
      console.log('Name:', ours.attributes?.SESSIONNAME_s);
      console.log('Map:', ours.attributes?.MAPNAME_s);
    } else {
      console.log('\n❌ Our server "Lost Colony" NOT found on EOS');
      console.log('   This means the server is not registering with Epic Online Services');
      console.log('   which is required for the in-game browser to see it.');
    }
  } else {
    console.log('No servers returned - possible API issue');
  }
} catch (e) {
  console.log('EOS Query Error:', e.message);
}