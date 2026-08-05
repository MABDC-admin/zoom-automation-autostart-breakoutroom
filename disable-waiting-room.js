import { updateMeeting, getMeetingDetails } from './zoom-cli.js';

async function disableWaitingRoom() {
  const meetingId = '83633925074';
  console.log(`Disabling Waiting Room and enabling Join Before Host for Meeting ${meetingId}...`);

  await updateMeeting(meetingId, {
    settings: {
      waiting_room: false,
      join_before_host: true,
      jbh_time: 0,
      host_video: true,
      participant_video: true,
      mute_upon_entry: false
    }
  });

  console.log('✅ WAITING ROOM DISABLED & JOIN BEFORE HOST ENABLED!');
  const details = await getMeetingDetails(meetingId);
  console.log('Updated Settings:', details.settings);
}

disableWaitingRoom().catch(console.error);
