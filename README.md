# 🌐 Multi-Feature SA-MP / Open.MP Activity Monitor, Music & Ticket Bot

A professional, sellable, and modular Discord bot built in **TypeScript** designed for gaming communities, roleplay factions (Police, Medical, Mafia, Gangs, Government), and server administrators.

It combines **three complete enterprise-grade systems** into a single unified bot:
1. **Generic SA-MP / Open.MP Activity Monitor & Attendance Engine** (Zero hardcoded server IPs, configurable via Discord)
2. **Music System & 24/7 Voice Mode** (Queue management, loop, shuffle, volume, pure-JS audio pipeline)
3. **Support Ticket System** (6 support categories, private channels, automated transcripts, staff claim)

---

## 📑 Table of Contents

1. [Key Features](#-key-features)
2. [Command Reference](#-command-reference)
3. [Architecture Overview](#-architecture-overview)
4. [Installation & Setup](#-installation--setup)
5. [Configuring the Bot via Discord](#-configuring-the-bot-via-discord)
6. [Hosting Guide (Bot-Hosting.net / Pterodactyl / VPS)](#-hosting-guide)
7. [Database Migrations & Backward Compatibility](#-database-migrations--backward-compatibility)
8. [Testing & Quality Assurance](#-testing--quality-assurance)

---

## ✨ Key Features

### 1. 📡 Generic SA-MP / Open.MP Activity Monitor
- **No Hardcoded Server**: No default IP or port is baked into the code. Configure or change your target server at any time directly through Discord via `/server-config set`.
- **Live UDP Query Engine**: Native binary packet builder/parser (`'i'`, `'d'`, `'c'`, `'p'`) compatible with all SA-MP and Open.MP servers.
- **Dynamic Organization Branding**: Change organization name, member labels ("Officer", "Agent", "Guard"), icons, and dashboard titles via `/org-config branding`.
- **Live Interactive Dashboard**: Displays online and offline members, session durations, today's patrol/activity time, player counts, and latency.
- **Missed Query Protection**: Prevents transient network jitter from prematurely terminating active sessions.
- **Midnight Session Splitting**: Accurately splits cross-midnight sessions into separate calendar days based on configured timezone (`Asia/Kolkata` by default).
- **Restart Recovery**: Reconciles active sessions on bot reboot without duplicating or losing recorded hours.

### 2. 🎵 Music System & 24/7 Voice Mode
- **Playback Controls**: `/play`, `/pause`, `/resume`, `/skip`, `/stop`, `/queue`, `/nowplaying`, `/volume`, `/loop`, `/shuffle`.
- **YouTube & Search Support**: Search by title or provide direct YouTube video and playlist URLs.
- **24/7 Voice Mode**: `/247 setup` keeps the bot permanently connected to your designated voice channel.
- **Pure JavaScript Audio Stack**: Uses `@discordjs/voice` + `opusscript` + `tweetnacl` + `play-dl` without requiring C++ compilation or Python build tools.

### 3. 🎫 Multi-Category Support Ticket System
- **One-Click Ticket Panel**: `/ticket-setup` posts an interactive button panel with 6 built-in categories:
  - 📢 Complaint
  - 🛠️ Staff Assistance
  - 📝 Recruitment
  - 🚨 Report Player
  - 💻 Technical Support
  - ❓ General Support
- **Private Channel Generation**: Automatically creates restricted channels with strict permission overwrites visible only to the ticket creator and staff roles.
- **Transcript Logging**: Generates conversation transcripts and logs closed tickets to a designated audit channel.
- **One Ticket per User**: Enforces a 1-active-ticket limit per user to eliminate spam.

---

## 💻 Command Reference

### 🌐 Server & Organization Administration
| Command | Permission | Description |
|---|---|---|
| `/server-config set` | Admin | Open modal to set Server IP, Port, and Query Interval with live UDP test |
| `/server-config status` | Admin | Check current server IP, port, and tracker status |
| `/server-config test` | Admin | Send a test UDP ping and display live server stats |
| `/server-config remove` | Admin | Unbind server and pause tracker without deleting member data |
| `/org-config branding` | Admin | Customize Org Name, Icon, Member Label, and Dashboard Title |
| `/org-config channels` | Admin | Configure Log Channel, Staff Role, and Ticket Log Channel |
| `/org-config view` | Admin | View current branding and channel settings |

### 📊 Activity Monitoring & Attendance
| Command | Permission | Description |
|---|---|---|
| `/dashboard` | Everyone | Spawns or updates the permanent live activity dashboard |
| `/pd-dashboard` | Everyone | *(Backward-compatible alias)* |
| `/add-member <name>` | Admin | Register a member by in-game name |
| `/add-officer <name>` | Admin | *(Backward-compatible alias)* |
| `/remove-member <name>` | Admin | Deactivate a registered member |
| `/remove-officer <name>` | Admin | *(Backward-compatible alias)* |
| `/members` | Everyone | List all registered members |
| `/officers` | Everyone | *(Backward-compatible alias)* |
| `/online [name]` | Everyone | Check live status and today's stats for all or one member |
| `/history <name>` | Everyone | Display recent session history for a member |
| `/leaderboard` | Everyone | Rank members by lifetime accumulated activity time |
| `/weekly` | Everyone | Display this week's accumulated time per member |
| `/monthly` | Everyone | Display this month's accumulated time per member |
| `/status` | Everyone | Display current SA-MP / Open.MP server status and player count |
| `/force-check` | Everyone | Trigger an immediate manual server query |

### 🎵 Music Commands
| Command | Permission | Description |
|---|---|---|
| `/play <query>` | Everyone | Play song from YouTube URL, playlist, or search keywords |
| `/pause` | Everyone | Pause current playback |
| `/resume` | Everyone | Resume playback |
| `/skip` | Everyone | Skip currently playing track |
| `/stop` | Everyone | Stop playback, clear queue, and disconnect |
| `/queue` | Everyone | View upcoming tracks and loop mode |
| `/nowplaying` | Everyone | View current track, duration, volume, and requester |
| `/volume <0-200>` | Everyone | Adjust audio volume level |
| `/loop <off\|track\|queue>` | Everyone | Set loop mode |
| `/shuffle` | Everyone | Randomize current queue order |
| `/247 <setup\|enable\|disable\|status>` | Admin | Manage 24/7 voice channel persistence |

### 🎫 Ticket Commands
| Command | Permission | Description |
|---|---|---|
| `/ticket-setup` | Admin | Post the ticket creation panel with category buttons |

---

## 🏗️ Architecture Overview

```
src/
├── index.ts                 # Bootstrap, Discord lifecycle & modal router
├── config.ts                # Environment configuration loader
├── samp/
│   ├── types.ts             # SA-MP packet & status interfaces
│   ├── parser.ts            # Binary packet builder & response parser
│   └── query.ts             # UDP socket client with timeout & fallbacks
├── tracking/
│   ├── tracker.ts           # Dynamic server polling engine & state manager
│   └── recovery.ts          # Crash recovery & session reconciliation
├── database/
│   ├── db.ts                # SQLite init, WAL mode, migrations
│   ├── settings.ts          # Centralized settings & branding store
│   ├── officers.ts          # Member/Officer registry
│   ├── sessions.ts          # Session tracking & attendance stats
│   ├── tickets.ts           # Support ticket records & audit trail
│   ├── queryLogs.ts         # Query diagnostic history
│   └── dashboardConfig.ts   # Permanent dashboard message tracker
├── discord/
│   ├── client.ts            # Discord.js client instance
│   ├── commands.ts          # All 29 slash command definitions & router
│   ├── buttons.ts           # Button interaction router
│   ├── dashboard.ts         # Dynamic branding dashboard builder
│   ├── serverConfig.ts      # Server configuration modal & testing
│   ├── branding.ts          # Organization branding modal handler
│   ├── musicCommands.ts     # Music slash command handlers
│   ├── ticketCommands.ts    # Ticket slash command & button handlers
│   └── dailyReport.ts       # Automated daily report scheduler
├── music/
│   ├── types.ts             # Music queue & playback state types
│   └── player.ts            # Discord voice connection & stream pipeline
├── tickets/
│   └── ticketManager.ts     # Channel creation, permissions & transcript log
└── utils/
    ├── logger.ts            # Structured leveled logger
    ├── normalizeName.ts     # In-game name case normalizer
    └── time.ts              # Timezone calculation & midnight splitter
```

---

## 🚀 Installation & Setup

### Prerequisites
- **Node.js**: v22.0.0 or higher (uses native `node:sqlite` built into modern Node.js)
- **Discord Bot Token & Client ID**: from [Discord Developer Portal](https://discord.com/developers/applications)

### Step 1: Clone and Install
```bash
git clone https://github.com/Ameen-Bro/samp-monitor.git
cd samp-monitor
npm install
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env` and fill in your Discord credentials:
```env
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here
DISCORD_GUILD_ID=your_guild_id_here

TIMEZONE=Asia/Kolkata
QUERY_INTERVAL_SECONDS=30
MISSED_QUERY_THRESHOLD=3
```

*(Note: SA-MP server IP and port are configured inside Discord using `/server-config set`!)*

### Step 3: Build & Start
```bash
npm run build
npm start
```

---

## 🎮 Configuring the Bot via Discord

1. **Invite Bot**: Grant `bot` and `applications.commands` scopes with Administrator or channel management permissions.
2. **Set Server IP**: Run `/server-config set` and enter your SA-MP / Open.MP IP (e.g. `139.99.52.211`) and Port (`7777`). The bot tests connectivity via live UDP before saving!
3. **Set Branding**: Run `/org-config branding` to customize your Org Name, Member Label (e.g., `Officer`), and Dashboard Title.
4. **Deploy Dashboard**: Run `/dashboard` in your desired channel.
5. **Add Members**: Run `/add-member <InGame_Name>` to begin tracking playtime.
6. **Setup Tickets**: Run `/ticket-setup` in your support channel.

---

## 🌐 Hosting Guide

### Bot-Hosting.net (Pterodactyl Panel)
1. In your Bot-Hosting dashboard, select **Node.js** as your environment.
2. Upload the repository files (or clone from GitHub).
3. Set **Startup File** to: `dist/index.js`.
4. In the **Build Step** or terminal, run: `npm install && npm run build`.
5. Enter your environment variables in the **Variables** tab or upload `.env`.
6. Start the server!

### Ubuntu VPS (PM2)
```bash
sudo apt update && sudo apt install -y nodejs npm git
sudo npm install -g pm2
git clone https://github.com/Ameen-Bro/samp-monitor.git
cd samp-monitor
npm install
npm run build
pm2 start dist/index.js --name "samp-monitor"
pm2 save
pm2 startup
```

---

## 🔒 Database Migrations & Backward Compatibility

- Uses Node 22+ built-in `node:sqlite` in WAL mode — **zero C++ build requirements**.
- Existing SQLite databases are preserved automatically. The migration engine adds missing tables (`settings`, `tickets`, `ticket_actions`) and columns (`discord_user_id`, `display_name`) safely using schema inspection.
- All legacy commands (`/pd-dashboard`, `/add-officer`, `/remove-officer`, `/officers`) continue to function alongside modern generic commands.

---

## 🧪 Testing & Quality Assurance

Run the comprehensive unit test suite:
```bash
npm test
```

All 27 test suites pass out-of-the-box, verifying:
- SA-MP Binary packet parser & builder
- In-game name normalization
- Session tracking and SQLite aggregations
- Midnight session splitting in configured timezones
- Startup crash recovery
- Missed query protection against dropped UDP packets
- Dynamic dashboard layout, online-first sorting, and pagination

---

## 📜 License
MIT License. Created for the SA-MP & Open.MP communities.
