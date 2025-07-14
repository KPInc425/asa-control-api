import { io as Client } from 'socket.io-client';

const testSocketIO = async () => {
  console.log('Testing Socket.IO connection...');
  
  const socket = Client('https://ark.ilgaming.xyz', {
    transports: ['websocket', 'polling'],
    auth: {
      token: 'test-token' // This will fail auth, but we can see if connection works
    },
    timeout: 10000
  });

  socket.on('connect', () => {
    console.log('✅ Socket.IO connection successful!');
    console.log('Socket ID:', socket.id);
    socket.disconnect();
    process.exit(0);
  });

  socket.on('connect_error', (error) => {
    console.log('❌ Socket.IO connection failed:', error.message);
    if (error.message.includes('Authentication required') || error.message.includes('Invalid token')) {
      console.log('✅ Socket.IO server is running (auth failed as expected)');
      process.exit(0);
    } else {
      console.log('❌ Socket.IO server is not responding');
      process.exit(1);
    }
  });

  socket.on('error', (error) => {
    console.log('❌ Socket.IO error:', error);
    process.exit(1);
  });

  // Timeout after 10 seconds
  setTimeout(() => {
    console.log('❌ Socket.IO connection timeout');
    process.exit(1);
  }, 10000);
};

testSocketIO().catch(console.error); 
