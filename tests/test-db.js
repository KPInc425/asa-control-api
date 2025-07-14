import { getAllUsers, getUserByUsername } from './database.js';

console.log('Testing SQLite database...');

try {
  // Get all users
  const allUsers = getAllUsers();
  console.log('All users:', allUsers);
  
  // Get admin user specifically
  const adminUser = getUserByUsername('admin');
  console.log('Admin user:', adminUser);
  
  if (adminUser) {
    console.log('✅ Admin user found in database');
    console.log('Username:', adminUser.username);
    console.log('Email:', adminUser.email);
    console.log('Role:', adminUser.role);
    console.log('Permissions:', adminUser.permissions);
    console.log('Profile:', adminUser.profile);
    console.log('Security:', adminUser.security);
    console.log('Metadata:', adminUser.metadata);
  } else {
    console.log('❌ Admin user not found in database');
  }
  
} catch (error) {
  console.error('Error testing database:', error);
} 
