import { AsaQuery } from 'asa-query';

const q = new AsaQuery();
console.log('Querying Steam web API for servers...');
try {
  const res = await q.unofficial().exec();
  console.log('Total unofficial servers found:', res.sessions?.length || 0);
  
  if (res.sessions && res.sessions.length > 0) {
    // Search for our server
    const ourServer = res.sessions.find(s => 
      (s.attributes?.SESSIONNAME_s || '').includes('Lost Colony')
    );
    if (ourServer) {
      console.log('\nOUR SERVER FOUND in Steam web API!');
      console.log('Name:', ourServer.attributes?.SESSIONNAME_s);
      console.log('Map:', ourServer.attributes?.MAPNAME_s);
      console.log('Players:', ourServer.totalPlayers);
      console.log('Steam ID:', ourServer.id);
      console.log('GamePort:', ourServer.gamePort);
      console.log('QueryPort:', ourServer.queryPort);
    } else {
      console.log('\nServer "Lost Colony" NOT found in Steam web API');
      // Show a few servers to verify API works
      console.log('\nSample servers found:');
      for (let i = 0; i < Math.min(3, res.sessions.length); i++) {
        const s = res.sessions[i];
        console.log(`  - ${s.attributes?.SESSIONNAME_s || 'unnamed'} (${s.attributes?.MAPNAME_s || '?'}) players:${s.totalPlayers}`);
      }
    }
  }
} catch (e) {
  console.log('Error:', e.message);
}