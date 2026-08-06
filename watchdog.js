import { getMeetingDetails } from './zoom-cli.js';
import { triggerMeetingStart } from './auto-scheduler.js';
import { launchHostBot } from './host-bot.js';
import { execSync } from 'child_process';
import fs from 'fs';

const MEETING_ID = '83633925074';

async function checkAndRevive() {
  const now = new Date();
  
  // Get time in Asia/Dubai
  const dubaiNowStr = now.toLocaleString('en-US', { timeZone: 'Asia/Dubai' });
  const dubaiNow = new Date(dubaiNowStr);

  // Check if schedule is active (07:50 GST to 17:30 GST)
  const gstDateStr = now.toLocaleDateString('en-US', { timeZone: 'Asia/Dubai' });
  const gstTimeStr = now.toLocaleTimeString('en-US', { timeZone: 'Asia/Dubai', hour12: false });
  const [hoursStr, minutesStr] = gstTimeStr.split(':');
  const hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);

  const dayOfWeekStr = now.toLocaleDateString('en-US', { timeZone: 'Asia/Dubai', weekday: 'short' });
  const isWeekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(dayOfWeekStr);

  const currentMinutes = hours * 60 + minutes;
  const startMinutes = 7 * 60 + 50; // 07:50 GST
  const endMinutes = 17 * 60 + 30;  // 17:30 GST

  const inScheduledWindow = isWeekday && (currentMinutes >= startMinutes && currentMinutes < endMinutes);
  
  // Expiration check: May 31, 2027
  const expireDate = new Date('2027-05-31T23:59:59');
  if (dubaiNow > expireDate) {
    console.log('📅 [WATCHDOG] Expiration date reached. Skipping checks.');
    return;
  }

  if (!inScheduledWindow) {
    console.log(`📅 [WATCHDOG] Current time ${gstTimeStr} (${dayOfWeekStr}) is outside scheduled window. Skipping check.`);
    return;
  }

  console.log(`🔍 [WATCHDOG] Inside scheduled window. Checking meeting status for Meeting ${MEETING_ID}...`);

  let isMeetingActive = false;
  try {
    const details = await getMeetingDetails(MEETING_ID);
    if (details && details.status !== 'inactive') {
      isMeetingActive = true;
    }
  } catch (err) {
    console.log('⚠️ [WATCHDOG] Failed to fetch meeting details (meeting might be offline):', err.message);
  }

  // Check if Host Bot heartbeat is active
  let isBotRunning = false;
  const heartbeatPath = '/tmp/zoom-host-bot-heartbeat.txt';
  try {
    if (fs.existsSync(heartbeatPath)) {
      const content = fs.readFileSync(heartbeatPath, 'utf8');
      const lastHeartbeat = parseInt(content.trim(), 10);
      if (!isNaN(lastHeartbeat) && Date.now() - lastHeartbeat < 45000) {
        isBotRunning = true;
      }
    }
  } catch (e) {}

  console.log(`📊 [WATCHDOG STATUS] Meeting Active: ${isMeetingActive} | Bot Heartbeat Alive: ${isBotRunning}`);

  if (!isMeetingActive) {
    console.log('🚨 [WATCHDOG ALERT] Meeting is OFFLINE! Starting new meeting session...');
    try {
      if (process.platform === 'linux') {
        try { execSync('pkill -f chromium'); } catch (e) {}
      }
      await triggerMeetingStart();
      console.log('🎉 [WATCHDOG SUCCESS] Meeting session and bots started successfully!');
    } catch (err) {
      console.error('❌ [WATCHDOG ERROR] Failed to start meeting:', err.message);
    }
  } else if (!isBotRunning) {
    console.log('🚨 [WATCHDOG ALERT] Meeting is active, but Host Bot is OFFLINE! Restarting Host Bot...');
    try {
      if (process.platform === 'linux') {
        try { execSync('pkill -f chromium'); } catch (e) {}
      }
      await launchHostBot();
      console.log('🎉 [WATCHDOG SUCCESS] Host Bot revived successfully!');
    } catch (err) {
      console.error('❌ [WATCHDOG ERROR] Failed to revive Host Bot:', err.message);
    }
  } else {
    console.log('✅ [WATCHDOG] Everything is healthy. Meeting and bots are running.');
  }
}

// Run immediately, then every 2 minutes
checkAndRevive().catch(console.error);
setInterval(() => {
  checkAndRevive().catch(console.error);
}, 2 * 60 * 1000);
