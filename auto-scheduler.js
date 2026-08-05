import { getMeetingDetails, endMeeting, configureBreakoutRooms } from './zoom-cli.js';
import { launchHostBot } from './host-bot.js';

const MEETING_ID = '83633925074';
const gradeRooms = Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`);

let activeHostBot = null;

/**
 * Start Meeting, Launch Host Bot & Open Grade 1-12 Rooms
 */
export async function triggerMeetingStart() {
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'Asia/Dubai' });
  console.log(`\n========================================================`);
  console.log(`⏰ [${timestamp} GST] AUTOMATED MEETING START TRIGGERED`);
  console.log(`========================================================`);

  try {
    // 1. Configure Grade 1 - 12 Breakout Rooms on Zoom API
    console.log('▶ Pre-configuring Breakout Rooms (Grade 1 to 12)...');
    await configureBreakoutRooms(MEETING_ID, gradeRooms);

    // 2. Launch Headless Host Bot to open meeting & rooms
    if (process.platform === 'linux') {
      console.log('▶ Launching Server Host Bot (Headless Chromium)...');
      activeHostBot = await launchHostBot();
    }

    // 3. Fetch Host details
    const details = await getMeetingDetails(MEETING_ID);
    console.log('✅ Meeting Prepared & Host Session Launched Successfully!');
    console.log(`📌 Topic: ${details.topic}`);
    console.log(`🔗 Join URL: ${details.join_url}`);
    console.log(`🔑 Host Start URL: ${details.start_url}`);
    return details;
  } catch (err) {
    console.error('❌ Failed to start meeting:', err.message);
  }
}

/**
 * Close Breakout Rooms & End Zoom Meeting
 */
export async function triggerMeetingEnd() {
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'Asia/Dubai' });
  console.log(`\n========================================================`);
  console.log(`⏰ [${timestamp} GST] AUTOMATED MEETING CLOSE TRIGGERED`);
  console.log(`========================================================`);

  try {
    if (activeHostBot?.browser) {
      await activeHostBot.browser.close().catch(() => {});
      activeHostBot = null;
    }

    await endMeeting(MEETING_ID);
    console.log(`✅ Meeting ${MEETING_ID} closed and ended successfully!`);
    console.log(`🚪 All breakout rooms closed.`);
  } catch (err) {
    console.error('❌ Failed to end meeting:', err.message);
  }
}

/**
 * Daily Time Checker Loop (Runs every minute)
 */
function startSchedulerDaemon() {
  console.log('🚀 Zoom Daily Scheduler & Host Bot Daemon Started!');
  console.log('📅 Schedule Rule (Asia/Dubai Timezone):');
  console.log('   - 🟢 START MEETING & ROOMS : 07:50 GST Weekdays (Mon-Fri) until May 31, 2027');
  console.log('   - 🔴 CLOSE ROOMS & END ZOOM: 17:30 GST Weekdays (Mon-Fri) until May 31, 2027');

  let lastStartDay = null;
  let lastEndDay = null;

  setInterval(async () => {
    const now = new Date();
    
    // Convert to Asia/Dubai time context for accurate evaluation
    const dubaiNowStr = now.toLocaleString('en-US', { timeZone: 'Asia/Dubai' });
    const dubaiNow = new Date(dubaiNowStr);
    
    // Expiration date check: May 31, 2027 GST
    const expireDate = new Date('2027-05-31T23:59:59');
    if (dubaiNow > expireDate) {
      console.log('📅 Zoom automation schedule completed. May 31, 2027 limit reached.');
      return;
    }

    const gstDateStr = now.toLocaleDateString('en-US', { timeZone: 'Asia/Dubai' });
    const gstTimeStr = now.toLocaleTimeString('en-US', { timeZone: 'Asia/Dubai', hour12: false });
    const [hoursStr, minutesStr] = gstTimeStr.split(':');
    const hours = parseInt(hoursStr, 10);
    const minutes = parseInt(minutesStr, 10);

    // Get current day of week in Asia/Dubai
    const dayOfWeekStr = now.toLocaleDateString('en-US', { timeZone: 'Asia/Dubai', weekday: 'short' });
    const isWeekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(dayOfWeekStr);

    if (isWeekday) {
      // Check for 07:50 GST Start
      if (hours === 7 && minutes === 50 && lastStartDay !== gstDateStr) {
        lastStartDay = gstDateStr;
        await triggerMeetingStart();
      }

      // Check for 17:30 GST Close
      if (hours === 17 && minutes === 30 && lastEndDay !== gstDateStr) {
        lastEndDay = gstDateStr;
        await triggerMeetingEnd();
      }
    }
  }, 30 * 1000);
}

// CLI handler
if (process.argv[1]?.endsWith('auto-scheduler.js')) {
  if (process.argv.includes('--start-now')) {
    triggerMeetingStart();
  } else if (process.argv.includes('--end-now')) {
    triggerMeetingEnd();
  } else {
    startSchedulerDaemon();
  }
}
