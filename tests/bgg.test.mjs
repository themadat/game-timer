import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { createBggProxy } from '../services/bgg/worker.mjs';

const fixture = name => readFileSync(new URL('./fixtures/bgg-' + name + '.xml', import.meta.url), 'utf8');
const env = { BGG_TOKEN: 'test-secret', ALLOWED_ORIGIN: 'https://app.example' };
const request = (path, origin = env.ALLOWED_ORIGIN, method = 'GET') => new Request('https://bgg.example' + path, { method, headers: { Origin: origin } });
function harness(options = {}) {
  const calls = [], entries = new Map();
  const cache = { async match(key) { return entries.get(key.url)?.clone(); }, async put(key, value) { entries.set(key.url, value); } };
  const proxy = createBggProxy({ cache, minimumInterval: 0, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return new Response(fixture(url.includes('/search?') ? 'search' : 'thing'));
  }, ...options });
  return { proxy, calls, entries };
}

test('BGG proxy sends the secret upstream only, adds stats, and caches by canonical request', async () => {
  const { proxy, calls, entries } = harness();
  const first = await proxy(request('/thing?id=13'), env);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('access-control-allow-origin'), env.ALLOWED_ORIGIN);
  assert.equal(first.headers.get('cache-control'), 'no-store');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-secret');
  assert.equal(calls[0].url, 'https://boardgamegeek.com/xmlapi2/thing?id=13&stats=1');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal((await proxy(request('/thing?id=13'), env)).status, 200);
  assert.equal(calls.length, 1);
  assert.equal(entries.size, 1);
  assert.ok(!JSON.stringify([...first.headers]).includes(env.BGG_TOKEN));
  assert.ok(!(await first.text()).includes(env.BGG_TOKEN));
  await proxy(request('/search?query=Catan'), env);
  assert.match(calls[1].url, /type=boardgame%2Cboardgameexpansion/);
});

test('BGG proxy rejects unrelated origins, arbitrary endpoints, invalid IDs and credentials in queries', async () => {
  const { proxy, calls } = harness();
  for (const [path, origin, status] of [
    ['/thing?id=13', 'https://other.example', 403], ['/plays?username=someone', env.ALLOWED_ORIGIN, 404],
    ['/thing?id=0', env.ALLOWED_ORIGIN, 400], ['/thing?id=13,14', env.ALLOWED_ORIGIN, 400],
    ['/thing?id=13&token=secret', env.ALLOWED_ORIGIN, 400], ['/search?query=', env.ALLOWED_ORIGIN, 400]
  ]) assert.equal((await proxy(request(path, origin), env)).status, status);
  assert.equal((await proxy(request('/thing?id=13', env.ALLOWED_ORIGIN, 'POST'), env)).status, 405);
  assert.equal((await proxy(request('/thing?id=13'), { ...env, BGG_TOKEN: '' })).status, 503);
  assert.equal(calls.length, 0);
});

test('BGG proxy never caches queued, authentication, throttling or malformed responses', async () => {
  for (const [status, expected] of [[202, 202], [401, 401], [403, 403], [429, 429], [500, 503]]) {
    let calls = 0;
    const { proxy, entries } = harness({ fetchImpl: async () => { calls++; return new Response('private upstream error', { status }); } });
    const response = await proxy(request('/thing?id=13'), env);
    assert.equal(response.status, expected);
    assert.ok(!(await response.text()).includes('private upstream error'));
    await proxy(request('/thing?id=13'), env);
    assert.equal(calls, 2);
    assert.equal(entries.size, 0);
  }
  for (const body of ['<html>Unavailable</html>', '<!DOCTYPE items><items/>', 'x'.repeat(2000001)]) {
    const { proxy, entries } = harness({ fetchImpl: async () => new Response(body) });
    assert.equal((await proxy(request('/thing?id=13'), env)).status, 502);
    assert.equal(entries.size, 0);
  }
});

test('BGG proxy coalesces duplicate requests and limits queued requests', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const { proxy } = harness({ fetchImpl: async () => { calls++; await gate; return new Response(fixture('thing')); } });
  const first = proxy(request('/thing?id=13'), env);
  const duplicate = proxy(request('/thing?id=13'), env);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls, 1);
  const second = proxy(request('/thing?id=14'), env);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal((await proxy(request('/thing?id=15'), env)).status, 429);
  release();
  assert.deepEqual((await Promise.all([first, duplicate, second])).map(response => response.status), [200, 200, 200]);
});

function client(fetchImpl) {
  const saved = new Map();
  const context = vm.createContext({
    window: { LocalApp: { config: { bgg: { apiUrl: 'https://bgg.example' } } } },
    localStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) },
    navigator: { onLine: true }, URL, AbortController, setTimeout, clearTimeout, fetch: fetchImpl
  });
  vm.runInContext(readFileSync(new URL('../assets/js/core/bgg.js', import.meta.url), 'utf8'), context);
  return { api: context.window.LocalApp.bgg, saved, context };
}

test('BGG client validates device-only service URLs and keeps credentials out of requests', async () => {
  let call;
  const { api, saved } = client(async (...args) => { call = args; return new Response('', { status: 401 }); });
  for (const value of ['http://public.example', 'https://user:secret@bgg.example', 'https://bgg.example?token=secret', 'javascript:alert(1)']) assert.throws(() => api.setEndpoint(value));
  api.setEndpoint('http://127.0.0.1:8080/api/bgg/');
  assert.equal(api.endpoint(), 'http://127.0.0.1:8080/api/bgg');
  assert.equal(saved.size, 1);
  await assert.rejects(api.thing('13'), /access was refused/);
  assert.equal(call[0], 'http://127.0.0.1:8080/api/bgg/thing?id=13');
  assert.equal(call[1].credentials, 'omit');
  assert.equal(call[1].headers, undefined);
  api.setEndpoint('');
  assert.equal(api.endpoint(), 'https://bgg.example');
});

test('BGG client reports queued, busy, offline and canceled requests without parsing XML', async () => {
  for (const [status, pattern] of [[202, /preparing/], [429, /too frequent/], [503, /busy/], [502, /could not fetch/]]) {
    const { api } = client(async () => new Response('', { status }));
    await assert.rejects(api.thing('13'), pattern);
  }
  const offline = client(async () => { throw new Error('must not fetch'); });
  offline.context.navigator.onLine = false;
  await assert.rejects(offline.api.thing('13'), /Reconnect/);
  const controller = new AbortController();
  const { api } = client(async (_, options) => { options.signal.throwIfAborted(); });
  controller.abort();
  await assert.rejects(api.thing('13', controller.signal), { name: 'AbortError' });
});
