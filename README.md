# 🎮 SA-MP & Open.MP All-In-One Discord Bot
### 📡 Activity Monitor • 🎵 Music System • 🎫 Support Tickets • 🏢 Custom Branding

> **A 100% plug-and-play, sellable, and reusable Discord bot for SA-MP & Open.MP servers, clans, gangs, and factions.**  
> **No programming knowledge required** — Everything is fully configurable directly through Discord slash commands!

---

## 📑 Table of Contents

1. [✨ Bot Features](#-features)
2. [⚡ 5-Minute Quick Setup](#-5-minute-quick-setup)
   - [Step 1: Get Discord Bot Credentials](#step-1-get-discord-bot-credentials)
   - [Step 2: Invite the Bot to Your Server](#step-2-invite-the-bot-to-your-server)
   - [Step 3: Hosting Options (PC, VPS, Termux, Free Hosting)](#step-3-choose-your-hosting)
3. [🎮 Setup Directly Inside Discord](#-setup-directly-inside-discord-no-code-needed)
   - [Connect Your SA-MP Server (`/server-config`)](#1-connect-your-sa-mp-server)
   - [Customize Your Organization Branding (`/org-config`)](#2-customize-your-organization-branding)
   - [Deploy Live Dashboard (`/dashboard`)](#3-deploy-the-live-activity-dashboard)
   - [Add Members & Officers (`/add-member`)](#4-add-members-to-track)
   - [Set Up Support Tickets (`/ticket-setup`)](#5-setup-support-tickets)
   - [Use the Music System (`/play`, `/247`)](#6-play-music--247-mode)
4. [📋 Complete Command Reference](#-complete-command-reference)
5. [❓ FAQ & Troubleshooting](#-faq--troubleshooting)

---

## ✨ Features

* **📡 SA-MP / Open.MP Live Activity Monitor**:
  * Real-time query directly over UDP (No RCON password or server plugins needed).
  * Tracks online status, session durations, daily/weekly/monthly play time, and lifetime totals.
  * **Midnight Splitting**: Accurately accounts for sessions spanning past midnight.
  * **Network Jitter Protection**: Brief lag or query timeouts will not prematurely reset active sessions.
  * **Automatic Restart Recovery**: Keeps track of open sessions even after bot reboot.

* **🏢 100% Configurable Branding**:
  * Adaptable for any faction: **Police (PD), Medics (EMS), FBI, Mafia, Gangs, Military, or Clan communities**.
  * Change organization name, member titles ("Officer", "Agent", "Member"), emoji icons, and titles right inside Discord.

* **🎵 Voice Music System & 24/7 Mode**:
  * Play YouTube tracks, search by keywords, or queue entire playlists.
  * Full controls: `/play`, `/pause`, `/resume`, `/skip`, `/stop`, `/queue`, `/nowplaying`, `/volume`, `/loop`, `/shuffle`.
  * **24/7 Voice Mode**: Keep the bot inside a voice channel permanently.

* **🎫 Support Ticket System**:
  * One-click ticket panel with 6 built-in categories (Complaint, Staff Help, Recruitment, Report Player, Tech Support, General).
  * Automatically creates private channels visible only to the ticket creator and staff roles.
  * Staff claim system (`✋ Claim`) and automated transcript logging upon closure.

---

## ⚡ 5-Minute Quick Setup

### Step 1: Get Discord Bot Credentials
1. Go to the **[Discord Developer Portal](https://discord.com/developers/applications)**.
2. Click **"New Application"**, give it a name (e.g. `Server Bot`), and click **Create**.
3. Go to the **"Bot"** tab on the left:
   - Click **"Reset Token"** and copy your **Discord Bot Token**.
   - Under **Privileged Gateway Intents**, enable:
     - ✅ **Server Members Intent**
     - ✅ **Message Content Intent**
4. Go to the **"General Information"** tab and copy your **Application (Client) ID**.

### Step 2: Invite the Bot to Your Server
1. In the Developer Portal, go to **OAuth2 → URL Generator**.
2. Under **Scopes**, select:
   - ✅ `bot`
   - ✅ `applications.commands`
3. Under **Bot Permissions**, select:
   - ✅ `Administrator` (recommended for full ticket & voice functionality).
4. Copy the generated URL at the bottom, paste it into your browser, and select your server to invite the bot.

---

### Step 3: Choose Your Hosting

<details>
<summary><b>📱 Option A: Android Mobile (Termux) — Free & Mobile</b></summary>

1. Install **Termux** from [F-Droid](https://f-droid.org/packages/com.termux/).
2. Run these commands one by one:
```bash
termux-wake-lock
pkg update -y && pkg upgrade -y
pkg install -y git nodejs
git clone https://github.com/Ameen-Bro/samp-monitor.git
cd samp-monitor
```
3. Create your `.env` configuration file:
```bash
cat << 'EOF' > .env
DISCORD_TOKEN=your_token_here
DISCORD_CLIENT_ID=your_client_id_here
DISCORD_GUILD_ID=your_server_id_here
TIMEZONE=Asia/Kolkata
QUERY_INTERVAL_SECONDS=30
MISSED_QUERY_THRESHOLD=3
EOF
```
4. Build and start:
```bash
npm install
npm run build
npm install -g pm2
pm2 start dist/index.js --name "samp-bot"
pm2 save
```
</details>

<details>
<summary><b>☁️ Option B: Free Discord Bot Hosting (Bot-Hosting.net / Pterodactyl)</b></summary>

1. Register on [Bot-Hosting.net](https://bot-hosting.net/) or any Pterodactyl panel host.
2. Create a **Node.js** server.
3. Upload this repository or clone via Git.
4. Set **Startup File** to: `dist/index.js`.
5. Under the **Variables** tab, fill in:
   - `DISCORD_TOKEN`
   - `DISCORD_CLIENT_ID`
   - `DISCORD_GUILD_ID`
6. Run `npm install && npm run build` in the console and start the bot.
</details>

<details>
<summary><b>💻 Option C: Windows PC / Laptop</b></summary>

1. Install **[Node.js (v22 or newer)](https://nodejs.org/)** and **Git**.
2. Open PowerShell or Terminal:
```powershell
git clone https://github.com/Ameen-Bro/samp-monitor.git
cd samp-monitor
npm.cmd install
```
3. Copy `.env.example` to `.env` and fill in your Discord credentials.
4. Build and run:
```powershell
npm.cmd run build
npm.cmd start
```
</details>

<details>
<summary><b>🐧 Option D: Linux VPS (Ubuntu / Debian with PM2)</b></summary>

```bash
sudo apt update && sudo apt install -y nodejs npm git
sudo npm install -g pm2
git clone https://github.com/Ameen-Bro/samp-monitor.git
cd samp-monitor
npm install
npm run build
pm2 start dist/index.js --name "samp-bot"
pm2 save && pm2 startup
```
</details>

---

## 🎮 Setup Directly Inside Discord (No Code Needed!)

Once your bot is online, you can configure everything right inside your Discord server using Slash Commands:

### 1. Connect Your SA-MP Server
Run the command:
```
/server-config set
```
A popup window will appear:
* **Server IP Address**: Enter your server IP or domain (e.g. `139.99.52.211` or `play.myserver.com`)
* **Server Port**: Enter your port (e.g. `7777`)
* **Query Interval**: Enter `30` (recommended seconds between checks)

> 💡 *The bot will automatically ping the server via live UDP to verify it is online before saving!*

---

### 2. Customize Your Organization Branding
Make the bot match your clan, police department, or faction:
```
/org-config branding
```
A popup will appear to customize:
* **Organization Name**: (e.g., `Los Santos Police Department` or `Grove Street Families`)
* **Dashboard Icon**: (e.g., `🛡️`, `🚑`, `🔫`, or `🏢`)
* **Member Label**: (e.g., `Officer`, `Deputy`, `Agent`, `Member`)
* **Dashboard Title**: (e.g., `PATROL MONITOR` or `ACTIVITY DASHBOARD`)
* **Footer Text**: (e.g., `Official Faction Activity Tracker`)

---

### 3. Deploy the Live Activity Dashboard
Go to the text channel where you want the live dashboard and type:
```
/dashboard
```
This spawns the permanent live dashboard message. It automatically refreshes every few seconds and contains interactive buttons:
* `🔄 Refresh`: Force an instant query check
* `📊 Today`: Shows today's activity stats
* `📅 Weekly`: Shows this week's hours
* `📆 Monthly`: Shows this month's hours
* `🏆 Leaderboard`: All-time top performers rank

---

### 4. Add Members to Track
Register in-game character names to begin tracking:
```
/add-member ig_name: John_Doe
```
To remove someone:
```
/remove-member ig_name: John_Doe
```
To list all registered members:
```
/members
```

---

### 5. Setup Support Tickets
Go to your support channel and type:
```
/ticket-setup
```
The bot creates a support panel with 6 category buttons:
* 📢 **Complaint**
* 🛠️ **Staff Assistance**
* 📝 **Recruitment**
* 🚨 **Report Player**
* 💻 **Technical Support**
* ❓ **General Support**

When a user clicks a button, a private channel is automatically created for them and staff. Staff can click `✋ Claim`, and closing the ticket saves an audit transcript.

---

### 6. Play Music & 24/7 Mode
Join any voice channel and type:
```
/play query: faded alan walker
```
Or use a YouTube link:
```
/play query: https://www.youtube.com/watch?v=60ItHLz5WEA
```
To keep the bot in the voice channel permanently:
```
/247 setup
```

---

## 📋 Complete Command Reference

### 🛡️ Administration (Admin / Owner Only)
| Command | Usage | Description |
|---|---|---|
| `/server-config set` | `/server-config set` | Connects SA-MP / Open.MP server via modal |
| `/server-config status` | `/server-config status` | Check connection and tracker status |
| `/server-config test` | `/server-config test` | Ping server and show latency/players |
| `/server-config remove` | `/server-config remove` | Disconnect server without losing member data |
| `/org-config branding` | `/org-config branding` | Customize Org Name, Icon, and Titles |
| `/org-config channels` | `/org-config channels` | Set Log Channel and Ticket Staff Role |
| `/org-config view` | `/org-config view` | View current branding settings |
| `/ticket-setup` | `/ticket-setup` | Post the ticket creation panel |

### 👥 Member Tracking & Attendance
| Command | Usage | Description |
|---|---|---|
| `/dashboard` | `/dashboard` | Post the live auto-updating activity dashboard |
| `/add-member` | `/add-member ig_name: John` | Register an in-game name |
| `/remove-member` | `/remove-member ig_name: John` | Deactivate a member |
| `/members` | `/members` | List all registered members |
| `/online` | `/online [ig_name]` | View live status and today's hours for all or one member |
| `/history` | `/history ig_name: John` | View recent session start/end history |
| `/leaderboard` | `/leaderboard` | Show all-time activity leaderboard |
| `/weekly` | `/weekly` | Show weekly accumulated hours |
| `/monthly` | `/monthly` | Show monthly accumulated hours |
| `/status` | `/status` | Check SA-MP server status and player count |
| `/force-check` | `/force-check` | Force an immediate server query |

### 🎵 Music System
| Command | Usage | Description |
|---|---|---|
| `/play` | `/play query: <name or url>` | Play a song or playlist |
| `/pause` | `/pause` | Pause music |
| `/resume` | `/resume` | Resume paused music |
| `/skip` | `/skip` | Skip current song |
| `/stop` | `/stop` | Stop playing and clear queue |
| `/queue` | `/queue` | View current music queue |
| `/nowplaying` | `/nowplaying` | Display current track info |
| `/volume` | `/volume level: 80` | Set volume (0-200) |
| `/loop` | `/loop mode: track/queue/none` | Change loop mode |
| `/shuffle` | `/shuffle` | Shuffle upcoming songs |
| `/247` | `/247 <setup/disable/status>` | Stay 24/7 in voice channel |

---

## ❓ FAQ & Troubleshooting

#### 1. The bot says "No server configured. Use /server-config set first."
* This is normal! The bot is designed without any hardcoded server so anyone can use it. Simply run `/server-config set` in Discord to connect your SA-MP server.

#### 2. The bot says "Could not connect to IP:Port"
* Make sure your SA-MP server is online and running.
* Ensure your server firewall allows UDP queries on port `7777` (standard SA-MP query port).

#### 3. Music commands say "You must be in a voice channel"
* Make sure you are connected to a voice channel before running `/play`.
* Ensure the bot has the **"Connect"** and **"Speak"** permissions in that channel.

#### 4. Can I change "Officer" to "Member" or "Gangster"?
* Yes! Run `/org-config branding` and set **Member Label** to whatever you want.

---

## 📄 License
This project is licensed under the MIT License — free for personal and commercial distribution.
