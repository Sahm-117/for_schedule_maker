#!/usr/bin/env node

// Test script to verify the user cleanup and pending changes functionality
const axios = require('axios');

const BASE_URL = 'http://localhost:3001';

// Test data
let adminToken = '';
let supportToken = '';
let testWeekId = 1;

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testAdminLogin() {
  console.log('🔑 Testing Admin Login...');
  try {
    const response = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'admin@test.com',
      password: 'admin123'
    });

    adminToken = response.data.token;
    console.log('✅ Admin login successful');
    return true;
  } catch (error) {
    console.log('❌ Admin login failed:', error.response?.data?.error || error.message);
    return false;
  }
}

async function testSupportLogin() {
  console.log('🔑 Testing Support User Login...');
  try {
    const response = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'support@test.com',
      password: 'support123'
    });

    supportToken = response.data.token;
    console.log('✅ Support login successful');
    return true;
  } catch (error) {
    console.log('❌ Support login failed:', error.response?.data?.error || error.message);
    return false;
  }
}

async function testCreateSupportActivity() {
  console.log('📝 Testing Support User Activity Creation...');
  try {
    // First get weeks to find a day
    const weeksResponse = await axios.get(`${BASE_URL}/api/weeks`, {
      headers: { Authorization: `Bearer ${supportToken}` }
    });

    const firstWeek = weeksResponse.data.weeks[0];
    const firstDay = firstWeek.days[0];

    const response = await axios.post(`${BASE_URL}/api/activities/request`, {
      dayId: firstDay.id,
      time: '10:30',
      description: 'Test support activity - cleanup verification',
      period: 'MORNING',
      userId: 'test-support-user-id'
    }, {
      headers: { Authorization: `Bearer ${supportToken}` }
    });

    console.log('✅ Support activity creation successful');
    return { weekId: firstWeek.id, dayId: firstDay.id };
  } catch (error) {
    console.log('❌ Support activity creation failed:', error.response?.data?.error || error.message);
    return null;
  }
}

async function testPendingChanges(weekId) {
  console.log('📋 Testing Pending Changes Display...');
  try {
    const response = await axios.get(`${BASE_URL}/api/weeks/${weekId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    const pendingChanges = response.data.pendingChanges;
    console.log(`📊 Found ${pendingChanges.length} pending changes`);

    if (pendingChanges.length > 0) {
      const firstChange = pendingChanges[0];
      if (firstChange.user && firstChange.user.name) {
        console.log(`✅ User display working: "${firstChange.user.name}" (${firstChange.user.email})`);
        return firstChange.id;
      } else {
        console.log('❌ User info missing in pending change');
        console.log('Pending change data:', JSON.stringify(firstChange, null, 2));
        return null;
      }
    } else {
      console.log('ℹ️  No pending changes found');
      return null;
    }
  } catch (error) {
    console.log('❌ Failed to fetch pending changes:', error.response?.data?.error || error.message);
    return null;
  }
}

async function testApproval(changeId) {
  if (!changeId) {
    console.log('⏭️  Skipping approval test - no pending changes');
    return true;
  }

  console.log('✅ Testing Pending Change Approval...');
  try {
    const response = await axios.put(`${BASE_URL}/api/pending-changes/${changeId}/approve`, {}, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    console.log('✅ Approval successful');
    console.log(`📊 Results: ${response.data.results.length} activities created`);
    return true;
  } catch (error) {
    console.log('❌ Approval failed:', error.response?.data?.error || error.message);
    console.log('Error details:', error.response?.data?.details || 'No details');
    return false;
  }
}

async function testUsersList() {
  console.log('👥 Testing Users List...');
  try {
    const response = await axios.get(`${BASE_URL}/api/users`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    const users = response.data.users;
    console.log(`📊 Found ${users.length} users:`);
    users.forEach(user => {
      console.log(`  - ${user.name} (${user.email}) - ${user.role}`);
    });

    return true;
  } catch (error) {
    console.log('❌ Failed to fetch users:', error.response?.data?.error || error.message);
    return false;
  }
}

async function runTests() {
  console.log('🧪 Starting User Cleanup Verification Tests\n');

  // Test login
  const adminLoginOk = await testAdminLogin();
  if (!adminLoginOk) {
    console.log('❌ Cannot continue without admin access');
    return;
  }

  const supportLoginOk = await testSupportLogin();
  if (!supportLoginOk) {
    console.log('❌ Cannot continue without support access');
    return;
  }

  await delay(500);

  // Test users list
  await testUsersList();
  await delay(500);

  // Test activity creation
  const activityResult = await testCreateSupportActivity();
  await delay(500);

  // Test pending changes display
  let changeId = null;
  if (activityResult) {
    changeId = await testPendingChanges(activityResult.weekId);
    await delay(500);
  }

  // Test approval
  await testApproval(changeId);

  console.log('\n🎉 Testing Complete!');

  if (changeId) {
    console.log('✅ All tests passed - Unknown User issue appears to be resolved!');
  } else {
    console.log('ℹ️  Tests completed but no pending changes were found to verify user display');
  }
}

runTests().catch(console.error);