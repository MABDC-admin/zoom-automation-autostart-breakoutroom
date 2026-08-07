import https from 'https';
import fs from 'fs';
import { exec } from 'child_process';

const TELEGRAM_TOKEN = '8848144316:AAFMAh03srCg1liivCMbqYJD7CJnfggUIq8';
const CONFIG_PATH = '/www/wwwroot/zoom-auto-starter/staff-names.json';
const CHAT_ID_PATH = '/www/wwwroot/zoom-auto-starter/telegram-chat-id.txt';

let offset = 0;

// Load registered Chat ID if exists
let savedChatId = null;
try {
  if (fs.existsSync(CHAT_ID_PATH)) {
    savedChatId = fs.readFileSync(CHAT_ID_PATH, 'utf8').trim();
  }
} catch (e) {}

function sendTelegramMessage(chatId, text) {
  const data = JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'Markdown' });
  const options = {
    hostname: 'api.telegram.org',
    port: 443,
    path: `/bot${TELEGRAM_TOKEN}/sendMessage`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  };
  const req = https.request(options, (res) => {
    let resp = '';
    res.on('data', (c) => resp += c);
    res.on('end', () => {
      console.log(`🤖 Telegram API response for Chat ${chatId}:`, resp);
    });
  });
  req.on('error', (err) => console.error('Telegram send error:', err.message));
  req.write(data);
  req.end();
}

