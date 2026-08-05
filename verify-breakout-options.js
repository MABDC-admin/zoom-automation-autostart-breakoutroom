import { getMeetingDetails } from './zoom-cli.js';

async function verifyOptions() {
  const meetingId = '83633925074';
  const details = await getMeetingDetails(meetingId);
  console.log('\n========================================================');
  console.log('🔍 ZOOM API BREAKOUT ROOM CONFIGURATION');
  console.log('========================================================');
  console.log(JSON.stringify(details.settings.breakout_room, null, 2));
  console.log('========================================================\n');
}

verifyOptions().catch(console.error);
