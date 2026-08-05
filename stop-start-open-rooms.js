import { triggerMeetingEnd, triggerMeetingStart } from './auto-scheduler.js';

async function resetAndOpenRooms() {
  console.log(`\n========================================================`);
  console.log(`🔄 1. STOPPING CURRENT ZOOM MEETING & CLOSING ROOMS...`);
  console.log(`========================================================`);
  await triggerMeetingEnd();

  console.log(`\nWaiting 3 seconds for Zoom session to clear...`);
  await new Promise(r => setTimeout(r, 3000));

  console.log(`\n========================================================`);
  console.log(`🚀 2. STARTING FRESH ZOOM MEETING & OPENING ALL ROOMS...`);
  console.log(`========================================================`);
  await triggerMeetingStart();

  console.log(`\n========================================================`);
  console.log(`✅ COMPLETE! FRESH MEETING STARTED & ROOMS OPENED!`);
  console.log(`========================================================\n`);
}

resetAndOpenRooms().catch(console.error);
