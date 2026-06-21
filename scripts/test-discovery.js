// Discovery probe script — tests multiple methods against the local network
// Run with: node scripts/test-discovery.js
const dgram = require('dgram');
const http  = require('http');

const SSDP_ADDR = '239.255.255.250';
const SSDP_PORT = 1900;
const TIMEOUT   = 5000;

const KNOWN_IPS = ['192.168.50.122', '192.168.50.178'];

const SEARCH_TARGETS = [
  'ssdp:all',
  'upnp:rootdevice',
  'urn:samsung.com:device:RemoteControlReceiver:1',
  'urn:samsung.com:device:MainTVServer2:1',
  'urn:dial-multiscreen-org:service:dial:1',
  'urn:schemas-upnp-org:device:MediaRenderer:1',
];

function ssdpSearch(st) {
  return new Promise(resolve => {
    const found = new Map();
    const sock  = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const msg   = Buffer.from([
      'M-SEARCH * HTTP/1.1',
      `HOST: ${SSDP_ADDR}:${SSDP_PORT}`,
      'MAN: "ssdp:discover"',
      'MX: 3',
      `ST: ${st}`,
      '', '',
    ].join('\r\n'));

    sock.on('error', () => { try { sock.close(); } catch (_) {} resolve([...found.values()]); });
    sock.on('message', (buf, rinfo) => {
      const text = buf.toString();
      found.set(rinfo.address, { ip: rinfo.address, raw: text.slice(0, 400) });
    });
    sock.bind(0, () => {
      try {
        sock.addMembership(SSDP_ADDR);
        sock.send(msg, 0, msg.length, SSDP_PORT, SSDP_ADDR);
      } catch (e) {
        try { sock.close(); } catch (_) {}
        resolve([]);
      }
    });
    setTimeout(() => {
      try { sock.close(); } catch (_) {}
      resolve([...found.values()]);
    }, TIMEOUT);
  });
}

function httpGet(ip, port, path) {
  return new Promise(resolve => {
    const req = http.get({ hostname: ip, port, path, timeout: 3000 }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data.slice(0, 600) }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }); });
    req.on('error', e => resolve({ error: e.message }));
  });
}

async function main() {
  console.log('=== Direct HTTP probe of known IPs ===\n');
  for (const ip of KNOWN_IPS) {
    for (const [port, path] of [[8001, '/api/v2/'], [8002, '/api/v2/']]) {
      const r = await httpGet(ip, port, path);
      console.log(`${ip}:${port}${path} →`, r.error || `HTTP ${r.status} — ${r.body.slice(0, 120)}`);
    }
    console.log();
  }

  console.log('\n=== SSDP search (5s each) ===\n');
  for (const st of SEARCH_TARGETS) {
    process.stdout.write(`ST: ${st} … `);
    const results = await ssdpSearch(st);
    if (results.length === 0) {
      console.log('(no responses)');
    } else {
      console.log(`${results.length} device(s) responded:`);
      for (const r of results) {
        const samsung = KNOWN_IPS.includes(r.ip) ? ' ← KNOWN TV' : '';
        console.log(`  ${r.ip}${samsung}`);
        // Print first 3 lines of raw response
        for (const line of r.raw.split('\r\n').slice(0, 6)) {
          if (line) console.log(`    ${line}`);
        }
        console.log();
      }
    }
  }
}

main().catch(console.error);
