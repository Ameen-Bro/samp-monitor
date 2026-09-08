# 🛡️ SA-MP / Open.MP PD Officer Monitor & Attendance System

A production-ready Discord bot built in **TypeScript** that monitors Police Department (PD) officers on a San Andreas Multiplayer (SA-MP) or Open.MP server using **ONLY** the server's publicly queryable UDP IP and port (`139.99.52.211:7777`).

No RCON passwords, server-side plugins, database credentials, or server file access required.

---

## 📑 Table of Contents

1. [Features](#features)
2. [How the Public UDP Query Works](#how-the-public-udp-query-works)
3. [Architecture](#architecture)
4. [Prerequisites](#prerequisites)
5. [Quick Start & Standalone Query Tester](#quick-start--standalone-query-tester)
6. [Environment Variables (`.env`)](#environment-variables-env)
7. [Discord Bot Setup & Permissions](#discord-bot-setup--permissions)
8. [Officer Management & Slash Commands](#officer-management--slash-commands)
9. [One-Click Live Dashboard & Interactive Buttons](#one-click-live-dashboard--interactive-buttons)
10. [Attendance & Session Tracking Engine](#attendance--session-tracking-engine)
    - [Missed Query Protection](#missed-query-protection)
    - [Midnight Session Splitting (IST)](#midnight-session-splitting-ist)
    - [Startup & Crash Recovery](#startup--crash-recovery)
11. [Daily Automated Reports](#daily-automated-reports)
12. [SQLite Database Architecture](#sqlite-database-architecture)
13. [Ubuntu VPS 24/7 Deployment (PM2)](#ubuntu-vps-247-deployment-pm2)
14. [Automated Test Suite](#automated-test-suite)
15. [Troubleshooting](#troubleshooting)

---

## ✨ Features

- **One-Click "Check All Officers" Dashboard (`/pd-dashboard`)**:
  - Displays all registered officers categorized with online officers sorted first.
  - Live session duration, today's accumulated patrol time, total online count, server latency, and player count.
  - Interactive buttons: `🔄 Refresh`, `📊 Today`, `📅 Weekly`, `📆 Monthly`, `🏆 Leaderboard`.
  - In-place message edits without spamming Discord channels.
  - Automatic pagination (`⬅️ Previous`, `➡️ Next`) for large rosters.
- **Accurate UDP Protocol Implementation**:
  - Native binary packet builder and parser for `'i'` (Info), `'d'` (Detailed players), and `'c'` (Clients fallback).
  - Robust bounds checking and text decoding.
- **Missed Query Protection (`MISSED_QUERY_THRESHOLD=3`)**:
  - Prevents network jitter or single dropped UDP packets from prematurely ending active officer sessions.
- **Continuous Midnight Session Splitting**:
  - Patrol sessions spanning midnight in `Asia/Kolkata` (IST) are split accurately into each calendar day for precise attendance reporting.
- **Bot Restart & Crash Recovery**:
  - Reconciles active SQLite sessions with the live server player list on startup without creating duplicate sessions or losing accumulated time.
- **Automated Daily Reports**:
  - Scheduled daily report posted to `LOG_CHANNEL_ID` summarizing all officer patrol times and identifying top performers.

---

## 📡 How the Public UDP Query Works

SA-MP and Open.MP servers expose a public query protocol over UDP on the game port (`7777`).

```
Header (11 bytes):
+---------------+---------------+---------------+--------+
| "SAMP" (4B)   | IP Octets (4B)| Port (2B LE)  | Op (1B)|
+---------------+---------------+---------------+--------+
```

1. **Information (`'i'`)**: Returns password protection status, online player count, max player limit, hostname, gamemode, and map name.
2. **Detailed Player List (`'d'`)**: Returns player ID, in-game name, score, and ping for connected players.
3. **Basic Player List (`'c'`)**: Fallback query for servers that only permit basic client list packets.
4. **Ping (`'p'`)**: Measures round-trip network latency.

The bot operates strictly through standard client query packets, identical to the official SA-MP server browser.

---

## 🏗️ Architecture

```
src/
├── index.ts                 # Application entrypoint & Discord lifecycle
├── config.ts                # Environment configuration loader & validation
├── samp/
│   ├── types.ts             # SA-MP data contracts & interfaces
│   ├── parser.ts            # Binary packet builder & response parser
│   └── query.ts             # UDP socket communication with timeout & fallback
├── tracking/
│   ├── tracker.ts           # Continuous background monitor & state manager
│   └── recovery.ts          # Startup session reconciliation engine
├── database/
│   ├── db.ts                # SQLite database initialization (WAL mode)
│   ├── officers.ts          # Officer registry repository (case-insensitive)
│   ├── sessions.ts          # Patrol sessions, statistics & aggregations
│   ├── queryLogs.ts         # Query diagnostic history
│   └── dashboardConfig.ts   # Persistent dashboard message tracking
├── discord/
│   ├── client.ts            # Discord.js client instance
│   ├── commands.ts          # Slash command definitions and execution
│   ├── dashboard.ts         # Rich embed generator, sorting & pagination
│   ├── buttons.ts           # Interactive button event router
│   └── dailyReport.ts       # Scheduled node-cron daily patrol reports
└── utils/
    ├── logger.ts            # Structured leveled logger
    ├── normalizeName.ts     # Safe case-insensitive name matching
    └── time.ts              # Timezone math, midnight splitter & formatters

scripts/
└── test-samp.ts             # Standalone CLI server query verification tool

tests/                       # Vitest unit & integration test suite (27 tests)
```

---

## 🚀 Prerequisites

- **Node.js**: v22.5.0 or higher (Node v22 / v24 includes native `node:sqlite`).
- **npm**: v10+

---

## 🧪 Quick Start & Standalone Query Tester

### 1. Clone & Install
```bash
git clone <repo-url> pd-monitor
cd pd-monitor
npm install
```

### 2. Test SA-MP Server Query
Run the standalone tester to verify that your network can communicate with `139.99.52.211:7777`:

```bash
npm run test:samp
```

**Expected output:**
```
==================================================
Connecting to SA-MP / Open.MP server at 139.99.52.211:7777...
Sending public UDP query packets...
==================================================

## SERVER STATUS

IP: 139.99.52.211
PORT: 7777
Status: ONLINE
Latency: 95ms
Hostname: Xlantis Roleplay [OMP]
Gamemode: XRP: V1.0.0
Map: Malayalam/English
Password Protected: No
Players: 54/350

## PLAYER LIST

1. [ID 0] PlayerName1 [Score: 2]
2. [ID 1] PlayerName2 [Score: 1]
...
```

---

## ⚙️ Environment Variables (`.env`)

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Configure the following fields:

```env
# Discord Bot Credentials
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_client_id_here
# Set GUILD_ID to register slash commands instantly in your Discord guild
DISCORD_GUILD_ID=123456789012345678

# SA-MP Target Server
SAMP_SERVER_IP=139.99.52.211
SAMP_SERVER_PORT=7777

# Timezone for display and midnight calculations (default: Asia/Kolkata)
TIMEZONE=Asia/Kolkata

# Automated Polling Configuration
QUERY_INTERVAL_SECONDS=30
MISSED_QUERY_THRESHOLD=3

# Permissions & Logging
ADMIN_ROLE_ID=
LOG_CHANNEL_ID=
DAILY_REPORT_HOUR=23
DAILY_REPORT_MINUTE=59
```

---

## 🤖 Discord Bot Setup & Permissions

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Create a **New Application** (e.g. "PD Officer Monitor").
3. Navigate to **Bot**:
   - Reset and copy the **Bot Token** into `DISCORD_TOKEN`.
   - Enable **Server Members Intent** and **Message Content Intent** if required (bot only needs Guilds intent by default).
4. Navigate to **OAuth2 -> URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions:
     - `Send Messages`
     - `Embed Links`
     - `Attach Files`
     - `Read Message History`
     - `Use External Emojis`
5. Use the generated invite URL to add the bot to your Discord server.

---

## 👮 Officer Management & Slash Commands

| Command | Description | Permission |
|---|---|---|
| `/pd-dashboard` | Spawns or updates the permanent live dashboard in the current channel | Admin |
| `/add-officer <ig_name>` | Registers an officer by permanent in-game name (e.g. `John_Smith`) | Admin |
| `/remove-officer <ig_name>` | Deactivates an officer from active tracking | Admin |
| `/officers` | Lists all currently registered PD officers | Everyone |
| `/force-check` | Immediately forces a server check and updates all officers | Everyone |
| `/status` | Shows live SA-MP server status, player counts, gamemode, and latency | Everyone |
| `/online [ig_name]` | Shows live patrol status of all or a specific officer | Everyone |
| `/history <ig_name>` | Displays recent session logs and durations for an officer | Everyone |
| `/leaderboard` | Displays ranking of all officers by lifetime patrol time | Everyone |
| `/weekly` | Displays total patrol time accumulated this week | Everyone |
| `/monthly` | Displays total patrol time accumulated this month | Everyone |

### Name Matching Rules
- Matching is **case-insensitive** (`john_smith` matches `John_Smith` and `JOHN_SMITH`).
- The original display name provided during registration is preserved for Discord displays and embeds.
- Safe exact matching prevents partial or fuzzy collisions (e.g., `John_Smith` will never falsely match `John_Smith123`).

---

## 📊 One-Click Live Dashboard & Interactive Buttons

The `/pd-dashboard` command creates a permanent embed in your designated channel:

```
🛡️ PD OFFICER ACTIVITY
🌐 Server: 🟢 Online (95ms) • Players: 54/350

🟢 John_Smith
Online — Current session: 1h 24m
Today: 4h 38m

🔴 Mike_Officer
Offline
Today: 2h 15m

🟢 Alex_PD
Online — Current session: 32m
Today: 6h 02m

━━━━━━━━━━━━━━━━━━
👮 Officers: 3
🟢 Online: 2
🔴 Offline: 1

⏱️ Total PD Time Today: 12h 55m

Last checked:
08 Sep 2026, 8:42 PM IST

[ 🔄 Refresh ] [ 📊 Today ] [ 📅 Weekly ] [ 📆 Monthly ] [ 🏆 Leaderboard ]
```

### Button Functions
- **`🔄 Refresh`**: Sends **one** server query, updates SQLite sessions, recalculates all accumulated times, and edits the existing dashboard message in-place.
- **`📊 Today`**: Sends an ephemeral popup breakdown of patrol times today for all officers.
- **`📅 Weekly`**: Sends an ephemeral popup breakdown of patrol times this week.
- **`📆 Monthly`**: Sends an ephemeral popup breakdown of patrol times this month.
- **`🏆 Leaderboard`**: Sends an ephemeral leaderboard with rankings (🥇, 🥈, 🥉).
- **`⬅️ Previous` / `➡️ Next`**: Appears automatically if the roster exceeds 10 officers to provide seamless pagination without Discord character truncation.

---

## ⏱️ Attendance & Session Tracking Engine

### Missed Query Protection
UDP queries are subject to intermittent packet loss.
- Single failed query: State is retained, failure counter increases (`1/3`).
- Second failed query: State is retained, failure counter increases (`2/3`).
- Third failed query (`>= MISSED_QUERY_THRESHOLD`): Officers are marked offline and sessions are cleanly closed with reason `SERVER_UNREACHABLE`.
- Any successful query immediately resets the failure counter to `0`.

### Midnight Session Splitting (IST)
If an officer patrols through midnight (e.g., `23:00` to `01:00` IST):
- Day 1 (23:00 to 24:00): Exactly **1 hour** is attributed to Day 1's report.
- Day 2 (00:00 to 01:00): Exactly **1 hour** is attributed to Day 2's report.
Timestamps are stored in standard UTC ISO format and partitioned mathematically across day boundaries in `Asia/Kolkata`.

### Startup & Crash Recovery
When the bot starts:
1. Opens the SQLite database with Write-Ahead Logging (WAL).
2. Loads all registered active officers.
3. Immediately queries the live SA-MP player list.
4. **Reconciles open sessions**:
   - If an officer was marked online before restart and is **still** on the server, the active session continues without creating a duplicate record.
   - If an officer disconnected during downtime, the session is cleanly closed.
   - If a new officer connected, a new session is started.

---

## 📋 Daily Automated Reports

At the configured time (default: `23:59 IST`), the bot queries SQLite for stored session intervals and posts a daily summary to `LOG_CHANNEL_ID`:

```
📋 PD DAILY REPORT
Date: 2026-09-08 (Asia/Kolkata)

• John_Smith — 6h 42m
• Alex_PD — 5h 18m
• Mike_Officer — 2h 44m

━━━━━━━━━━━━━━━━━━
⏱️ Total PD Time: 14h 44m
🌟 Highest: John_Smith (6h 42m)
```

---

## 🗄️ SQLite Database Architecture

Database file is automatically placed in `data/samp_monitor.sqlite` with WAL mode enabled:

- **`officers`**: `id`, `ig_name`, `normalized_name`, `active`, `created_at`
- **`sessions`**: `id`, `officer_id`, `started_at`, `ended_at`, `duration_seconds`, `end_reason`
- **`query_logs`**: `id`, `queried_at`, `success`, `player_count`, `latency_ms`, `error_message`
- **`dashboard_config`**: `key`, `guild_id`, `channel_id`, `message_id`, `updated_at`

---

## 🖥️ Ubuntu VPS 24/7 Deployment (PM2)

Follow these steps to deploy on any Ubuntu 22.04+ VPS:

### 1. Update & Install Node.js 22+
```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git build-essential
sudo npm install -g pm2
```

### 2. Clone and Setup
```bash
cd /opt
git clone <your-repo-url> pd-monitor
cd pd-monitor
npm install
```

### 3. Configure `.env`
```bash
cp .env.example .env
nano .env
```
Fill in your `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, and other settings.

### 4. Build and Test
```bash
# Verify connection to SA-MP server
npm run test:samp

# Run all unit tests
npm test

# Build TypeScript to JavaScript
npm run build
```

### 5. Start with PM2
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```
*(Copy and paste the sudo command shown by `pm2 startup` to enable boot persistence).*

### 6. Useful PM2 Commands
```bash
pm2 status              # View bot status
pm2 logs pd-tracker     # View real-time logs
pm2 restart pd-tracker  # Restart bot
pm2 stop pd-tracker     # Stop bot
```

---

## 🧪 Automated Test Suite

Run the complete test suite:

```bash
npm test
```

Includes 27 tests covering:
- Binary SA-MP UDP packet builder and parser (`'i'`, `'d'`, `'c'`)
- Case-insensitive name normalization and collision prevention
- Officer session start, continuation, and termination
- Multi-session daily calculations
- Continuous midnight session splitting in `Asia/Kolkata`
- Missed query threshold and network timeout protection
- Bot restart recovery without duplicate sessions
- Leaderboard ranking and medal assignment
- Dashboard layout, online-first sorting, and multi-page pagination

---

## 🔧 Troubleshooting

### 1. `SERVER QUERY FAILED` when running `npm run test:samp`
- Verify that your firewall or VPS security group allows outbound UDP traffic on port `7777`.
- The target server host may be restarting or blocking UDP queries from certain IP ranges.
- Run `ping 139.99.52.211` or test from a different network or VPS.

### 2. Slash commands do not appear in Discord
- Discord global slash command updates can take up to 1 hour to propagate.
- To make commands appear **instantly**, specify `DISCORD_GUILD_ID` in `.env` with your Discord server's ID.

### 3. Dashboard does not auto-update
- Make sure the bot has `Send Messages` and `Embed Links` permissions in the dashboard channel.
- Run `/pd-dashboard` once to register the message ID in SQLite.
