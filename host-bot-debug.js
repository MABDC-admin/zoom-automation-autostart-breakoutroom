import puppeteer from 'puppeteer-core';
import { getMeetingDetails } from './zoom-cli.js';

const CHROMIUM_PATH = '/usr/bin/chromium-browser';
const MEETING_ID = '83633925074';

async function debugHostBot() {
  console.log('[DEBUG-HOST] Fetching Host Start URL with ZAK token...');
  const details = await getMeetingDetails(MEETING_ID);
  const startUrl = details.start_url;

  console.log(`[DEBUG-HOST] Start URL: ${startUrl.substring(0, 80)}...`);

  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  console.log('[DEBUG-HOST] Navigating to Host Start URL in Headless Chromium...');
  await page.goto(startUrl, { waitUntil: 'networkidle2', timeout: 60000 }).catch(e => console.log('Navigation timeout/idle:', e.message));

  const currentUrl = page.url();
  const pageTitle = await page.title();
  console.log(`\n========================================================`);
  console.log(`📌 Current Page URL: ${currentUrl}`);
  console.log(`📌 Page Title: ${pageTitle}`);
  console.log(`========================================================\n`);

  const pageText = await page.evaluate(() => document.body.innerText || '');
  console.log('📄 Page Body Text Snippet:\n', pageText.substring(0, 500));

  await browser.close();
}

debugHostBot().catch(console.error);
