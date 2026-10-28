// Testes locais (sem banco): saúde, autenticação, contador no volume e checagem de variáveis.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'e2e-'));
process.env.E2E_TOKEN = 'token-de-teste-local';
delete process.env.DATABASE_URL;
const { server } = await import('../server.js');
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const call = (method, path, token = 'token-de-teste-local') =>
  fetch(base + path, { method, headers: token ? { 'x-e2e-token': token } : {} });

test('healthz aberto; demais rotas exigem o token', async () => {
  assert.equal((await call('GET', '/healthz', null)).status, 200);
  assert.equal((await call('GET', '/file/status', null)).status, 401);
  assert.equal((await call('GET', '/file/status', 'errado')).status, 401);
});

test('contador no volume: status só lê; write incrementa', async () => {
  assert.deepEqual(await (await call('GET', '/file/status')).json(), {
    exists: false,
    counter: 0,
    dir: process.env.DATA_DIR,
  });
  assert.equal((await (await call('POST', '/file/write')).json()).counter, 1);
  assert.equal((await (await call('POST', '/file/write')).json()).counter, 2);
  assert.equal((await (await call('GET', '/file/status')).json()).counter, 2);
});

test('env/check não devolve valores', async () => {
  const body = await (await call('GET', '/env/check')).json();
  assert.equal(body.runtime.runtimeOnlyPresent, true);
  assert.equal(JSON.stringify(body).includes('token-de-teste-local'), false);
});

test('sem DATABASE_URL: 503 explicando', async () => {
  assert.equal((await call('GET', '/db/status')).status, 503);
});

test.after(() => server.close());
