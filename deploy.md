# Cloud Server Deployment Guide: Zoom Auto-Starter & OpenClaw Agent

This guide outlines how to deploy the automated Zoom host starter and OpenClaw AI agent to an Ubuntu/Linux Cloud Server (AWS EC2, DigitalOcean, VPS) or Docker container.

---

## 1. Prerequisites on Server
Ensure Node.js v18+ and Git are installed on your Linux server:
```bash
sudo apt update && sudo apt install -y nodejs npm git
```

---

## 2. Clone / Copy Application Code
Copy the project folder to your server:
```bash
git clone <your-repo-url> /opt/zoom-antigravity
cd /opt/zoom-antigravity
```

Set up your production `.env` file:
```env
ZOOM_ACCOUNT_ID=3pWXxmYKTZm-dG9pX-5K8g
ZOOM_CLIENT_ID=wgmb500TZS_s9DRJDIbpQ
ZOOM_CLIENT_SECRET=BIqyjoT2nt6lTE3uSbJNk8Pvez7NtVQl
```

---

## 3. Install Process Manager (PM2)
Use PM2 to run the dashboard server and auto-starter as background daemons that automatically restart on reboot:
```bash
sudo npm install -g pm2
pm2 start server.js --name "zoom-dashboard"
pm2 save
pm2 startup
```

---

## 4. Run Meeting Auto-Starter Daemon
To automatically start the meeting host session and configure breakout rooms:
```bash
# Configure Breakout Rooms for MABDC Meeting
node configure-breakouts.js

# Generate Host Start URL
node auto-start-host.js
```

---

## 5. Install & Run OpenClaw Agent
Install the OpenClaw CLI and Zoom meetings plugin:
```bash
npm install -g openclaw
openclaw plugins install @openclaw/zoom-meetings

# Start OpenClaw with configuration
openclaw start --config openclaw-config.json
```

---

## 6. Docker Deployment (Optional)
Build and run using Docker:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```
Run container:
```bash
docker build -t zoom-auto-starter .
docker run -d -p 3000:3000 --env-file .env zoom-auto-starter
```