function sendTelegramPhoto(chatId, photoPath, caption) {
  if (!fs.existsSync(photoPath)) {
    sendTelegramMessage(chatId, '❌ Screenshot file not found on server.');
    return;
  }

  const boundary = '----TelegramBotBoundary';
  const fileContent = fs.readFileSync(photoPath);
  const filename = photoPath.split('/').pop();
  
  const payloadHeader = 
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="caption"\r\n\r\n${caption || ''}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="photo"; filename="${filename}"\r\n` +
    `Content-Type: image/png\r\n\r\n`;
    
  const payloadFooter = `\r\n--${boundary}--\r\n`;
  
  const options = {
    hostname: 'api.telegram.org',
    port: 443,
    path: `/bot${TELEGRAM_TOKEN}/sendPhoto`,
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    }
  };

  const req = https.request(options, (res) => {
    res.on('data', () => {});
  });

  req.on('error', (err) => {
    console.error('Telegram sendPhoto error:', err.message);
    sendTelegramMessage(chatId, `❌ Failed to send screenshot: ${err.message}`);
  });

  req.write(Buffer.from(payloadHeader, 'utf-8'));
  req.write(fileContent);
  req.write(Buffer.from(payloadFooter, 'utf-8'));
  req.end();
}

async function handleIncomingMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text ? msg.text.trim() : '';
  console.log(`📩 Received Telegram message from Chat ${chatId}: "${text}"`);

  // Register Chat ID
  if (!savedChatId || savedChatId !== String(chatId)) {
    savedChatId = String(chatId);
    try {
      fs.writeFileSync(CHAT_ID_PATH, savedChatId);
    } catch (e) {}
  }

  if (text.startsWith('/start')) {
    const welcome = 
      `🤖 *Welcome to MABDC Zoom Meeting Controller Bot!*\n\n` +
      `Here are the available commands:\n` +
      `📌 */status* - Check Zoom bot process and meeting heartbeat.\n` +
      `📌 */participants* - View all active meeting participants and their roles.\n` +
      `📌 */list* - View all configured staff names for auto-promotion.\n` +
      `📌 */add <Name>* - Add a staff member to the promotion list dynamically.\n` +
      `📌 */remove <Name>* - Remove a staff member from the promotion list.\n` +
      `📌 */screenshot* - Trigger and retrieve a live screenshot of the meeting.\n` +
      `📌 */startmeeting* - Manually start the Zoom meeting with all automations.\n` +
      `📌 */restart* - Restart the Zoom meeting fresh.\n` +
      `📌 */end* - Terminate the active Zoom meeting.\n`;
    sendTelegramMessage(chatId, welcome);
    return;
  }

  if (text.startsWith('/status')) {
    let hostBotStatus = 'Offline 🔴';
    try {
      if (fs.existsSync('/tmp/zoom-host-bot-heartbeat.txt')) {
        const ts = parseInt(fs.readFileSync('/tmp/zoom-host-bot-heartbeat.txt', 'utf8').trim());
        const diff = Date.now() - ts;
        if (diff < 35000) {
          hostBotStatus = 'Active 🟢 (Heartbeat OK)';
        } else {
          hostBotStatus = `Stale 🟡 (Last heartbeat ${Math.round(diff / 1000)}s ago)`;
        }
      }
    } catch (e) {}

    exec('pm2 status zoom-scheduler', (err, stdout, stderr) => {
      const pm2Status = stdout.includes('online') ? 'Online 🟢' : 'Stopped 🔴';
      const statusText = 
        `📊 *MABDC Zoom Automation Status*\n\n` +
        `• *Host Bot Status:* ${hostBotStatus}\n` +
        `• *Meeting Scheduler Daemon:* ${pm2Status}\n` +
        `• *Meeting ID:* \`83633925074\``;
      sendTelegramMessage(chatId, statusText);
    });
    return;
  }

  if (text.startsWith('/list')) {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const list = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        const listText = `📋 *Configured Staff Names (${list.length}):*\n\n` + list.map((name, i) => `${i + 1}. ${name}`).join('\n');
        sendTelegramMessage(chatId, listText);
      } else {
        sendTelegramMessage(chatId, '📋 Staff names config file does not exist on server.');
      }
    } catch (e) {
      sendTelegramMessage(chatId, `❌ Failed to read list: ${e.message}`);
    }
    return;
  }

  if (text.startsWith('/add ')) {
    const nameToAdd = text.substring(5).trim();
    if (!nameToAdd) {
      sendTelegramMessage(chatId, '❌ Please specify a name to add. Example: `/add Dennis`');
      return;
    }

    try {
      let list = [];
      if (fs.existsSync(CONFIG_PATH)) {
        list = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      }
      if (list.includes(nameToAdd)) {
        sendTelegramMessage(chatId, `⚠️ "${nameToAdd}" is already on the promotion list.`);
        return;
      }
      list.push(nameToAdd);
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(list, null, 2));
      sendTelegramMessage(chatId, `✅ Added "${nameToAdd}" to auto-promotion list. The bot will pick it up on the next check!`);
    } catch (e) {
      sendTelegramMessage(chatId, `❌ Failed to add name: ${e.message}`);
    }
    return;
  }

  if (text.startsWith('/remove ')) {
    const nameToRemove = text.substring(8).trim();
    if (!nameToRemove) {
      sendTelegramMessage(chatId, '❌ Please specify a name to remove.');
      return;
    }

    try {
      if (fs.existsSync(CONFIG_PATH)) {
        let list = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        const originalLength = list.length;
        list = list.filter(name => name.toLowerCase() !== nameToRemove.toLowerCase());
        if (list.length === originalLength) {
          sendTelegramMessage(chatId, `⚠️ Name "${nameToRemove}" not found on list.`);
          return;
        }
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(list, null, 2));
        sendTelegramMessage(chatId, `✅ Removed "${nameToRemove}" from auto-promotion list.`);
      } else {
        sendTelegramMessage(chatId, '❌ Config file not found.');
      }
    } catch (e) {
      sendTelegramMessage(chatId, `❌ Failed to remove name: ${e.message}`);
    }
    return;
  }

  if (text.startsWith('/screenshot')) {
    sendTelegramMessage(chatId, '📸 Requesting screenshot from Host Bot... please wait.');
    try {
      fs.writeFileSync('/tmp/trigger-screenshot.txt', '1');
      setTimeout(() => {
        sendTelegramPhoto(chatId, '/www/wwwroot/zoom-auto-starter/zoom-live-screenshot.png', 'Live Meeting Screenshot');
      }, 4000);
    } catch (e) {
      sendTelegramMessage(chatId, `❌ Failed to trigger screenshot: ${e.message}`);
    }
    return;
  }

  if (text.startsWith('/restart')) {
    sendTelegramMessage(chatId, '🔄 Restarting Zoom meeting session fresh... please wait.');
    exec('cd /www/wwwroot/zoom-auto-starter && node auto-scheduler.js --end-now && pkill -f chromium && node auto-scheduler.js --start-now', (err, stdout, stderr) => {
      if (err) {
        sendTelegramMessage(chatId, `❌ Failed to restart meeting: ${err.message}`);
      } else {
        sendTelegramMessage(chatId, '✅ Meeting restarted successfully! Host Bot is entering room.');
      }
    });
    return;
  }

  if (text.startsWith('/end')) {
    sendTelegramMessage(chatId, '🚪 Ending Zoom meeting session now...');
    exec('cd /www/wwwroot/zoom-auto-starter && node auto-scheduler.js --end-now && pkill -f chromium', (err, stdout, stderr) => {
      if (err) {
        sendTelegramMessage(chatId, `❌ Failed to end meeting: ${err.message}`);
      } else {
        sendTelegramMessage(chatId, '✅ Meeting ended successfully and browser closed.');
      }
    });
    return;
  }

  if (text.startsWith('/startmeeting')) {
    sendTelegramMessage(chatId, '▶ Starting Zoom meeting session dynamically... please wait.');
    exec('cd /www/wwwroot/zoom-auto-starter && node auto-scheduler.js --start-now', (err, stdout, stderr) => {
      if (err) {
        sendTelegramMessage(chatId, `❌ Failed to start meeting: ${err.message}`);
      } else {
        sendTelegramMessage(chatId, '✅ Meeting started successfully! Host Bot is entering room.');
      }
    });
    return;
  }

  if (text.startsWith('/participants')) {
    const pPath = '/tmp/zoom-active-participants.json';
    try {
      if (fs.existsSync(pPath)) {
        const participants = JSON.parse(fs.readFileSync(pPath, 'utf8'));
        if (participants.length === 0) {
          sendTelegramMessage(chatId, '👥 No active participants found in the meeting.');
          return;
        }
        const hosts = participants.filter(p => p.role === 'Host');
        const coHosts = participants.filter(p => p.role === 'Co-Host');
        const regular = participants.filter(p => p.role === 'Participant');

        let respText = `👥 *Active Meeting Participants (${participants.length}):*\n\n`;
        if (hosts.length > 0) {
          respText += `👑 *Host:*\n` + hosts.map(p => `• ${p.name}`).join('\n') + `\n\n`;
        }
        if (coHosts.length > 0) {
          respText += `🛡️ *Co-Hosts:*\n` + coHosts.map(p => `• ${p.name}`).join('\n') + `\n\n`;
        }
        if (regular.length > 0) {
          respText += `👤 *Participants:*\n` + regular.map(p => `• ${p.name}`).join('\n') + `\n`;
        }
        sendTelegramMessage(chatId, respText);
      } else {
        sendTelegramMessage(chatId, '👥 Active participants record file does not exist on server.');
      }
    } catch (e) {
      sendTelegramMessage(chatId, `❌ Failed to read participants: ${e.message}`);
    }
    return;
  }
}

function pollUpdates() {
  https.get(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getUpdates?offset=${offset}&timeout=30`, (res) => {
    let rawData = '';
    res.on('data', (chunk) => { rawData += chunk; });
    res.on('end', () => {
      try {
        const json = JSON.parse(rawData);
        if (json.ok && json.result.length > 0) {
          for (const update of json.result) {
            offset = update.update_id + 1;
            if (update.message && update.message.text) {
              handleIncomingMessage(update.message);
            }
          }
        }
      } catch (e) {}
      setTimeout(pollUpdates, 1000);
    });
  }).on('error', (err) => {
    setTimeout(pollUpdates, 5000);
  });
}

// Start Long Polling
console.log('🤖 Telegram Controller Bot polling active...');
pollUpdates();
