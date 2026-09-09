/**
 * CLI Tool to Add / View Bot Admins directly from the terminal (Termux / VPS / PC).
 *
 * Usage:
 *   node scripts/set-admin.js <DISCORD_USER_ID>
 *   node scripts/set-admin.js --role <DISCORD_ROLE_ID>
 *   node scripts/set-admin.js --list
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'samp_monitor.sqlite');
const db = new DatabaseSync(dbPath);

// Ensure settings table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, now);
}

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--list' || args[0] === '-l') {
  const currentUserId = getSetting('bot_admin_user_id');
  const currentRoleId = getSetting('bot_admin_role_id');

  console.log('\n👑 Current Bot Admin Configuration:');
  console.log('────────────────────────────────────────');
  console.log(`👤 Admin User ID(s) : ${currentUserId || 'None set (Guild owner & Discord Admins have access)'}`);
  console.log(`🛡️ Admin Role ID    : ${currentRoleId || 'None set'}`);
  console.log('────────────────────────────────────────');
  console.log('\nHow to set via Termux:');
  console.log('  node scripts/set-admin.js <YOUR_DISCORD_USER_ID>');
  console.log('  node scripts/set-admin.js --role <DISCORD_ROLE_ID>\n');
  process.exit(0);
}

if (args[0] === '--role' || args[0] === '-r') {
  const roleId = args[1];
  if (!roleId || !/^\d{17,20}$/.test(roleId)) {
    console.error('❌ Error: Please provide a valid 17-20 digit Discord Role ID.');
    process.exit(1);
  }
  setSetting('bot_admin_role_id', roleId);
  console.log(`\n✅ Successfully set Admin Role ID: ${roleId}`);
  console.log('Members with this role now have full bot administration permissions!\n');
  process.exit(0);
}

const userId = args[0];
if (!userId || !/^\d{17,20}$/.test(userId)) {
  console.error('❌ Error: Please provide a valid 17-20 digit Discord User ID.');
  console.error('Example: node scripts/set-admin.js 123456789012345678');
  process.exit(1);
}

// Append or set user ID
const existing = getSetting('bot_admin_user_id');
let updated = userId;
if (existing) {
  const list = existing.split(',').map((s) => s.trim()).filter(Boolean);
  if (!list.includes(userId)) {
    list.push(userId);
  }
  updated = list.join(',');
}

setSetting('bot_admin_user_id', updated);
console.log(`\n✅ Successfully added Discord User ID ${userId} as Bot Administrator!`);
console.log(`Current Admin Users: ${updated}\n`);
db.close();
