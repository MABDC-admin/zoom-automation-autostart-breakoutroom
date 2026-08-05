import { getMeetingDetails } from './zoom-cli.js';
import { triggerMeetingStart } from './auto-scheduler.js';
import { execSync } from 'child_process';

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
    // If the meeting is active, it will return details without error, and should have a status
    if (details && details.status !== 'inactive') {
      isMeetingActive = true;
    }
  } catch (err) {
    console.log('⚠️ [WATCHDOG] Failed to fetch meeting details (meeting might be offline):', err.message);
  }

  // Check if Puppeteer/Chromium processes are running on the server
  let isBrowserRunning = false;
  if (process.platform === 'linux') {
    try {
      const psOutput = execSync('ps aux | grep chromium | grep -v grep || true').toString();
      if (psOutput.includes('chromium-browser') || psOutput.includes('chrome')) {
        isBrowserRunning = true;
      }
    } catch (e) {}
  } else {
    // Windows dev testing fallback
    isBrowserRunning = true;
  }

  console.log(`📊 [WATCHDOG STATUS] Meeting Active: ${isMeetingActive} | Bots Running: ${isBrowserRunning}`);

  if (!isMeetingActive || !isBrowserRunning) {
    console.log('🚨 [WATCHDOG ALERT] Meeting or Bots are OFFLINE! Auto-reviving meeting session now...');
    try {
      // Trigger a clean restart
      await triggerMeetingStart();
      console.log('🎉 [WATCHDOG SUCCESS] Meeting session and bots revived successfully!');
    } catch (reviveErr) {
      console.error('❌ [WATCHDOG ERROR] Failed to revive meeting:', reviveErr.message);
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
