import puppeteer from 'puppeteer-core';
import { getMeetingDetails, configureBreakoutRooms, endMeeting } from './zoom-cli.js';

const CHROMIUM_PATH = '/usr/bin/chromium-browser';
const MEETING_ID = '83633925074';
const gradeRooms = Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`);

async function openRoomsAccurate() {
  console.log(`\n========================================================`);
  console.log('🎯 [ACCURATE-ROOM-OPENER] Starting breakout restart...');
  console.log(`========================================================`);

  // 1. Close current meeting
  console.log('1. Closing current Zoom meeting...');
  await endMeeting(MEETING_ID).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));

  // 2. Pre-configure rooms via API
  console.log('2. Configuring breakout rooms via API...');
  await configureBreakoutRooms(MEETING_ID, gradeRooms);

  // 3. Fetch start URL
  const details = await getMeetingDetails(MEETING_ID);
  const startUrl = details.start_url;

  let targetUrl = startUrl;
  if (startUrl.includes('/s/')) {
    targetUrl = startUrl.replace('/s/', '/wc/').replace('?', '/start?');
  }

  console.log('3. Launching Headless Chromium Host...');
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--disable-web-security'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log('4. Navigating directly to Host Web Client start URL...');
  await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 60000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 6000));

  // Fill Name
  try {
    const nameInput = await page.$('#input-for-name, input[name="inputname"], .input-name, input[type="text"]');
    if (nameInput) {
      console.log('Entering Host Name...');
      await nameInput.type('MABDC Host');
      const joinBtn = await page.$('.wc-btn-primary, button[type="submit"]');
      if (joinBtn) await page.evaluate(el => el.click(), joinBtn);
    }
  } catch (e) {}

  await new Promise(r => setTimeout(r, 8000));

  // Dismiss cookie accept & audio join
  try {
    const cookieBtn = await page.$('#onetrust-accept-btn-handler, #btn-accept');
    if (cookieBtn) await page.evaluate(el => el.click(), cookieBtn);

    const allButtons = await page.$$('button, .zm-btn, .wc-btn-primary');
    for (const btn of allButtons) {
      const text = await page.evaluate(el => el.innerText || el.textContent, btn);
      if (text && (text.includes('Join Audio') || text.includes('Computer Audio') || text.includes('Got It') || text.includes('Agree'))) {
        await page.evaluate(el => el.click(), btn).catch(() => {});
      }
    }
  } catch (e) {}

  await new Promise(r => setTimeout(r, 5000));

  // Find and click the Breakout Rooms button
  console.log('5. Clicking Breakout Rooms Button in Toolbar...');
  let buttonFound = false;
  const btns = await page.$$('button, div[role="button"], a');
  for (const btn of btns) {
    const text = await page.evaluate(el => el.innerText || el.textContent || el.getAttribute('aria-label') || '', btn);
    if (text && text.toLowerCase().includes('breakout')) {
      console.log(`🤖 Found Breakout Button: "${text.trim()}". Clicking...`);
      await page.evaluate(el => el.click(), btn);
      buttonFound = true;
      break;
    }
  }

  if (buttonFound) {
    await new Promise(r => setTimeout(r, 3000));
    
    // Click Settings Options cog button
    const optionsBtn = await page.$('button[aria-label="Options"], button[aria-label="Settings"], .zm-icon-settings, .breakout-room-setting-btn');
    if (optionsBtn) {
      console.log('🤖 Clicked options settings cog...');
      await page.evaluate(el => el.click(), optionsBtn);
      await new Promise(r => setTimeout(r, 1500));
    }

    // Locate checkboxes uniquely via input[type="checkbox"] to prevent duplicate matches/toggling off
    console.log('🤖 Listing and matching all settings checkboxes...');
    const inputs = await page.$$('input[type="checkbox"], .zm-checkbox-input');
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
      console.log(`   - Found Checkbox text: "${labelText.trim().replace(/\n/g, ' ')}" | Checked state: ${isChecked}`);

      // A. "Allow participants to choose room"
      if (labelLower.includes('choose room') || labelLower.includes('select room')) {
        if (!isChecked) {
          console.log('   ⚡ [ACTION] Checking option: "Allow participants to choose room"');
          await page.evaluate(el => el.click(), input);
          await new Promise(r => setTimeout(r, 800));
        }
      }

      // B. "Allow participants to return to the main session at any time"
      if (labelLower.includes('return to the main') || labelLower.includes('return to main')) {
        if (!isChecked) {
          console.log('   ⚡ [ACTION] Checking option: "Allow participants to return to main session"');
          await page.evaluate(el => el.click(), input);
          await new Promise(r => setTimeout(r, 800));
        }
      }

      // C. "Automatically move all assigned participants into breakout rooms" (Strict Match)
      if (labelLower.includes('move all assigned') || (labelLower.includes('automatically move') && labelLower.includes('assigned'))) {
        if (!isChecked) {
          console.log('   ⚡ [ACTION] Checking option: "Automatically move all assigned participants"');
          await page.evaluate(el => el.click(), input);
          await new Promise(r => setTimeout(r, 800));
        }
      }
    }

    // Capture screenshot of settings options dropdown AFTER checking all three
    console.log('📸 Capturing screenshot of options settings panel after check actions...');
    await page.screenshot({ path: 'breakout-options-popup.png' });
    console.log('Saved breakout-options-popup.png');

    // Click "Open All Rooms" / "Start Rooms"
    const modalBtns = await page.$$('button, .zm-btn, .wc-btn-primary');
    for (const mBtn of modalBtns) {
      const mText = await page.evaluate(el => el.innerText || el.textContent, mBtn);
      if (mText && (mText.toLowerCase().includes('open all') || mText.toLowerCase().includes('open rooms') || mText.toLowerCase().includes('start rooms'))) {
        console.log('🎉 Clicking "Open All Rooms" / "Start Rooms"...');
        await page.evaluate(el => el.click(), mBtn);
        await new Promise(r => setTimeout(r, 3000));
        break;
      }
    }

    // Capture final state
    await page.screenshot({ path: 'step5-final-state.png' });
    console.log('Saved step5-final-state.png');
  } else {
    console.log('❌ Breakout Rooms button not found on toolbar!');
  }

  await browser.close();
  console.log('✅ Cycle completed!');
}

openRoomsAccurate().catch(console.error);
