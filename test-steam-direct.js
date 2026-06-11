// Direct Steam Web API query to see if we can get any ASA servers
const url = 'https://api.steampowered.com/IGameServersService/GetServerList/v1/?key=&filter=appid\=2399830&limit=10';

// Also try the old master server
const dgram = require('dgram');

// Try both
Promise.all([
  fetch(url).then(r => r.text()).then(t => {
    console.log('Steam Web API response (first 500 chars):');
    console.log(t.substring(0, 500));
  }).catch(e => console.log('Web API error:', e.message)),
  
  new Promise((resolve) => {
    // Test if Steam master server UDP responses work
    const s = dgram.createSocket('udp4');
    // Query Steam master server directly (old method - likely won't work for ASA)
    const masterReq = Buffer.alloc(6);
    masterReq.writeUInt32LE(0xFFFFFFFF, 0);
    masterReq.writeUInt8(0x31, 4); // A2S_PLAYER query - simple test
    masterReq.writeUInt8(0x00, 5);
    
    s.on('message', (msg) => {
      console.log(`Got UDP response (${msg.length} bytes)`);
      resolve();
    });
    
    // Send to a known working ASA server to verify UDP works at all
    // Test connection to Google DNS to ensure UDP works
    const testBuf = Buffer.alloc(1);
    s.send(testBuf, 53, '8.8.8.8', (e) => {
      if (e) console.log('UDP DNS test failed:', e.message);
      else console.log('UDP to internet works (DNS sent)');
    });
    
    setTimeout(() => { console.log('UDP test done'); resolve(); }, 2000);
  })
]).then(() => {
  console.log('\nTesting local UDP receive...');
  // Can we receive anything on a local UDP socket?
  const receiver = dgram.createSocket('udp4');
  receiver.bind(0, '127.0.0.1', () => {
    console.log('Local UDP receiver bound on port', receiver.address().port);
    
    // Now try talking to server
    const sender = dgram.createSocket('udp4');
    const q = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0x54, 0x53, 0x6F, 0x75, 0x72, 0x63, 0x65, 0x20, 0x45, 0x6E, 0x67, 0x69, 0x6E, 0x65, 0x20, 0x51, 0x75, 0x65, 0x72, 0x79, 0x00]);
    
    receiver.on('message', (msg) => {
      console.log('UDP receiver got unexpected message:', msg.length, 'bytes');
    });
    
    sender.send(q, 30008, '127.0.0.1', (e) => {
      console.log('A2S sent locally, error:', e ? e.message : 'none');
    });
    
    // Also try Wireshark-style: send to public IP
    require('dns').resolve('ark.ilgaming.xyz', (e, addr) => {
      if (!e && addr) {
        console.log('Domain resolves to:', addr[0]);
      }
    });
    
    setTimeout(() => {
      console.log('\nDone with all tests');
      sender.close();
      receiver.close();
      process.exit(0);
    }, 3000);
  });
});