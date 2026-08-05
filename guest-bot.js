import puppeteer from 'puppeteer-core';
import { getMeetingDetails } from './zoom-cli.js';

const MEETING_ID = '83633925074';
const CHROMIUM_PATH = '/usr/bin/chromium-browser';

export async function launchGuestBot() {
  console.log(`\n========================================================`);
  console.log(`🤖 [OPENCLAW-GUEST-BOT] Launching Guest Keep-Alive Bot...`);
  console.log(`========================================================`);
  
  // Use Web Client Join URL
  const targetUrl = `https://us06web.zoom.us/wc/${MEETING_ID}/join?pwd=4quJY4kaA71kjCtju0gPMCAsp6Uswn.1`;
  console.log(`[GUEST-BOT] Target URL: ${targetUrl}`);

  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-web-security'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  console.log(`[GUEST-BOT] Navigating to Guest Web Client join URL...`);
  await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 60000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 6000));

  // Fill Name
  try {
    const nameInput = await page.$('#input-for-name, input[name="inputname"], .input-name, input[type="text"]');
    if (nameInput) {
      console.log('[GUEST-BOT] Entering Name: "MABDC Room Keeper"...');
      await nameInput.type('MABDC Room Keeper');
      const joinBtn = await page.$('.wc-btn-primary, button[type="submit"]');
      if (joinBtn) await page.evaluate(el => el.click(), joinBtn);
    }
  } catch (e) {}

  // Keep-alive loop to dismiss cookies/audio prompts
  const interval = setInterval(async () => {
    try {
      const cookieBtn = await page.$('#onetrust-accept-btn-handler, #btn-accept');
      if (cookieBtn) await page.evaluate(el => el.click(), cookieBtn);

      const buttons = await page.$$('button, .zm-btn, .wc-btn-primary');
      for (const btn of buttons) {
        const text = await page.evaluate(el => el.innerText || el.textContent, btn);
        if (text && (text.includes('Join Audio') || text.includes('Computer Audio') || text.includes('Got It') || text.includes('Agree'))) {
          await page.evaluate(el => el.click(), btn).catch(() => {});
        }
      }
    } catch (e) {}
  }, 4000);

  console.log('✅ [GUEST-BOT] Keep-Alive Bot Joined Meeting Successfully!');
  return { browser, page, interval };
}

if (process.argv[1]?.endsWith('guest-bot.js')) {
  launchGuestBot().catch(err => console.error('[GUEST-BOT ERROR]:', err));
}
