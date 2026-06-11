// Test A2S_INFO query on the server's query port
import dgram from 'dgram';

const s = dgram.createSocket('udp4');

// Standard A2S_INFO request: 4 bytes 0xFF + 0x54 ('T') + "Source Engine Query" + 0x00
const buf = Buffer.alloc(25);
buf.writeUInt32LE(0xFFFFFFFF, 0);
buf.writeUInt8(0x54, 4);
buf.write('Source Engine Query', 5);
buf.writeUInt8(0x00, 22);

console.log(`Sending A2S_INFO (${buf.length} bytes) to 127.0.0.1:30008...`);

s.on('message', (msg, rinfo) => {
  console.log(`RESPONSE (${msg.length} bytes from ${rinfo.address}:${rinfo.port})`);
  console.log('First 40 hex bytes:', msg.subarray(0, Math.min(40, msg.length)).toString('hex'));
  console.log('First bytes:', [...msg.subarray(0, 10)].map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
  s.close();
});

s.send(buf, 30008, '127.0.0.1', (err) => {
  if (err) {
    console.log('Send error:', err.message);
    s.close();
    return;
  }
  setTimeout(() => {
    console.log('TIMEOUT - No response from query port 30008');
    console.log('The query port is NOT responding to A2S_INFO requests.');
    console.log('This is why Steam browser cannot see your server.');
    s.close();
  }, 3000);
});