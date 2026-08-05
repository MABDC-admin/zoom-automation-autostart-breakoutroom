import { configureBreakoutRooms, getMeetingDetails } from './zoom-cli.js';

const MEETING_ID = '83633925074';

// Grade 1 to Grade 12 breakout rooms
const gradeRooms = Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`);

async function setupBreakouts() {
  console.log(`Setting up Grade 1 to Grade 12 breakout rooms for MABDC Zoom Meeting (${MEETING_ID})...`);
  
  try {
    await configureBreakoutRooms(MEETING_ID, gradeRooms);
    console.log('✅ Breakout Rooms configured successfully!');

    const details = await getMeetingDetails(MEETING_ID);
    console.log('\n📌 Updated Meeting Breakout Rooms:');
    if (details.settings?.breakout_room?.rooms) {
      details.settings.breakout_room.rooms.forEach((r, i) => console.log(`  ${i + 1}. ${r.name}`));
    }
  } catch (err) {
    console.error('❌ Failed to configure breakout rooms:', err.message);
  }
}

setupBreakouts();
