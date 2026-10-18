import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8');
const html = read('index.html');
const scripts = [...html.matchAll(/data-app-src="([^"]+)"/g)].map(match => match[1]);
const links = [...html.matchAll(/data-app-asset="([^"]+)"/g)].map(match => match[1]);

async function boot(failPath, version) {
  const loaded = [], errors = [];
  const markedLinks = links.map(path => ({ getAttribute: () => path }));
  const context = vm.createContext({
    window: {}, Date,
    document: {
      createElement: () => ({ setAttribute() {} }),
      querySelectorAll: selector => selector.startsWith('link') ? markedLinks : scripts.map(path => ({ getAttribute: () => path })),
      body: { prepend: message => errors.push(message.textContent) },
      head: { appendChild(script) {
        loaded.push(script.src);
        if (script.src.startsWith(failPath || 'never-fail')) return script.onerror();
        if (script.src.startsWith('assets/js/config.js')) {
          vm.runInContext(read('assets/js/config.js'), context);
          if (version) context.window.LocalApp.config = { identity: { version } };
        }
        script.onload();
      } }
    }
  });
  await vm.runInContext(read('assets/js/boot.js'), context);
  return { loaded, errors, markedLinks, config: context.window.LocalApp?.config };
}

test('one version source controls ordered scripts, links, and release identity', async () => {
  const result = await boot();
  assert.equal(result.config.identity.version, result.config.identity.buildId);
  assert.equal(result.config.releases[0].version, result.config.identity.version);
  assert.match(result.loaded[0], /^assets\/js\/config.js\?boot=\d+$/);
  assert.deepEqual(result.loaded.slice(1), scripts.map(path => path + '?v=' + result.config.identity.version));
  assert.deepEqual(result.markedLinks.map(link => link.href), links.map(path => path + '?v=' + result.config.identity.version));
  for (const path of [...scripts, ...links]) assert.ok(existsSync(new URL(path, root)), path);
  assert.deepEqual(result.errors, []);
  const next = await boot(undefined, '9.8.7.6');
  assert.ok(next.loaded.slice(1).every(path => path.endsWith('?v=9.8.7.6')));
});

test('script failure stops startup and displays a recovery message', async () => {
  const result = await boot(scripts[1]);
  assert.equal(result.loaded.length, 3);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /Reconnect and reload/);
});
