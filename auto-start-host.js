import { getMeetingDetails } from './zoom-cli.js';
import { exec } from 'child_process';

const MEETING_ID = '83633925074';

export async function autoStartHost(openBrowser = false) {
  console.log(`🔑 Generating Host Start Token & URL for Meeting ${MEETING_ID}...`);
  const details = await getMeetingDetails(MEETING_ID);
  
  const startUrl = details.start_url;
  console.log('\n================ HOST START CREDENTIALS ================');
  console.log(`Meeting Topic : ${details.topic}`);
  console.log(`Meeting ID    : ${details.id}`);
  console.log(`Host Start URL: ${startUrl}`);
  console.log('========================================================\n');

  if (openBrowser) {
    console.log('🚀 Launching meeting host session in system browser...');
    const startCmd = process.platform === 'win32' 
      ? `start "" "${startUrl}"` 
      : process.platform === 'darwin' 
        ? `open "${startUrl}"` 
        : `xdg-open "${startUrl}"`;
    
    exec(startCmd, (err) => {
      if (err) console.error('Failed to open browser:', err);
      else console.log('✅ Host session opened in browser!');
    });
  }

  return startUrl;
}

if (process.argv[1]?.endsWith('auto-start-host.js')) {
  const shouldOpen = process.argv.includes('--open');
  autoStartHost(shouldOpen).catch(err => console.error('Error starting host:', err));
}
