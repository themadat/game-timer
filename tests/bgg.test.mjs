import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

function client(fetchImpl, storageOverrides = {}) {
  const saved = new Map();
  let clock = 1000;
  const context = vm.createContext({
    window: { LocalApp: { config: { storage: { bggSecretKey: 'gameTimer.bggToken.v1' } } } },
    localStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key), ...storageOverrides },
    navigator: { onLine: true }, URL, AbortController, TypeError, Date: { now: () => clock }, setTimeout, clearTimeout, fetch: fetchImpl,
    // Transport tests use empty search results; real XML mappings run in bgg-preview.html.
    DOMParser: class { parseFromString() { return { querySelector: () => null, documentElement: { tagName: 'items', children: [] } }; } }
  });
  vm.runInContext(readFileSync(new URL('../assets/js/core/bgg.js', import.meta.url), 'utf8'), context);
  return { api: context.window.LocalApp.bgg, saved, context, advance: () => { clock += 6000; } };
}

test('BGG key is stored separately on this device, can be replaced and forgotten', () => {
  const { api, saved } = client();
  assert.equal(api.hasToken(), false);
  for (const value of ['', '   ', 'key with spaces', 'x'.repeat(501)]) assert.throws(() => api.setToken(value), /valid BGG API key/);
  api.setToken('  test-secret  ');
  assert.equal(saved.get('gameTimer.bggToken.v1'), 'test-secret');
  assert.equal(saved.size, 1);
  assert.equal(api.hasToken(), true);
  assert.equal(api.getToken, undefined);
  api.setToken('replacement');
  assert.equal(saved.get('gameTimer.bggToken.v1'), 'replacement');
  api.clearToken();
  assert.equal(api.hasToken(), false);
  assert.equal(saved.size, 0);
});

test('BGG reports storage failures without pretending a key was saved or forgotten', () => {
  const { api } = client(undefined, { setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } });
  assert.throws(() => api.setToken('test-secret'), /could not save/);
  assert.throws(() => api.clearToken(), /could not remove/);
  assert.equal(api.hasToken(), false);
});

test('BGG calls the official API directly and sends the key only as a Bearer header', async () => {
  let call;
  const { api } = client(async (...args) => { call = args; return new Response('', { status: 401 }); });
  api.setToken('test-secret');
  await assert.rejects(api.thing('13'), /access was refused/);
  assert.equal(call[0], 'https://boardgamegeek.com/xmlapi2/thing?id=13&stats=1');
  assert.equal(call[1].headers.Authorization, 'Bearer test-secret');
  assert.equal(call[1].credentials, 'omit');
  assert.equal(call[1].referrerPolicy, 'no-referrer');
  assert.equal(call[1].redirect, 'error');
  assert.ok(!call[0].includes('test-secret'));
});

test('BGG search specifies games and expansions, caches success, and clears cache on key changes', async () => {
  const calls = [];
  const { api, advance } = client(async (...args) => { calls.push(args); return new Response('<items/>'); });
  api.setToken('test-secret');
  assert.equal((await api.search('Catan & friends')).length, 0);
  const url = new URL(calls[0][0]);
  assert.equal(url.origin, 'https://boardgamegeek.com');
  assert.equal(url.searchParams.get('query'), 'Catan & friends');
  assert.equal(url.searchParams.get('type'), 'boardgame,boardgameexpansion');
  await api.search('Catan & friends');
  assert.equal(calls.length, 1);
  advance();
  api.setToken('replacement');
  await api.search('Catan & friends');
  assert.equal(calls.length, 2);
  assert.equal(calls[1][1].headers.Authorization, 'Bearer replacement');
  api.clearToken();
  await assert.rejects(api.search('Catan & friends'), /Data Sync/);
});

test('BGG requires a saved key, reports HTTP/offline/network errors, and does not cache failures', async () => {
  const missing = client(async () => { throw new Error('must not fetch'); });
  await assert.rejects(missing.api.thing('13'), /Data Sync/);
  for (const [status, pattern] of [[202, /preparing/], [401, /API key/], [403, /API key/], [429, /too frequent/], [503, /busy/], [502, /could not fetch/]]) {
    let calls = 0;
    const { api, advance } = client(async () => { calls++; return new Response('', { status }); });
    api.setToken('test-secret');
    await assert.rejects(api.thing('13'), pattern);
    advance();
    await assert.rejects(api.thing('13'), pattern);
    assert.equal(calls, 2);
  }
  const offline = client(async () => { throw new Error('must not fetch'); });
  offline.api.setToken('test-secret');
  offline.context.navigator.onLine = false;
  await assert.rejects(offline.api.thing('13'), /Reconnect/);
  const network = client(async () => { throw new TypeError('Failed to fetch'); });
  network.api.setToken('test-secret');
  await assert.rejects(network.api.thing('13'), /Could not reach BGG/);
});

test('canceling a queued request prevents it from reaching BGG', async () => {
  let calls = 0;
  const { api, advance } = client(async () => { calls++; return new Response('<items/>'); });
  api.setToken('test-secret');
  await api.search('first');
  const controller = new AbortController();
  const pending = api.search('second', controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(calls, 1);
  advance();
  const next = api.search('third');
  assert.equal(calls, 2, 'Canceling releases the unused request slot');
  await next;
});

test('changing the key cancels an in-flight request', async () => {
  const { api } = client(async (_, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  }));
  api.setToken('test-secret');
  const pending = api.thing('13');
  api.setToken('replacement');
  await assert.rejects(pending, /key changed/);
});

test('BGG image lookups batch at most twenty IDs with statistics for reuse', async () => {
  let call;
  const { api } = client(async (...args) => { call = args; return new Response('', { status: 401 }); });
  api.setToken('test-key');
  await assert.rejects(api.previews(Array.from({ length: 25 }, (_, index) => ({ id: String(index + 1) }))), /access was refused/);
  const url = new URL(call[0]);
  assert.equal(url.pathname, '/xmlapi2/thing');
  assert.equal(url.searchParams.get('id').split(',').length, 20);
  assert.equal(url.searchParams.get('stats'), '1');
  assert.equal((await api.previews([])).length, 0);
});
