import dgram from 'dgram';

const s = dgram.createSocket('udp4');
s.bind(0, '127.0.0.1', () => {
  console.log('Local socket bound on port', s.address().port);
  
  const buf = Buffer.alloc(25);
  buf.writeUInt32LE(0xFFFFFFFF, 0);
  buf.writeUInt8(0x54, 4);
  buf.write('Source Engine Query', 5);
  buf.writeUInt8(0x00, 22);
  
  console.log('Sending A2S_INFO to 127.0.0.1:30008...');
  s.send(buf, 30008, '127.0.0.1');
  
  s.on('message', (msg, rinfo) => {
    console.log('GOT RESPONSE from', rinfo.address + ':' + rinfo.port);
    console.log('Length:', msg.length, 'First bytes:', msg.subarray(0,10).toString('hex'));
    s.close();
    process.exit(0);
  });
  
  setTimeout(() => {
    console.log('No response from query port 30008');
    console.log('Verifying our UDP socket works...');
    
    // Self-test: send to our own port
    const test = Buffer.from('hello');
    s.send(test, s.address().port, '127.0.0.1');
    setTimeout(() => {
      console.log('UDP loopback test: no self-receive either');
      console.log('Conclusion: A2S_INFO query fails. Port 30008 is NON-RESPONSIVE.');
      s.close();
      process.exit(1);
    }, 1000);
  }, 3000);
});