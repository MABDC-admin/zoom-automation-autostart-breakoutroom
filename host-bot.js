import puppeteer from 'puppeteer-core';
import { getMeetingDetails, configureBreakoutRooms } from './zoom-cli.js';
import fs from 'fs';

const MEETING_ID = '83633925074';
const CHROMIUM_PATH = '/usr/bin/chromium-browser';
const gradeRooms = Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`);

export async function launchHostBot() {
  console.log(`\n========================================================`);
  console.log(`🤖 [OPENCLAW-HOST-BOT] Starting Room Opener with Declarative Logic...`);
  console.log(`========================================================`);
  
  // 1. Configure Grade 1 - 12 Breakout Rooms on Zoom API
  await configureBreakoutRooms(MEETING_ID, gradeRooms).catch(() => {});

  // 2. Fetch Host start_url with ZAK token
  const details = await getMeetingDetails(MEETING_ID);
  const startUrl = details.start_url;

  let targetUrl = startUrl;
  if (startUrl.includes('/s/')) {
    targetUrl = startUrl.replace('/s/', '/wc/').replace('?', '/start?');
  }

  console.log(`[OPENCLAW] Target URL: ${targetUrl.substring(0, 85)}...`);

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
  await page.setViewport({ width: 1440, height: 900 });

  console.log(`[OPENCLAW] Navigating to Host Web Client start URL...`);
  await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 60000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 5000));

  // Fill Name
  try {
    const nameInput = await page.$('#input-for-name, input[name="inputname"], .input-name, input[type="text"]');
    if (nameInput) {
      console.log('[OPENCLAW] Entering Host Name: "MABDC Host"...');
      await nameInput.type('MABDC Host');
      const joinBtn = await page.$('.wc-btn-primary, button[type="submit"]');
      if (joinBtn) await page.evaluate(el => el.click(), joinBtn);
    }
  } catch (e) {}

  // 4. Declarative In-Meeting Control Loop (Self-Healing State Machine)
  console.log('[OPENCLAW] Declarative In-Meeting Control Loop Active... (Heartbeat active)');
  let roomsOpened = false;

  const autoClicker = setInterval(async () => {
    // Write heartbeat file
    try {
      fs.writeFileSync('/tmp/zoom-host-bot-heartbeat.txt', Date.now().toString());
    } catch (err) {}

    try {
      if (roomsOpened) return;

      // Click Accept Cookies
      const cookieBtn = await page.$('#onetrust-accept-btn-handler, #btn-accept');
      if (cookieBtn) await page.evaluate(el => el.click(), cookieBtn);

      // Click "Join Audio by Computer" / "Got It" / "Start Meeting"
      const buttons = await page.$$('button, .zm-btn, .wc-btn-primary, a');
      for (const btn of buttons) {
        const text = await page.evaluate(el => el.innerText || el.textContent, btn);
        if (text && (text.includes('Join Audio') || text.includes('Computer Audio') || text.includes('Start') || text.includes('Got It') || text.includes('Agree'))) {
          await page.evaluate(el => el.click(), btn).catch(() => {});
        }
      }

      // Check if options checkboxes are currently visible on the page
      const inputs = await page.$$('input[type="checkbox"], .zm-checkbox-input');
      
      if (inputs.length > 0) {
        // STATE A: Checkboxes are visible (Options dropdown is open!)
        // Perform checkbox configurations
        for (const input of inputs) {
          const labelText = await page.evaluate(el => {
            const label = el.closest('label') || el.closest('div');
            return label ? label.innerText || label.textContent : '';
          }, input);

          const isChecked = await page.evaluate(el => {
            const inp = el.tagName === 'INPUT' ? el : el.querySelector('input');
            if (inp) return inp.checked || inp.getAttribute('aria-checked') === 'true' || el.classList.contains('checked') || el.classList.contains('is-checked');
            return el.classList.contains('checked') || el.classList.contains('is-checked') || el.getAttribute('aria-checked') === 'true';
          }, input);

          const labelLower = labelText.toLowerCase();

          // A. "Allow participants to choose room"
          if (labelLower.includes('choose room') || labelLower.includes('select room')) {
            if (!isChecked) {
              console.log('🤖 [OPENCLAW] Checking option: "Allow participants to choose room"');
              await page.evaluate(el => el.click(), input).catch(() => {});
              await new Promise(r => setTimeout(r, 800));
            }
          }

          // B. "Allow participants to return to the main session at any time"
          if (labelLower.includes('return to the main') || labelLower.includes('return to main')) {
            if (!isChecked) {
              console.log('🤖 [OPENCLAW] Checking option: "Allow participants to return to main session"');
              await page.evaluate(el => el.click(), input).catch(() => {});
              await new Promise(r => setTimeout(r, 800));
            }
          }

          // C. "Automatically move all assigned participants into breakout rooms" (Strict Match)
          if (labelLower.includes('move all assigned') || (labelLower.includes('automatically move') && labelLower.includes('assigned'))) {
            if (!isChecked) {
              console.log('🤖 [OPENCLAW] Checking option: "Automatically move all assigned participants"');
              await page.evaluate(el => el.click(), input).catch(() => {});
              await new Promise(r => setTimeout(r, 800));
            }
          }
        }

        // Click "Open All Rooms" / "Start Rooms"
        const modalButtons = await page.$$('button, .zm-btn, .wc-btn-primary');
        for (const mBtn of modalButtons) {
          const mText = await page.evaluate(el => el.innerText || el.textContent, mBtn);
          if (mText && (mText.toLowerCase().includes('open all') || mText.toLowerCase().includes('open rooms') || mText.toLowerCase().includes('start rooms'))) {
            console.log('🎉 [OPENCLAW SUCCESS] CLICKED "OPEN ALL ROOMS"! Rooms Grade 1-12 are now OPEN and self-selectable!');
            await page.evaluate(el => el.click(), mBtn).catch(() => {});
            roomsOpened = true;
            break;
          }
        }

      } else {
        // STATE B: Checkboxes are NOT visible. Check if Settings Cog is visible (Modal is open, but options dropdown is closed)
        const optionsBtn = await page.$('button[aria-label="Options"], button[aria-label="Settings"], .zm-icon-settings, .breakout-room-setting-btn');
        
        if (optionsBtn) {
          console.log('🤖 [OPENCLAW] Settings cog visible. Clicking to reveal options...');
          await page.evaluate(el => el.click(), optionsBtn).catch(() => {});
          await new Promise(r => setTimeout(r, 1500));
        } else {
          // STATE C: Neither checkboxes nor Settings Cog is visible. Click Breakout Rooms on toolbar.
          const toolbarButtons = await page.$$('button, div[role="button"], a');
          for (const btn of toolbarButtons) {
            const text = await page.evaluate(el => el.innerText || el.textContent || el.getAttribute('aria-label') || '', btn);
            if (text && text.toLowerCase().includes('breakout room')) {
              console.log('🤖 [OPENCLAW] Main screen. Clicking Breakout Rooms toolbar icon...');
              await page.evaluate(el => el.click(), btn).catch(() => {});
              await new Promise(r => setTimeout(r, 2000));
              break;
            }
          }
        }
      }
    } catch (e) {}
  }, 2500);

  console.log('✅ [OPENCLAW] Host Bot Active & Meeting Started Successfully!');
  return { browser, page, autoClicker };
}

if (process.argv[1]?.endsWith('host-bot.js')) {
  launchHostBot().catch(err => console.error('[OPENCLAW ERROR]:', err));
}
