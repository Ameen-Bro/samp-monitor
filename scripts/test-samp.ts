import { querySampServer } from '../src/samp/query';
import dotenv from 'dotenv';

dotenv.config();

const SERVER_IP = process.env.SAMP_SERVER_IP || '139.99.52.211';
const SERVER_PORT = parseInt(process.env.SAMP_SERVER_PORT || '7777', 10);

async function main() {
  console.log('='.repeat(50));
  console.log(`Connecting to SA-MP / Open.MP server at ${SERVER_IP}:${SERVER_PORT}...`);
  console.log('Sending public UDP query packets...');
  console.log('='.repeat(50));

  const result = await querySampServer(SERVER_IP, SERVER_PORT, { timeoutMs: 4000 });

  if (!result.online || !result.info) {
    console.log('\n❌ SERVER QUERY FAILED\n');
    console.log(`Target: ${SERVER_IP}:${SERVER_PORT}`);
    console.log(`Error: ${result.error || 'No response received (packet timeout)'}`);
    console.log('\nTroubleshooting tips:');
    console.log('- Ensure your network / firewall allows outbound UDP traffic.');
    console.log('- The game server host may be temporarily offline or blocking UDP queries.');
    console.log('- If running behind strict ISP or VPN NAT, try running from a VPS.');
    process.exit(1);
  }

  console.log('\n## SERVER STATUS\n');
  console.log(`IP: ${result.ip}`);
  console.log(`PORT: ${result.port}`);
  console.log(`Status: ONLINE`);
  console.log(`Latency: ${result.latencyMs}ms`);
  console.log(`Hostname: ${result.info.hostname}`);
  console.log(`Gamemode: ${result.info.gamemode}`);
  console.log(`Map: ${result.info.mapname}`);
  console.log(`Password Protected: ${result.info.password ? 'Yes' : 'No'}`);
  console.log(`Players: ${result.info.players}/${result.info.maxPlayers}`);

  console.log('\n## PLAYER LIST\n');
  if (result.players.length === 0) {
    if (result.info.players === 0) {
      console.log('No players currently connected to the server.');
    } else {
      console.log(`Server reports ${result.info.players} player(s), but detailed player list query did not return records (server may restrict 'd' packets).`);
    }
  } else {
    result.players.forEach((player, index) => {
      const pingStr = player.ping ? ` (Ping: ${player.ping}ms)` : '';
      const scoreStr = player.score !== undefined ? ` [Score: ${player.score}]` : '';
      console.log(`${index + 1}. [ID ${player.id}] ${player.name}${scoreStr}${pingStr}`);
    });
  }

  console.log('\n' + '='.repeat(50));
  console.log(`Query completed successfully at: ${result.lastQueriedAt.toISOString()}`);
  console.log('='.repeat(50));
}

main().catch((err) => {
  console.error('\n❌ SERVER QUERY FAILED\n', err);
  process.exit(1);
});
