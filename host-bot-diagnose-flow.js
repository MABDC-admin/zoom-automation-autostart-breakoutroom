import puppeteer from 'puppeteer-core';
import { getMeetingDetails, configureBreakoutRooms } from './zoom-cli.js';

const CHROMIUM_PATH = '/usr/bin/chromium-browser';
const MEETING_ID = '83633925074';
const gradeRooms = Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`);

async function diagnoseZoomFlow() {
  console.log('1. Configuring breakout rooms via API...');
  await configureBreakoutRooms(MEETING_ID, gradeRooms);

  console.log('2. Fetching Host Start URL...');
  const details = await getMeetingDetails(MEETING_ID);
  const startUrl = details.start_url;

  // Direct Web Client Host URL
  let targetUrl = startUrl;
  if (startUrl.includes('/s/')) {
    targetUrl = startUrl.replace('/s/', '/wc/').replace('?', '/start?');
  }

  console.log('3. Launching Headless Chromium...');
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

  console.log('4. Navigating to start URL...');
  await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 6000));
  await page.screenshot({ path: 'step1-landing.png' });
  console.log('Saved step1-landing.png');

  // Check if Name input field is there
  try {
    const nameInput = await page.$('#input-for-name, input[name="inputname"], .input-name, input[type="text"]');
    if (nameInput) {
      console.log('Typing name "MABDC Host"...');
      await nameInput.type('MABDC Host');
      const joinBtn = await page.$('.wc-btn-primary, button[type="submit"]');
      if (joinBtn) await joinBtn.click();
      await new Promise(r => setTimeout(r, 6000));
    }
  } catch (e) {
    console.log('Name input block error:', e.message);
  }

  await page.screenshot({ path: 'step2-joined.png' });
  console.log('Saved step2-joined.png');

  // Dismiss cookie accept & audio join
  try {
    const cookieBtn = await page.$('#onetrust-accept-btn-handler, #btn-accept');
    if (cookieBtn) await cookieBtn.click();

    const allButtons = await page.$$('button, .zm-btn, .wc-btn-primary');
    for (const btn of allButtons) {
      const text = await page.evaluate(el => el.innerText || el.textContent, btn);
      if (text && (text.includes('Join Audio') || text.includes('Computer Audio') || text.includes('Got It') || text.includes('Agree'))) {
        await btn.click().catch(() => {});
      }
    }
  } catch (e) {}

  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: 'step3-ready.png' });
  console.log('Saved step3-ready.png');

  // Look for Breakout Rooms button
  let breakoutClicked = false;
  try {
    const btns = await page.$$('button, div[role="button"], a');
    for (const btn of btns) {
      const text = await page.evaluate(el => el.innerText || el.textContent || el.getAttribute('aria-label') || '', btn);
      if (text && text.toLowerCase().includes('breakout')) {
        console.log(`Clicking Breakout Rooms Button ("${text.trim()}")...`);
        await btn.click();
        breakoutClicked = true;
        break;
      }
    }
  } catch (e) {
    console.log('Error searching breakouts button:', e.message);
  }

  if (breakoutClicked) {
    await new Promise(r => setTimeout(r, 3000));
    await page.screenshot({ path: 'step4-breakout-modal.png' });
    console.log('Saved step4-breakout-modal.png');

    // Click "Open All Rooms"
    try {
      const modalBtns = await page.$$('button, .zm-btn, .wc-btn-primary');
      for (const mBtn of modalBtns) {
        const mText = await page.evaluate(el => el.innerText || el.textContent, mBtn);
        if (mText && (mText.toLowerCase().includes('open all') || mText.toLowerCase().includes('open rooms') || mText.toLowerCase().includes('start rooms'))) {
          console.log('Clicking Open All Rooms...');
          await mBtn.click();
          await new Promise(r => setTimeout(r, 3000));
          break;
        }
      }
    } catch (e) {
      console.log('Error clicking Open All Rooms:', e.message);
    }

    await page.screenshot({ path: 'step5-rooms-active.png' });
    console.log('Saved step5-rooms-active.png');
  }

  await browser.close();
  console.log('✅ Flow Diagnostics Complete!');
}

diagnoseZoomFlow().catch(console.error);
