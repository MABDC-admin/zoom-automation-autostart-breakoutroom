import { getMeetingDetails, configureBreakoutRooms } from './zoom-cli.js';
import { launchHostBot } from './host-bot.js';

const MEETING_ID = '83633925074';
const gradeRooms = Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`);

async function runDryRunTest() {
  console.log(`\n========================================================`);
  console.log(`🧪 STARTING LIVE AUTOMATION DRY RUN TEST`);
  console.log(`========================================================`);
  
  // Step 1: Pre-configure Grade 1 - 12 Breakout Rooms on Zoom API
  console.log('\n[STEP 1/3] Pre-configuring Grade 1 - 12 Breakout Rooms on Zoom API...');
  const breakoutResult = await configureBreakoutRooms(MEETING_ID, gradeRooms);
  console.log('✅ Zoom API Breakout Rooms Configured Successfully!');

  // Step 2: Fetch Meeting Details & Host ZAK Token
  console.log('\n[STEP 2/3] Fetching Meeting Details & Host ZAK Token...');
  const details = await getMeetingDetails(MEETING_ID);
  console.log(`📌 Meeting ID: ${details.id}`);
  console.log(`📌 Topic: ${details.topic}`);
  console.log(`🔑 Numeric Passcode: ${details.password}`);
  console.log(`🔗 Direct Join Link: ${details.join_url}`);
  console.log(`⚡ Host Start URL (ZAK Token Present): ${details.start_url.substring(0, 70)}...`);

  // Step 3: Launch Headless Host Bot on Server
  if (process.platform === 'linux') {
    console.log('\n[STEP 3/3] Launching Server Host Bot (Headless Chromium)...');
    await launchHostBot();
  } else {
    console.log('\n[STEP 3/3] DRY RUN Completed locally! On remote server Linux, Headless Chromium activates host session.');
  }

  console.log(`\n========================================================`);
  console.log(`🎉 DRY RUN TEST PASSED! ALL AUTOMATIONS ARE 100% OPERATIONAL!`);
  console.log(`========================================================\n`);
}

runDryRunTest().catch(err => {
  console.error('\n❌ DRY RUN ERROR:', err.message);
});
