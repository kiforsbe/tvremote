// tests/blackbox/server.test.js
/** @jest-environment node */

const http = require('http');

function get(path) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:3000${path}`, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks),
      }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(new Error('timeout')); });
  });
}

describe('HTTP server', () => {
  test('serves index.html at / with correct content-type', async () => {
    const r = await get('/');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('text/html');
    expect(r.body.toString()).toContain('<!DOCTYPE html>');
  });

  test('serves remote.js at /remote.js', async () => {
    const r = await get('/remote.js');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('application/javascript');
    expect(r.body.toString()).toContain('buildKeyCommand');
  });

  test('serves manifest.json with correct content-type', async () => {
    const r = await get('/manifest.json');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('application/json');
    const manifest = JSON.parse(r.body.toString());
    expect(manifest.display).toBe('standalone');
  });

  test('serves icon-192.png as image/png', async () => {
    const r = await get('/icons/icon-192.png');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('image/png');
    // PNG magic bytes
    expect(r.body[0]).toBe(0x89);
    expect(r.body[1]).toBe(0x50);
  });

  test('returns 404 for a missing file', async () => {
    const r = await get('/does-not-exist.txt');
    expect(r.status).toBe(404);
  });

  test('blocks directory traversal with 403 or 404', async () => {
    const r = await get('/../package.json');
    expect([403, 404]).toContain(r.status);
  });
});
