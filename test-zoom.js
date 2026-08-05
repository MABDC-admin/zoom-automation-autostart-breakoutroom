import fs from 'fs';
import path from 'path';

// Read .env file manually
const envPath = path.resolve('.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const [key, ...val] = line.split('=');
  if (key && val) {
    envVars[key.trim()] = val.join('=').trim();
  }
});

const { ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET } = envVars;

async function testZoom() {
  console.log('Authenticating with Zoom API...');
  const authHeader = Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString('base64');
  
  try {
    const tokenResponse = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${ZOOM_ACCOUNT_ID}`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authHeader}`
      }
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('❌ Failed to obtain access token:');
      console.error(tokenData);
      return;
    }

    console.log('✅ Successfully authenticated!');
    console.log('Token Type:', tokenData.token_type);
    console.log('Expires In:', tokenData.expires_in, 'seconds');

    const accessToken = tokenData.access_token;

    // Test API call to get current user details
    console.log('\nFetching Zoom user details (users/me)...');
    const userResponse = await fetch('https://api.zoom.us/v2/users/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const userData = await userResponse.json();

    if (!userResponse.ok) {
      console.error('❌ User details request failed:');
      console.error(userData);
      return;
    }

    console.log('✅ User Info Retrieved:');
    console.log(`- Name: ${userData.first_name || ''} ${userData.last_name || ''}`);
    console.log(`- Email: ${userData.email}`);
    console.log(`- Account ID: ${userData.account_id}`);
    console.log(`- User ID: ${userData.id}`);
    console.log(`- Account Type: ${userData.type}`);

  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

testZoom();
