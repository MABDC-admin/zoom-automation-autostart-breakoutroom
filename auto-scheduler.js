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
  console.log('   - 🟢 START MEETING & ROOMS : 07:30 GST daily (03:30 UTC)');
  console.log('   - 🔴 CLOSE ROOMS & END ZOOM: 17:30 GST daily (13:30 UTC)');

  let lastStartDay = null;
  let lastEndDay = null;

  setInterval(async () => {
    const now = new Date();
    const gstDateStr = now.toLocaleDateString('en-US', { timeZone: 'Asia/Dubai' });
    const gstTimeStr = now.toLocaleTimeString('en-US', { timeZone: 'Asia/Dubai', hour12: false });
    const [hoursStr, minutesStr] = gstTimeStr.split(':');
    const hours = parseInt(hoursStr, 10);
    const minutes = parseInt(minutesStr, 10);

    // Check for 07:30 GST Start
    if (hours === 7 && minutes === 30 && lastStartDay !== gstDateStr) {
      lastStartDay = gstDateStr;
      await triggerMeetingStart();
    }

    // Check for 17:30 GST Close
    if (hours === 17 && minutes === 30 && lastEndDay !== gstDateStr) {
      lastEndDay = gstDateStr;
      await triggerMeetingEnd();
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
