import puppeteer from 'puppeteer-core';
import { getMeetingDetails } from './zoom-cli.js';

const CHROMIUM_PATH = '/usr/bin/chromium-browser';
const MEETING_ID = '83633925074';

async function takeDiagnosticScreenshot() {
  console.log('[SCREENSHOT] Fetching Host Start URL...');
  const details = await getMeetingDetails(MEETING_ID);
  const startUrl = details.start_url;

  // Direct Web Client Host start URL
  let targetUrl = startUrl;
  if (startUrl.includes('/s/')) {
    targetUrl = startUrl.replace('/s/', '/wc/').replace('?', '/start?');
  }

  console.log(`[SCREENSHOT] Target URL: ${targetUrl.substring(0, 85)}...`);

  console.log('[SCREENSHOT] Launching Headless Chromium...');
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
  await page.setViewport({ width: 1280, height: 800 });

  console.log('[SCREENSHOT] Navigating to target Host URL...');
  await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 8000));

  // Fill Name if input field is there
  try {
    const nameInput = await page.$('#input-for-name, input[name="inputname"], .input-name, input[type="text"]');
    if (nameInput) {
      console.log('[SCREENSHOT] Name input found. Typing "MABDC Host"...');
      await nameInput.type('MABDC Host');
      const joinBtn = await page.$('.wc-btn-primary, button[type="submit"]');
      if (joinBtn) {
        await joinBtn.click();
        console.log('Clicked submit name button.');
        await new Promise(r => setTimeout(r, 6000));
      }
    }
  } catch (e) {
    console.log('Name input block error:', e.message);
  }

  // Take the screenshot
  console.log('[SCREENSHOT] Capturing screen state...');
  await page.screenshot({ path: 'zoom-live-screenshot.png' });
  console.log('✅ Screenshot saved as zoom-live-screenshot.png!');

  await browser.close();
}

takeDiagnosticScreenshot().catch(console.error);
