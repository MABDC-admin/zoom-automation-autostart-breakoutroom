import puppeteer from 'puppeteer-core';
import { getMeetingDetails, configureBreakoutRooms } from './zoom-cli.js';
import fs from 'fs';

const MEETING_ID = '83633925074';
const CHROMIUM_PATH = '/usr/bin/chromium-browser';
const gradeRooms = Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`);

// Staff members to auto-promote to Co-Host
const STAFF_TO_PROMOTE = [
  'Krisha',
  'Myranel D. Plaza',
  'Aimee June A. Alolor',
  'Revelyn A. Galang',
  'Michelle R. Aserios',
  'Krisha Dwine R. Riotoc',
  'Julie Fe L. Benedicto',
  'Jecille F. Buizon',
  'Jayson B. Cuello',
  'Jan Alfred P. Macalintal',
  'Jade Emerald A. Amurao',
  'Homer S. Macrohon',
  'Glorie Ann I. Espinosa',
  'Eulogio E. Dadula',
  'Princess Jesa D. Tagulao',
  'Mark John J. Ramirez',
  'Christine Mari M. Jonson',
  'Arianne Kaye N. Sager',
  'Renz Vincent S. Aclan'
];

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
  const alreadyPromoted = new Set();

  const autoClicker = setInterval(async () => {
    // Write heartbeat file
    try {
      fs.writeFileSync('/tmp/zoom-host-bot-heartbeat.txt', Date.now().toString());
    } catch (err) {}

    // IPC Screenshot Trigger
    try {
      if (fs.existsSync('/tmp/trigger-screenshot.txt')) {
        console.log('📸 [IPC] Screenshot trigger detected. Capturing screenshot...');
        await page.screenshot({ path: '/www/wwwroot/zoom-auto-starter/zoom-live-screenshot.png' });
        fs.unlinkSync('/tmp/trigger-screenshot.txt');
        console.log('📸 [IPC] Screenshot saved successfully as zoom-live-screenshot.png');
      }
    } catch (e) {
      console.error('❌ [IPC ERROR] Failed to save trigger screenshot:', e.message);
    }

    tickCount++;

    // Scan Chat for co-host requests (every 5 seconds)
    if (tickCount % 2 === 0) {
      try {
        await checkChatAndPromote(page, alreadyPromoted);
      } catch (err) {
        console.error('❌ [OPENCLAW ERROR] Chat co-host trigger check failed:', err.message);
      }
    }

    // Auto-promote Staff from config (every 10 seconds)
    if (tickCount % 4 === 0) {
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
    function querySelectorAllShadow(selector, root = document) {
      const elements = Array.from(root.querySelectorAll(selector));
      const children = Array.from(root.querySelectorAll('*'));
      for (const child of children) {
        if (child.shadowRoot) {
          elements.push(...querySelectorAllShadow(selector, child.shadowRoot));
        }
      }
      return elements;
    }

    const containers = querySelectorAllShadow('.participants-list-container, .participants-section-container, .participants-wrap');
    for (const container of containers) {
      if (container.getBoundingClientRect().width > 0) {
        return true;
      }
    }
    return false;
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
  console.log(`🤖 [OPENCLAW] Auto-promotion check triggered for: "${targetName}"`);
  await ensureParticipantsPanelOpen(page);

  // Find user, hover to reveal buttons, and click "More"
  const result = await page.evaluate(async (name) => {
    function querySelectorAllShadow(selector, root = document) {
      const elements = Array.from(root.querySelectorAll(selector));
      const children = Array.from(root.querySelectorAll('*'));
      for (const child of children) {
        if (child.shadowRoot) {
          elements.push(...querySelectorAllShadow(selector, child.shadowRoot));
        }
      }
      return elements;
    }

    function matchName(candidateName, targetName) {
      const candidateLower = candidateName.toLowerCase();
      const targetLower = targetName.toLowerCase();
      
      if (candidateLower.includes(targetLower) || targetLower.includes(candidateLower)) {
        return true;
      }
      
      const targetParts = targetLower.split(/\s+/).filter(part => part.length > 1 && !part.endsWith('.'));
      if (targetParts.length === 0) return false;
      
      return targetParts.every(part => candidateLower.includes(part));
    }

    const nameLower = name.toLowerCase();
    const candidates = querySelectorAllShadow('.participants-item__item-layout, .participants-item, li, tr, .participant-list-item, div');
    let targetRow = null;

    for (const row of candidates) {
      const nameSpan = row.querySelector && row.querySelector('.participants-item__display-name');
      if (nameSpan) {
        const rowText = nameSpan.innerText || nameSpan.textContent || '';
        const rowTextLower = rowText.toLowerCase();

        if (matchName(rowTextLower, nameLower)) {
          const parentRow = nameSpan.closest('.participants-item__item-layout, .participants-item, .participants-item-position, li');
          const parentText = parentRow ? (parentRow.innerText || parentRow.textContent || '') : '';
          
          if (parentText.includes('(Host') || parentText.includes('(Co-host') || parentText.includes('Co-host') || parentText.includes('Host, me')) {
            return { status: 'already_promoted', text: parentText };
          }

          targetRow = parentRow || row;
          break;
        }
      }
    }

    if (!targetRow) return { status: 'user_not_found' };

    // Trigger hover events to reveal buttons in the DOM
    targetRow.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    targetRow.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

    // Wait 400ms for React to render buttons
    await new Promise(r => setTimeout(r, 400));

    const buttons = Array.from(targetRow.querySelectorAll('button, [role="button"], a'));
    let moreButton = null;
    for (const btn of buttons) {
      const btnText = btn.innerText || btn.textContent || btn.getAttribute('aria-label') || '';
      const btnTextLower = btnText.toLowerCase();
      if (btnTextLower.includes('more') || btnTextLower.includes('option') || btnTextLower.includes('...')) {
        moreButton = btn;
        break;
      }
    }

    if (!moreButton && buttons.length > 0) {
      moreButton = buttons[buttons.length - 1];
    }

    if (moreButton) {
      moreButton.click();
      return { status: 'clicked_more' };
    }

    return { 
      status: 'more_button_not_found', 
      buttonCount: buttons.length, 
      buttonsText: buttons.map(b => b.innerText || b.textContent || b.getAttribute('aria-label') || '').join(', ') 
    };
  }, targetName);

  console.log(`🤖 [OPENCLAW] Step 1 result for ${targetName}: ${result.status} | Buttons Count: ${result.buttonCount} | Buttons: [${result.buttonsText || ''}]`);

  if (result.status === 'already_promoted') {
    return true;
  }

  if (result.status === 'clicked_more') {
    // Wait for dropdown menu to render
    await new Promise(r => setTimeout(r, 800));

    // Find and click "Make Co-host" natively
    const coHostOption = await page.evaluateHandle(() => {
      function querySelectorAllShadow(selector, root = document) {
        const elements = Array.from(root.querySelectorAll(selector));
        const children = Array.from(root.querySelectorAll('*'));
        for (const child of children) {
          if (child.shadowRoot) {
            elements.push(...querySelectorAllShadow(selector, child.shadowRoot));
          }
        }
        return elements;
      }

      const items = querySelectorAllShadow('button, a, [role="menuitem"]');
      for (const item of items) {
        const text = item.innerText || item.textContent || '';
        if (text.toLowerCase().includes('make co-host') || text.toLowerCase().includes('make cohost')) {
          if (item.getBoundingClientRect().width > 0) {
            return item;
          }
        }
      }
      return null;
    });

    const optionEl = coHostOption.asElement();
    if (optionEl) {
      const optTag = await (await coHostOption.getProperty('tagName')).jsonValue();
      const optClass = await (await coHostOption.getProperty('className')).jsonValue();
      const optHTML = await (await coHostOption.getProperty('outerHTML')).jsonValue();
      console.log(`🤖 [OPENCLAW] Found dropdown option: Tag=${optTag}, Class=${optClass}, HTML=${optHTML.substring(0, 150)}`);

      console.log(`🤖 [OPENCLAW] Clicking option via MouseEvent dispatch...`);
      await page.evaluate(el => {
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      }, optionEl);
      
      // Wait for modal to render
      await new Promise(r => setTimeout(r, 1000));

      // Find and click "Yes" button natively
      const yesButton = await page.evaluateHandle(() => {
        function querySelectorAllShadow(selector, root = document) {
          const elements = Array.from(root.querySelectorAll(selector));
          const children = Array.from(root.querySelectorAll('*'));
          for (const child of children) {
            if (child.shadowRoot) {
              elements.push(...querySelectorAllShadow(selector, child.shadowRoot));
            }
          }
          return elements;
        }

        const modalButtons = querySelectorAllShadow('button, a, [role="button"], .zm-btn, .wc-btn-primary');
        for (const btn of modalButtons) {
          const text = btn.innerText || btn.textContent || '';
          if (text.toLowerCase().trim() === 'yes' || text.toLowerCase().trim() === 'co-host') {
            if (btn.getBoundingClientRect().width > 0) {
              return btn;
            }
          }
        }
        return null;
      });

      const yesEl = yesButton.asElement();
      if (yesEl) {
        const yesTag = await (await yesButton.getProperty('tagName')).jsonValue();
        const yesClass = await (await yesButton.getProperty('className')).jsonValue();
        const yesHTML = await (await yesButton.getProperty('outerHTML')).jsonValue();
        console.log(`🤖 [OPENCLAW] Found 'Yes' button: Tag=${yesTag}, Class=${yesClass}, HTML=${yesHTML.substring(0, 150)}`);

        console.log(`🤖 [OPENCLAW] Clicking 'Yes' via MouseEvent dispatch...`);
        await page.evaluate(el => {
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
          el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        }, yesEl);
        await new Promise(r => setTimeout(r, 1500));
        console.log(`🎉 [OPENCLAW SUCCESS] Auto-promoted ${targetName} to Co-Host natively!`);
        return true;
      } else {
        console.log(`❌ [OPENCLAW ERROR] Yes button not found in modal natively for ${targetName}`);
      }
    } else {
      console.log(`❌ [OPENCLAW ERROR] 'Make Co-host' option not found in dropdown natively for ${targetName}`);
    }
  }

  return false;
}

/**
 * Automatically opens the Zoom chat panel if it is currently closed
 */
async function ensureChatPanelOpen(page) {
  const isOpen = await page.evaluate(() => {
    function querySelectorAllShadow(selector, root = document) {
      const elements = Array.from(root.querySelectorAll(selector));
      const children = Array.from(root.querySelectorAll('*'));
      for (const child of children) {
        if (child.shadowRoot) {
          elements.push(...querySelectorAllShadow(selector, child.shadowRoot));
        }
      }
      return elements;
    }

    const containers = querySelectorAllShadow('.chat-container, .chat-wrap, .chat-box, #chat-list-content, .chat-content');
    for (const container of containers) {
      if (container.getBoundingClientRect().width > 0) {
        return true;
      }
    }
    return false;
  });

  if (!isOpen) {
    console.log('🤖 [OPENCLAW] Chat panel is closed. Opening it...');
    const btn = await page.$('button[aria-label*="chat"], button[aria-label*="Chat"]');
    if (btn) {
      await page.evaluate(el => el.click(), btn).catch(() => {});
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}

/**
 * Returns a list of all active participant names inside the meeting
 */
async function getParticipantNames(page) {
  return await page.evaluate(() => {
    function querySelectorAllShadow(selector, root = document) {
      const elements = Array.from(root.querySelectorAll(selector));
      const children = Array.from(root.querySelectorAll('*'));
      for (const child of children) {
        if (child.shadowRoot) {
          elements.push(...querySelectorAllShadow(selector, child.shadowRoot));
        }
      }
      return elements;
    }

    const nameElements = querySelectorAllShadow('.participants-item__display-name');
    return nameElements.map(el => el.innerText || el.textContent || '').filter(name => name.trim().length > 0);
  });
}

/**
 * Scans chat messages for the co-host request keyword, resolves senders, and promotes them
 */
async function checkChatAndPromote(page, alreadyPromoted) {
  await ensureChatPanelOpen(page);

  const participantNames = await getParticipantNames(page);
  if (participantNames.length === 0) return;

  const promotionsToRun = await page.evaluate((names) => {
    function querySelectorAllShadow(selector, root = document) {
      const elements = Array.from(root.querySelectorAll(selector));
      const children = Array.from(root.querySelectorAll('*'));
      for (const child of children) {
        if (child.shadowRoot) {
          elements.push(...querySelectorAllShadow(selector, child.shadowRoot));
        }
      }
      return elements;
    }

    const toPromote = [];
    const allElements = querySelectorAllShadow('*');

    for (const el of allElements) {
      const children = Array.from(el.querySelectorAll('*'));
      if (children.length === 0) {
        const text = el.innerText || el.textContent || '';
        const textLower = text.toLowerCase();

        if (textLower.includes('co-host') || textLower.includes('cohost')) {
          let parent = el.parentElement;
          let depth = 0;
          let matchedSender = null;

          while (parent && depth < 4) {
            const parentText = parent.innerText || parent.textContent || '';
            for (const name of names) {
              if (parentText.includes(name)) {
                matchedSender = name;
                break;
              }
            }
            if (matchedSender) break;
            parent = parent.parentElement;
            depth++;
          }

          if (matchedSender && !toPromote.includes(matchedSender)) {
            toPromote.push(matchedSender);
          }
        }
      }
    }

    return toPromote;
  }, participantNames);

  for (const sender of promotionsToRun) {
    if (alreadyPromoted.has(sender)) continue;
    if (sender.toLowerCase().includes('host') || sender.toLowerCase().includes('mabdc')) continue;

    console.log(`🤖 [OPENCLAW] Chat trigger detected: "${sender}" requested co-host. Auto-promoting...`);
    await promoteStaffToCoHost(page, sender);
    alreadyPromoted.add(sender);
  }
}

if (process.argv[1]?.endsWith('host-bot.js')) {
  launchHostBot().catch(err => console.error('[OPENCLAW ERROR]:', err));
}
