import dgram from 'dgram';
const s = dgram.createSocket('udp4');
let attempts = 0;

function sendA2S(port, host, extra = Buffer.alloc(0)) {
  const buf = Buffer.alloc(25 + extra.length);
  buf.writeUInt32LE(0xFFFFFFFF, 0);
  buf.writeUInt8(0x54, 4);
  buf.write('Source Engine Query', 5);
  buf.writeUInt8(0x00, 22);
  if (extra.length) extra.copy(buf, 23);
  
  console.log(`Attempt ${++attempts}: Sending A2S_INFO to ${host}:${port} (${buf.length} bytes)`);
  
  s.send(buf, port, host, (err) => {
    if (err) { console.log('Send error:', err.message); return; }
  });
}

// Try different ports and formats
setTimeout(() => sendA2S(30008, '127.0.0.1'), 100);
setTimeout(() => sendA2S(30007, '127.0.0.1'), 500);
setTimeout(() => sendA2S(30008, '127.0.0.1', Buffer.from([0xFF,0xFF,0xFF,0xFF])), 900); // with challenge
setTimeout(() => sendA2S(30007, '127.0.0.1', Buffer.from([0xFF,0xFF,0xFF,0xFF])), 1300);

s.on('message', (msg, rinfo) => {
  console.log(`\n✅ RESPONSE from ${rinfo.address}:${rinfo.port} (${msg.length} bytes)`);
  const bytes = [...msg.subarray(0, Math.min(20, msg.length))];
  console.log('First bytes:', bytes.map(b => '0x' + b.toString(16).padStart(2,'0')).join(' '));
  console.log('As ASCII:', msg.subarray(0, Math.min(20, msg.length)).toString('ascii').replace(/[^\x20-\x7E]/g,'?'));
  s.close();
  process.exit(0);
});

setTimeout(() => {
  console.log('\n❌ No response received from ANY query attempt');
  console.log('The server is NOT responding to A2S_INFO queries on any port');
  console.log('This confirms the Steam browser listing issue.');
  
  // Try one more thing - maybe ASA uses old GoldSrc query
  console.log('\n--- Trying GoldSrc format (A2S_INFO with 0x6E) ---');
  const gold = Buffer.alloc(5);
  gold.writeUInt32LE(0xFFFFFFFF, 0);
  gold.writeUInt8(0x6E, 4);
  s.send(gold, 30008, '127.0.0.1', () => {});
  
  setTimeout(() => {
    console.log('Still no response. Server query port is non-responsive.');
    s.close();
    process.exit(0);
  }, 2000);
}, 4000);