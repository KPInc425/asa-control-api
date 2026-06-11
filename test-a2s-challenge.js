// Proper two-phase A2S_INFO query as used by Source/UE games
import dgram from 'dgram';

const s = dgram.createSocket('udp4');
const PORT = 30008;
const HOST = '127.0.0.1';

// Phase 1: Simple info query - 0xFF 0xFF 0xFF 0xFF 0x54 "Source Engine Query" 0x00
const infoReq = Buffer.alloc(25);
infoReq.writeUInt32LE(0xFFFFFFFF, 0);
infoReq.writeUInt8(0x54, 4);
infoReq.write('Source Engine Query', 5);
infoReq.writeUInt8(0x00, 22);

console.log(`[Phase 1] Sending A2S_INFO to ${HOST}:${PORT}...`);

s.on('message', (msg, rinfo) => {
  const header = msg.readUInt32LE(0);
  
  if (header === 0xFFFFFFFF) {
    const type = msg.readUInt8(4);
    
    if (type === 0x41) {
      // A2S_CHALLENGE response - server wants a challenge number
      const challenge = msg.subarray(5, 9);
      console.log(`[Phase 1] Got A2S_CHALLENGE response! Challenge: ${[...challenge].map(b=>'0x'+b.toString(16)).join(' ')}`);
      
      // Phase 2: Re-send with challenge
      const infoReq2 = Buffer.alloc(infoReq.length + 4);
      infoReq.copy(infoReq2);
      challenge.copy(infoReq2, infoReq.length);
      
      console.log(`[Phase 2] Sending A2S_INFO with challenge...`);
      s.send(infoReq2, PORT, HOST);
    } 
    else if (type === 0x49) {
      // A2S_INFO response! 
      console.log(`\n✅ GOT A2S_INFO RESPONSE! (${msg.length} bytes)`);
      console.log('Protocol:', msg.readUInt8(5));
      
      // Parse server name (null-terminated string at offset 6)
      let offset = 6;
      let name = '';
      while (offset < msg.length && msg.readUInt8(offset) !== 0) {
        name += String.fromCharCode(msg.readUInt8(offset));
        offset++;
      }
      console.log('Server Name:', name);
      offset++; // skip null
      
      console.log('Map:', msg.subarray(offset, offset+100).toString('ascii').split('\x00')[0]);
      
      s.close();
      process.exit(0);
    }
    else {
      console.log(`Unexpected response type: 0x${type.toString(16)}`);
      console.log('Full response hex:', msg.toString('hex').substring(0, 100));
    }
  } else {
    console.log(`Unexpected header: 0x${header.toString(16)}`);
  }
});

s.send(infoReq, PORT, HOST);

setTimeout(() => {
  console.log('TIMEOUT - No response at all from query port');
  console.log('The A2S query port is non-responsive even from localhost.');
  
  // Try the game port too
  console.log('\nTrying game port 30007...');
  s.send(infoReq, 30007, HOST);
  
  setTimeout(() => {
    console.log('No response from game port either.');
    console.log('\nThis is the definitive cause of browser invisibility.');
    s.close();
    process.exit(0);
  }, 3000);
}, 4000);