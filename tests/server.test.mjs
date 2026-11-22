import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createBuskeroServer, SECURITY_HEADERS } from '../server.mjs';

function rawHttpGetStatus(port, rawPath) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: rawPath }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
  });
}

test('server serves index.html with zero-exfiltration CSP and blocks internal directories', async () => {
  const server = createBuskeroServer({ port: 0 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const addr = server.address();
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    const rootRes = await fetch(`${baseUrl}/`);
    assert.equal(rootRes.status, 200);
    assert.match(rootRes.headers.get('content-type') || '', /text\/html/);
    assert.equal(rootRes.headers.get('content-security-policy'), SECURITY_HEADERS['Content-Security-Policy']);
    assert.match(rootRes.headers.get('content-security-policy') || '', /connect-src 'none'/);
    assert.match(rootRes.headers.get('content-security-policy') || '', /worker-src 'self'/);
    assert.equal(rootRes.headers.get('referrer-policy'), 'no-referrer');

    const workerRes = await fetch(`${baseUrl}/src/audio/pitchWorker.mjs`);
    assert.equal(workerRes.status, 200);
    assert.match(workerRes.headers.get('content-type') || '', /application\/javascript/);

    for (const blockedPath of ['/governance/README.md', '/.git/HEAD', '/tests/server.test.mjs', '/package.json']) {
      const res = await fetch(`${baseUrl}${blockedPath}`);
      assert.equal(res.status, 403, `Expected 403 for ${blockedPath}`);
    }

    const traversalStatus = await rawHttpGetStatus(addr.port, '/../package.json');
    assert.equal(traversalStatus, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
