import bcrypt from 'bcryptjs';
import { createUser as dbCreateUser, getAllUsers } from './database.js';

console.log('Initializing SQLite database...');

async function initializeDatabase() {
  try {
    // Check if users already exist
    const existingUsers = getAllUsers();
    console.log(`Found ${existingUsers.length} existing users`);
    
    if (existingUsers.length === 0) {
      console.log('Creating default admin user...');
      
      const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
      const hashedPassword = await bcrypt.hash(defaultPassword, 12);
      
      const permissions = ['read', 'write', 'admin', 'user_management'];
      const profile = {
        firstName: 'Admin',
        lastName: 'User',
        displayName: 'Administrator',
        avatar: null,
        timezone: 'UTC',
        language: 'en'
      };
      const security = {
        emailVerified: true,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        lastPasswordChange: new Date().toISOString(),
        passwordHistory: [],
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLogin: null,
        loginHistory: []
      };
      const metadata = {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'system',
        lastActivity: new Date().toISOString()
      };

      // Create admin user in database
      const dbResult = dbCreateUser(
        'admin',
        'admin@example.com',
        hashedPassword,
        'admin',
        JSON.stringify(permissions),
        JSON.stringify(profile),
        JSON.stringify(security),
        JSON.stringify(metadata)
      );

      if (dbResult.changes) {
        console.log('✅ Default admin user created successfully');
        console.log('Username: admin');
        console.log('Password: admin123');
        console.log('Please change the default password immediately!');
      } else {
        console.log('❌ Failed to create default admin user');
      }
    } else {
      console.log('✅ Database already has users, skipping initialization');
    }
    
    // Verify the database contents
    const finalUsers = getAllUsers();
    console.log(`Database now contains ${finalUsers.length} users`);
    
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

initializeDatabase(); 
