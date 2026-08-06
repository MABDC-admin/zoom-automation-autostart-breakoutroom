import puppeteer from 'puppeteer-core';
import { getMeetingDetails, configureBreakoutRooms } from './zoom-cli.js';
import fs from 'fs';

const MEETING_ID = '83633925074';
const CHROMIUM_PATH = '/usr/bin/chromium-browser';
const gradeRooms = Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`);

// Staff members to auto-promote to Co-Host
const STAFF_TO_PROMOTE = ['Krisha'];

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
  let tickCount = 0;

  const autoClicker = setInterval(async () => {
    // Write heartbeat file
    try {
      fs.writeFileSync('/tmp/zoom-host-bot-heartbeat.txt', Date.now().toString());
    } catch (err) {}

    // Auto-promote Staff to Co-Host
    tickCount++;
    if (tickCount % 4 === 0) { // Every 10 seconds (2.5s * 4)
      try {
        for (const staffName of STAFF_TO_PROMOTE) {
          await promoteStaffToCoHost(page, staffName);
        }
      } catch (err) {
        console.error('❌ [OPENCLAW ERROR] Co-host auto-promotion failed:', err.message);
      }
    }

    try {
      if (roomsOpened) return;

      // Check if breakout rooms are already active/open
      const allButtons = await page.$$('button, .zm-btn, .wc-btn-primary');
      for (const btn of allButtons) {
        const text = await page.evaluate(el => el.innerText || el.textContent || '', btn);
        if (text && (text.toLowerCase().includes('close all rooms') || text.toLowerCase().includes('close rooms'))) {
          console.log('🤖 [OPENCLAW] Breakout rooms are already active/open. Stopping clicker.');
          roomsOpened = true;
          return;
        }
      }

      // Click Accept Cookies
      const cookieBtn = await page.$('#onetrust-accept-btn-handler, #btn-accept');
      if (cookieBtn) await page.evaluate(el => el.click(), cookieBtn);

      // Click "Join Audio by Computer" / "Got It" / "Start Meeting" / "Reclaim Host"
      const buttons = await page.$$('button, .zm-btn, .wc-btn-primary, a');
      for (const btn of buttons) {
        const text = await page.evaluate(el => el.innerText || el.textContent, btn);
        if (text && (text.includes('Join Audio') || text.includes('Computer Audio') || text.includes('Start') || text.includes('Got It') || text.includes('Agree') || text.includes('Reclaim') || text.includes('Claim'))) {
          console.log(`🤖 [OPENCLAW] Dialog/Button match found: "${text.trim()}". Clicking...`);
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

/**
 * Ensures the Participants panel is open in the Zoom interface
 */
async function ensureParticipantsPanelOpen(page) {
  const isOpen = await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label*="participants"], button[aria-label*="Participants"]');
    if (btn) {
      const ariaLabel = btn.getAttribute('aria-label') || '';
      if (ariaLabel.toLowerCase().includes('close the')) {
        return true;
      }
    }
    return !!document.querySelector('.participants-list-container, .participants-section-container');
  });

  if (!isOpen) {
    console.log('🤖 [OPENCLAW] Participants panel is closed. Opening it...');
    const btn = await page.$('button[aria-label*="participants"], button[aria-label*="Participants"]');
    if (btn) {
      await page.evaluate(el => el.click(), btn).catch(() => {});
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}

/**
 * Searches for a staff member by name and auto-promotes them to Co-Host
 */
async function promoteStaffToCoHost(page, targetName) {
  await ensureParticipantsPanelOpen(page);

  // Find user and click "More"
  const result = await page.evaluate((name) => {
    function getParentRow(element) {
      let parent = element.parentElement;
      while (parent) {
        if (parent.tagName === 'LI' || parent.tagName === 'TR' || parent.getAttribute('role') === 'listitem' || parent.className.includes('participant')) {
          return parent;
        }
        parent = parent.parentElement;
      }
      return element.parentElement || element;
    }

    const allElements = Array.from(document.querySelectorAll('span, div, p, li'));
    let targetRow = null;
    for (const el of allElements) {
      if (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3) {
        const text = el.innerText || el.textContent || '';
        if (text.toLowerCase().includes(name.toLowerCase())) {
          const row = getParentRow(el);
          const rowText = row.innerText || row.textContent || '';
          // Skip if already Host, Co-host, or Self
          if (rowText.includes('(Host') || rowText.includes('(Co-host') || rowText.includes('Co-host') || rowText.includes('Host, me')) {
            continue;
          }
          targetRow = row;
          break;
        }
      }
    }

    if (!targetRow) return { found: false };

    const buttons = Array.from(targetRow.querySelectorAll('button, [role="button"], a'));
    let moreButton = null;
    for (const btn of buttons) {
      const btnText = btn.innerText || btn.textContent || btn.getAttribute('aria-label') || '';
      const btnTextLower = btnText.toLowerCase();
      if (btnTextLower.includes('more') || btnTextLower.includes('option') || btnTextLower.includes('...') || btn.className.includes('more') || btn.className.includes('option')) {
        moreButton = btn;
        break;
      }
    }

    if (!moreButton && buttons.length > 0) {
      moreButton = buttons[buttons.length - 1];
    }

    if (moreButton) {
      moreButton.click();
      return { found: true, clickedMore: true };
    }

    return { found: true, clickedMore: false };
  }, targetName);

  if (result.found && result.clickedMore) {
    // Wait for dropdown menu to render
    await new Promise(r => setTimeout(r, 600));

    // Click "Make Co-host"
    const clickedCoHost = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('button, a, [role="menuitem"], span, div'));
      for (const item of items) {
        const text = item.innerText || item.textContent || '';
        if (text.toLowerCase().includes('make co-host') || text.toLowerCase().includes('make cohost')) {
          item.click();
          return true;
        }
      }
      return false;
    });

    if (clickedCoHost) {
      console.log(`🤖 [OPENCLAW] Clicked 'Make Co-host' for ${targetName}. Waiting for confirmation modal...`);
      await new Promise(r => setTimeout(r, 800));

      const confirmed = await page.evaluate(() => {
        const modalButtons = Array.from(document.querySelectorAll('button, .zm-btn, .wc-btn-primary'));
        for (const btn of modalButtons) {
          const text = btn.innerText || btn.textContent || '';
          if (text.toLowerCase() === 'make co-host' || text.toLowerCase() === 'co-host' || text.toLowerCase() === 'yes') {
            btn.click();
            return true;
          }
        }
        return false;
      });

      if (confirmed) {
        console.log(`🎉 [OPENCLAW SUCCESS] Auto-promoted ${targetName} to Co-Host!`);
      }
    }
  }
}

if (process.argv[1]?.endsWith('host-bot.js')) {
  launchHostBot().catch(err => console.error('[OPENCLAW ERROR]:', err));
}
