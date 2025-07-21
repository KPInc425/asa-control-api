import AsaQuery from 'asa-query';

const query = new AsaQuery();

const queryServers = async () => {
  try {
    // Query for all unofficial servers with names containing 'iLGaming'
    const res = await query.unofficial().serverNameContains('iLGaming').exec();
    console.log(`Found ${res.sessions?.length || 0} servers matching 'iLGaming'`);

    if (res.sessions && res.sessions.length > 0) {
      for (const session of res.sessions) {
        // Server name
        const name = session.attributes?.SESSIONNAME_s || session.attributes?.CUSTOMSERVERNAME_s || session.settings?.SESSIONNAME_s || session.id;
        // Map
        const map = session.attributes?.MAPNAME_s || session.attributes?.FRIENDLYMAPNAME_s || 'N/A';
        // Day
        const day = session.attributes?.DAYTIME_s || 'N/A';
        // Version
        const version = session.attributes?.BUILDID_s || 'N/A';
        // Player count
        let players = 'N/A';
        if (typeof session.totalPlayers === 'number') {
          players = session.totalPlayers;
        } else if (Array.isArray(session.publicPlayers)) {
          players = session.publicPlayers.length;
        } else if (Array.isArray(session.attributes?.publicPlayers)) {
          players = session.attributes.publicPlayers.length;
        }
        // Max players
        const maxPlayers = session.settings?.maxPublicPlayers || session.attributes?.maxPublicPlayers || 'N/A';
        // Started/Last Updated
        const started = session.started || 'N/A';
        const lastUpdated = session.lastUpdated || 'N/A';
        // Print summary
        console.log('-----------------------------');
        console.log(`Server Name: ${name}`);
        console.log(`Map: ${map}`);
        console.log(`Day: ${day}`);
        console.log(`Version: ${version}`);
        console.log(`Players: ${players}`);
        console.log(`Max Players: ${maxPlayers}`);
        console.log(`Started: ${started}`);
        console.log(`Last Updated: ${lastUpdated}`);
      }
    } else {
      console.log('No servers found matching the criteria');
    }
  } catch (error) {
    console.error('Error querying servers:', error);
  }
};

queryServers(); 
