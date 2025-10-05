#!/usr/bin/env node

// Final test to verify Unknown User issue is resolved
const http = require('http');

const BASE_URL = 'localhost:3000';
const SUPPORT_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0LXN1cHBvcnQtdXNlci1pZCIsImlhdCI6MTc1OTY5OTY5OCwiZXhwIjoxNzU5Nzg2MDk4fQ._6RIHRd0mb-M18yhnZ2ZjHqjuNHuxU3z2kptXHL3rvE';
const ADMIN_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJzeXN0ZW0tYWRtaW4tdXNlci1pZCIsImlhdCI6MTc1OTY5OTY3MCwiZXhwIjoxNzU5Nzg2MDcwfQ.gZqBdAjAYd69q6aoE15igLwPrEggXf_T06HcmM3_ccg';

function makeRequest(method, path, data, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function runTest() {
  console.log('🧪 Final Unknown User Fix Verification Test\n');

  try {
    // 1. Get weeks data
    console.log('1️⃣ Getting weeks data...');
    const weeksResponse = await makeRequest('GET', '/api/weeks', null, SUPPORT_TOKEN);
    if (weeksResponse.status !== 200) {
      console.log('❌ Failed to get weeks:', weeksResponse.data);
      return;
    }

    const firstWeek = weeksResponse.data.weeks[0];
    const firstDay = firstWeek.days[0];
    console.log(`✅ Found week ${firstWeek.weekNumber}, day ${firstDay.dayName} (ID: ${firstDay.id})`);

    // 2. Create activity request as support user
    console.log('\n2️⃣ Creating activity request as support user...');
    const activityData = {
      dayId: firstDay.id,
      time: '10:30',
      description: 'Final test activity - verifying Unknown User fix',
      period: 'MORNING',
      userId: 'test-support-user-id'
    };

    const activityResponse = await makeRequest('POST', '/api/activities/request', activityData, SUPPORT_TOKEN);
    if (activityResponse.status !== 201) {
      console.log('❌ Failed to create activity request:', activityResponse.data);
      return;
    }
    console.log('✅ Activity request created successfully');

    // 3. Check pending changes as admin
    console.log('\n3️⃣ Checking pending changes as admin...');
    const pendingResponse = await makeRequest('GET', `/api/weeks/${firstWeek.id}`, null, ADMIN_TOKEN);
    if (pendingResponse.status !== 200) {
      console.log('❌ Failed to get pending changes:', pendingResponse.data);
      return;
    }

    const pendingChanges = pendingResponse.data.pendingChanges;
    console.log(`📋 Found ${pendingChanges.length} pending change(s)`);

    if (pendingChanges.length === 0) {
      console.log('ℹ️  No pending changes found to verify user display');
      return;
    }

    // 4. Verify user information in pending changes
    const latestChange = pendingChanges[pendingChanges.length - 1];
    console.log('\n4️⃣ Verifying user information in pending changes:');
    console.log('Pending change data:');
    console.log('  Change ID:', latestChange.id);
    console.log('  Change Type:', latestChange.changeType);
    console.log('  User ID:', latestChange.userId);
    console.log('  User Object:', latestChange.user);

    if (latestChange.user && latestChange.user.name) {
      console.log(`✅ SUCCESS: User display working correctly!`);
      console.log(`   User Name: "${latestChange.user.name}"`);
      console.log(`   User Email: "${latestChange.user.email}"`);
      console.log(`   User Role: "${latestChange.user.role}"`);
      console.log('\n🎉 Unknown User issue has been resolved!');

      // 5. Test approval to make sure it works end-to-end
      console.log('\n5️⃣ Testing approval functionality...');
      const approvalResponse = await makeRequest('PUT', `/api/pending-changes/${latestChange.id}/approve`, {}, ADMIN_TOKEN);
      if (approvalResponse.status === 200) {
        console.log('✅ Approval successful - complete workflow working!');
      } else {
        console.log('⚠️  Approval failed:', approvalResponse.data);
      }

    } else {
      console.log('❌ FAILED: User information still missing or showing Unknown User');
      console.log('   This means the issue is NOT resolved');
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

runTest();