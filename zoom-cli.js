import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import jsrsasign from 'jsrsasign';

dotenv.config();

const { kjur } = jsrsasign;

let cachedAccessToken = null;
let tokenExpiresAt = 0;

/**
 * Obtain Server-to-Server OAuth Access Token from Zoom
 */
export async function getAccessToken() {
  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;

  if (!accountId || !clientId || !clientSecret) {
    throw new Error('Missing Zoom credentials in environment variables (ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET).');
  }

  // Return cached token if valid (buffer of 60 seconds)
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedAccessToken;
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Failed to fetch Zoom Access Token: ${data.reason || data.error || JSON.stringify(data)}`);
  }

  cachedAccessToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in * 1000);
  return cachedAccessToken;
}

/**
 * Generate Zoom Web SDK Signature
 */
export function generateSDKSignature(meetingNumber, role = 0) {
  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;

  const iat = Math.floor(Date.now() / 1000) - 30;
  const exp = iat + 60 * 60 * 2;

  const oHeader = { alg: 'HS256', typ: 'JWT' };
  const oPayload = {
    sdkKey: clientId,
    mn: meetingNumber,
    role: role,
    iat: iat,
    exp: exp,
    appKey: clientId,
    tokenExp: exp
  };

  const sHeader = JSON.stringify(oHeader);
  const sPayload = JSON.stringify(oPayload);
  return kjur.jws.JWS.sign('HS256', sHeader, sPayload, clientSecret);
}

/**
 * Get User Profile (Host info)
 */
export async function getUserProfile() {
  const token = await getAccessToken();
  const res = await fetch('https://api.zoom.us/v2/users/me', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || JSON.stringify(data));
  return data;
}

/**
 * List meetings for the current account
 */
export async function listMeetings(userId = 'me') {
  const token = await getAccessToken();
  const res = await fetch(`https://api.zoom.us/v2/users/${userId}/meetings?type=scheduled&page_size=30`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || JSON.stringify(data));
  return data.meetings || [];
}

/**
 * Get specific meeting details including start_url with host ZAK
 */
export async function getMeetingDetails(meetingId) {
  const token = await getAccessToken();
  const res = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || JSON.stringify(data));
  return data;
}

/**
 * Update meeting settings and breakout rooms
 */
export async function updateMeeting(meetingId, updatePayload) {
  const token = await getAccessToken();
  const res = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updatePayload)
  });

  if (res.status === 204 || res.ok) {
    return { success: true, meetingId };
  }
  const data = await res.json().catch(() => ({}));
  throw new Error(data.message || JSON.stringify(data));
}

/**
 * End an active Zoom meeting
 */
export async function endMeeting(meetingId) {
  const token = await getAccessToken();
  const res = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}/status`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action: 'end' })
  });

  if (res.status === 204 || res.ok) {
    return { success: true, meetingId };
  }
  const data = await res.json().catch(() => ({}));
  throw new Error(data.message || JSON.stringify(data));
}

/**
 * Configure breakout rooms for a meeting with allow_option_choose_room = true
 */
export async function configureBreakoutRooms(meetingId, rooms) {
  const breakoutRoomsData = rooms.map(name => ({
    name: typeof name === 'string' ? name : name.name,
    participants: name.participants || []
  }));

  const payload = {
    settings: {
      breakout_room: {
        enable: true,
        allow_option_choose_room: true,
        rooms: breakoutRoomsData
      }
    }
  };

  return await updateMeeting(meetingId, payload);
}

/**
 * Create a new Zoom Meeting
 */
export async function createMeeting({ topic, startTime, duration = 30, agenda = '', userId = 'me' }) {
  const token = await getAccessToken();
  const payload = {
    topic: topic || 'New Zoom Meeting',
    type: 2, // Scheduled meeting
    start_time: startTime || new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    duration: duration,
    agenda: agenda,
    settings: {
      host_video: true,
      participant_video: true,
      join_before_host: true,
      mute_upon_entry: false,
      auto_recording: 'none',
      breakout_room: {
        enable: true,
        allow_option_choose_room: true
      }
    }
  };

  const res = await fetch(`https://api.zoom.us/v2/users/${userId}/meetings`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || JSON.stringify(data));
  return data;
}

// CLI handler if run directly
if (process.argv[1]?.endsWith('zoom-cli.js')) {
  const command = process.argv[2] || 'test';
  const meetingId = process.argv[3] || '83633925074';
  
  (async () => {
    try {
      if (command === 'token') {
        const token = await getAccessToken();
        console.log('AccessToken:', token);
      } else if (command === 'user') {
        const user = await getUserProfile();
        console.log('UserProfile:', user);
      } else if (command === 'details') {
        const details = await getMeetingDetails(meetingId);
        console.log('Meeting Details:', details);
      } else if (command === 'breakouts') {
        const rooms = Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`);
        const result = await configureBreakoutRooms(meetingId, rooms);
        console.log('Breakout Rooms Configured:', result);
      }
    } catch (err) {
      console.error('Error:', err.message);
    }
  })();
}
