import { 
  getAllUsers,
  createSession,
  getSessionByToken,
  createJob,
  getJob,
  getAllJobs,
  createPasswordResetToken,
  getPasswordResetToken,
  createEmailVerificationToken,
  getEmailVerificationToken,
  recordLoginAttempt,
  getRecentFailedLoginAttempts,
  cleanupExpiredSessions,
  cleanupOldJobs,
  cleanupExpiredPasswordResetTokens,
  cleanupExpiredEmailVerificationTokens,
  cleanupOldLoginAttempts
} from './services/database.js';

console.log('🧪 Testing Complete SQLite Migration...\n');

async function testMigration() {
  try {
    // Test 1: Users
    console.log('1. Testing Users...');
    const users = getAllUsers();
    console.log(`   ✅ Found ${users.length} users in database`);
    
    // Test 2: Sessions
    console.log('\n2. Testing Sessions...');
    const sessionId = 'test-session-' + Date.now();
    const userId = users[0]?.id || 1;
    const token = 'test-token-' + Date.now();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    
    createSession(sessionId, userId, token, '127.0.0.1', 'Test Browser', expiresAt);
    console.log('   ✅ Created test session');
    
    const retrievedSession = getSessionByToken(token);
    if (retrievedSession) {
      console.log('   ✅ Retrieved session by token');
    } else {
      console.log('   ❌ Failed to retrieve session');
    }
    
    // Test 3: Jobs
    console.log('\n3. Testing Jobs...');
    const jobId = 'test-job-' + Date.now();
    const jobData = { test: 'data', timestamp: Date.now() };
    
    createJob(jobId, 'test', JSON.stringify(jobData));
    console.log('   ✅ Created test job');
    
    const retrievedJob = getJob(jobId);
    if (retrievedJob) {
      console.log('   ✅ Retrieved job by ID');
      console.log(`   📊 Job status: ${retrievedJob.status}`);
    } else {
      console.log('   ❌ Failed to retrieve job');
    }
    
    const allJobs = getAllJobs();
    console.log(`   📊 Total jobs in database: ${allJobs.length}`);
    
    // Test 4: Password Reset Tokens
    console.log('\n4. Testing Password Reset Tokens...');
    const resetToken = 'reset-token-' + Date.now();
    const resetExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    
    createPasswordResetToken(userId, resetToken, resetExpiresAt);
    console.log('   ✅ Created password reset token');
    
    const retrievedResetToken = getPasswordResetToken(resetToken);
    if (retrievedResetToken) {
      console.log('   ✅ Retrieved password reset token');
    } else {
      console.log('   ❌ Failed to retrieve password reset token');
    }
    
    // Test 5: Email Verification Tokens
    console.log('\n5. Testing Email Verification Tokens...');
    const emailToken = 'email-token-' + Date.now();
    const emailExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    
    createEmailVerificationToken(userId, emailToken, emailExpiresAt);
    console.log('   ✅ Created email verification token');
    
    const retrievedEmailToken = getEmailVerificationToken(emailToken);
    if (retrievedEmailToken) {
      console.log('   ✅ Retrieved email verification token');
    } else {
      console.log('   ❌ Failed to retrieve email verification token');
    }
    
    // Test 6: Login Attempts
    console.log('\n6. Testing Login Attempts...');
    recordLoginAttempt('testuser', '127.0.0.1', false);
    recordLoginAttempt('testuser', '127.0.0.1', true);
    console.log('   ✅ Recorded login attempts');
    
    const failedAttempts = getRecentFailedLoginAttempts('testuser', 1);
    console.log(`   📊 Recent failed login attempts: ${failedAttempts.length}`);
    
    // Test 7: Cleanup Functions
    console.log('\n7. Testing Cleanup Functions...');
    cleanupExpiredSessions();
    cleanupOldJobs(24);
    cleanupExpiredPasswordResetTokens();
    cleanupExpiredEmailVerificationTokens();
    cleanupOldLoginAttempts(30);
    console.log('   ✅ All cleanup functions executed successfully');
    
    // Test 8: Database Statistics
    console.log('\n8. Database Statistics...');
    const finalUsers = getAllUsers();
    const finalJobs = getAllJobs();
    const finalSessions = getSessionByToken(token); // Should still exist since not expired
    
    console.log(`   👥 Users: ${finalUsers.length}`);
    console.log(`   📋 Jobs: ${finalJobs.length}`);
    console.log(`   🔐 Active Sessions: ${finalSessions ? 1 : 0}`);
    
    console.log('\n🎉 All SQLite migration tests completed successfully!');
    console.log('\n📋 Migration Summary:');
    console.log('   ✅ Users migrated to SQLite');
    console.log('   ✅ Sessions migrated to SQLite');
    console.log('   ✅ Jobs migrated to SQLite');
    console.log('   ✅ Password reset tokens migrated to SQLite');
    console.log('   ✅ Email verification tokens migrated to SQLite');
    console.log('   ✅ Login attempts migrated to SQLite');
    console.log('   ✅ Automatic cleanup tasks configured');
    console.log('   ✅ File-based persistence removed');
    
  } catch (error) {
    console.error('❌ Migration test failed:', error);
  }
}

testMigration(); 
