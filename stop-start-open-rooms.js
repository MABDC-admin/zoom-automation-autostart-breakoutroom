import { triggerMeetingEnd } from './auto-scheduler.js';
import { execSync } from 'child_process';

async function resetAndOpenRooms() {
  console.log(`\n========================================================`);
  console.log(`🔄 1. STOPPING CURRENT ZOOM MEETING & CLOSING ROOMS...`);
  console.log(`========================================================`);
  await triggerMeetingEnd();

  console.log(`\nWaiting 4 seconds for Zoom session to clear...`);
  await new Promise(r => setTimeout(r, 4000));

  console.log(`\n========================================================`);
  console.log(`🚀 2. STARTING FRESH ZOOM MEETING & OPENING ALL ROOMS...`);
  console.log(`========================================================`);
  
  // Run open-rooms-now.js sequentially which handles checking options and opening the rooms before exiting
  console.log('Running sequential open-rooms-now.js...');
  execSync('node open-rooms-now.js', { stdio: 'inherit' });

  console.log(`\n========================================================`);
  console.log(`✅ COMPLETE! FRESH MEETING STARTED & ROOMS OPENED!`);
  console.log(`========================================================\n`);
}

resetAndOpenRooms().catch(console.error);
