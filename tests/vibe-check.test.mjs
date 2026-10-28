import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../assets/js/features/vibe-check.js', import.meta.url), 'utf8');
const context = vm.createContext({ window: { LocalApp: {} }, Math });
vm.runInContext(source, context);
const solve = (ballots, limits = defaults, random) => {
  const result = context.window.LocalApp.vibeCheck.solve(ballots, limits, random);
  return result === null ? null : Array.from(result);
};
const defaults = { heavy: { min: 3, max: 200 }, light: { min: 3, max: 200 } };
const either = count => Array.from({ length: count }, () => ['heavy', 'light']);
const counts = result => ['heavy', 'light', 'out'].map(option => result.filter(value => value === option).length);

test('six, seven and eight willing people form balanced tables', () => {
  for (const n of [6, 7, 8]) {
    const result = solve(either(n));
    assert.deepEqual(counts(result).slice(0, 2).sort(), [Math.floor(n / 2), Math.ceil(n / 2)]);
  }
});

test('six attendees with one sitting out produce one five-person table', () => {
  const result = solve([...either(5), ['out']]);
  assert.deepEqual(counts(result).sort(), [0, 1, 5]);
  assert.equal(result[5], 'out');
});

test('two heavy volunteers can join a light table only if they accept it', () => {
  assert.deepEqual(counts(solve([['heavy', 'light'], ['heavy', 'light'], ...Array.from({ length: 5 }, () => ['light'])])), [0, 7, 0]);
  assert.equal(solve([['heavy'], ['heavy'], ...Array.from({ length: 5 }, () => ['light'])]), null);
});

test('a player is never forced into an unselected table or sitting out', () => {
  const ballots = [['heavy'], ['heavy'], ['heavy'], ['light', 'out'], ['light', 'out'], ['out']];
  assert.deepEqual(solve(ballots), ['heavy', 'heavy', 'heavy', 'out', 'out', 'out']);
  assert.equal(solve([['heavy'], ['heavy'], ['light']]), null);
});

test('optional sit out never reduces the number seated to manufacture two tables', () => {
  const ballots = Array.from({ length: 7 }, () => ['heavy', 'light', 'out']);
  assert.equal(counts(solve(ballots))[2], 0);
  assert.deepEqual(counts(solve([['heavy', 'out'], ['heavy', 'out'], ['heavy', 'out'], ['out']])), [3, 0, 1]);
});

test('game minimums and maximums constrain splits and can make a round infeasible', () => {
  assert.deepEqual(counts(solve(either(7), { heavy: { min: 3, max: 3 }, light: { min: 4, max: 4 } })), [3, 4, 0]);
  assert.equal(solve([...either(5), ['out']], { heavy: { min: 3, max: 4 }, light: { min: 3, max: 4 } }), null);
  assert.deepEqual(counts(solve(either(8), { heavy: { min: 5, max: 5 }, light: { min: 3, max: 3 } })), [5, 3, 0]);
  assert.equal(solve([['heavy'], ['heavy']], { heavy: { min: 1, max: 2 }, light: { min: 1, max: 2 } }), null);
});

test('everyone may sit out and an empty ballot is infeasible', () => {
  assert.deepEqual(solve([['out'], ['out'], ['out']]), ['out', 'out', 'out']);
  assert.equal(solve([[], ['heavy'], ['heavy']]), null);
});

test('tied assignments vary without changing a ballot', () => {
  const ballots = either(7);
  assert.notDeepEqual(solve(ballots, defaults, () => 0), solve(ballots, defaults, () => 0.999999));
  assert.deepEqual(ballots, either(7));
});

function score(assignments) {
  const [h, l] = counts(assignments);
  return [h + l, Number(h > 0) + Number(l > 0), -Math.abs(h - l)];
}
function compare(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}
function bruteForce(ballots, limits) {
  let best = null;
  function visit(assignment) {
    if (assignment.length < ballots.length) {
      for (const option of ballots[assignment.length]) visit([...assignment, option]);
      return;
    }
    const [h, l] = counts(assignment);
    if ((h && (h < Math.max(3, limits.heavy.min) || h > limits.heavy.max)) || (l && (l < Math.max(3, limits.light.min) || l > limits.light.max))) return;
    const candidate = score(assignment);
    if (!best || compare(candidate, best) > 0) best = candidate;
  }
  visit([]);
  return best;
}

test('dynamic matching agrees with exhaustive search on mixed ballots and limits', () => {
  let seed = 73823;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let sample = 0; sample < 120; sample++) {
    const ballots = Array.from({ length: 3 + Math.floor(random() * 6) }, () => {
      const bits = 1 + Math.floor(random() * 7);
      return ['heavy', 'light', 'out'].filter((_, i) => bits & (1 << i));
    });
    const limits = { heavy: { min: 1 + Math.floor(random() * 5), max: 3 + Math.floor(random() * 6) }, light: { min: 3, max: 3 + Math.floor(random() * 6) } };
    const result = solve(ballots, limits, random);
    assert.deepEqual(result && score(result), bruteForce(ballots, limits));
    if (result) result.forEach((option, i) => assert.ok(ballots[i].includes(option)));
  }
});

// Exercise the registered DOM handlers without exporting ballots or auth internals.
function flow() {
  const listeners = {}, visibility = {}, status = { textContent: '' };
  let markup = '', clock = 1000;
  const node = { focus() {} };
  const body = {
    get innerHTML() { return markup; }, set innerHTML(value) { markup = value; },
    querySelector(selector) { return selector === '[data-vibe-error]' ? status : node; },
    addEventListener(name, handler) { listeners[name] = handler; }
  };
  const dialog = { addEventListener(name, handler) { visibility[name] = handler; } };
  const button = { addEventListener(name, handler) { listeners.open = handler; } };
  const state = { workspace: { people: ['A', 'B', 'C'].map(name => ({ name })) } };
  const App = {
    utils: { escapeHtml: value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;') },
    icons: { markup: () => '' }, config: { controls: { maxPeople: 200 } },
    storage: { getState: () => state, mutate() { throw Error('Vibe Check must not persist private data'); } },
    components: { openDialog() {} },
    play: { allGames: () => [], gameById: () => null, gameAccessibleName: name => name }
  };
  const document = {
    hidden: false,
    querySelector: selector => ({ '#vibeCheckDialog': dialog, '#vibeCheckBody': body, '#vibeCheckButton': button })[selector],
    addEventListener(name, handler) { visibility[name] = handler; }
  };
  const sandbox = vm.createContext({ window: { LocalApp: App }, document, Math, Date: { now: () => clock } });
  vm.runInContext(source, sandbox);
  App.vibeCheck.init();
  listeners.open({ currentTarget: button });
  const form = {
    id: 'vibeSetup',
    querySelectorAll: () => [0, 1, 2].map(value => ({ value: String(value) })),
    elements: { passcode: { value: '2468' }, confirmation: { value: '2468' }, fixed: { checked: true }, heavyGame: { value: '' }, lightGame: { value: '' } }
  };
  const submit = target => listeners.submit({ preventDefault() {}, target });
  submit(form);
  const click = (action, answer) => listeners.click({
    detail: 1,
    target: { closest: selector => selector === '[data-vibe-answer]' ? (answer === undefined ? null : { dataset: { vibeAnswer: String(answer) } }) : { dataset: { vibe: action } } }
  });
  const vote = answers => { click('ready'); answers.forEach(answer => click(null, answer)); click('submit'); };
  const unlock = code => {
    const unlockForm = { id: 'vibeUnlock', elements: { code: { value: code } }, reset() { this.elements.code.value = ''; } };
    submit(unlockForm);
    assert.equal(unlockForm.elements.code.value, '');
  };
  return { vote, click, unlock, html: () => markup, status, close: () => visibility.close(), hide: () => { document.hidden = true; visibility.visibilitychange(); document.hidden = false; }, advance: ms => { clock += ms; } };
}

test('host code gates every result and re-locks when hidden; ending clears the DOM', () => {
  const f = flow();
  for (let i = 0; i < 3; i++) f.vote([true, false, false]);
  assert.match(f.html(), /id="vibeUnlock"/);
  assert.doesNotMatch(f.html(), /Tonight’s tables|vibe-results|No valid arrangement/);
  f.unlock('0000');
  assert.match(f.status.textContent, /Incorrect passcode/);
  assert.doesNotMatch(f.html(), /vibe-results/);
  f.unlock('2468');
  assert.match(f.html(), /Tonight’s tables/);
  assert.match(f.html(), /<li>A<\/li>/);
  f.click('lock');
  assert.doesNotMatch(f.html(), /<li>/);
  f.unlock('2468');
  assert.match(f.html(), /Tonight’s tables/);
  f.hide();
  assert.match(f.html(), /id="vibeUnlock"/);
  assert.doesNotMatch(f.html(), /<li>/);
  f.close();
  assert.equal(f.html(), '');
});

test('five wrong codes throttle reveal, including a correct code until cooldown ends', () => {
  const f = flow();
  for (let i = 0; i < 3; i++) f.vote([false, false, true]);
  for (let i = 0; i < 5; i++) f.unlock('9999');
  assert.match(f.status.textContent, /Wait 15 seconds/);
  f.unlock('2468');
  assert.doesNotMatch(f.html(), /Tonight’s tables/);
  f.advance(15000);
  f.unlock('2468');
  assert.match(f.html(), /Sitting out · 3/);
});

test('an impossible split is hidden until the host unlocks', () => {
  const f = flow();
  f.vote([true, false, false]);
  f.vote([true, false, false]);
  f.vote([false, true, false]);
  assert.doesNotMatch(f.html(), /No valid arrangement/);
  f.unlock('2468');
  assert.match(f.html(), /No valid arrangement/);
});

test('empty ballots retry the same voter and backgrounding discards only the current ballot', () => {
  const f = flow();
  f.vote([false, false, false]);
  assert.match(f.html(), /Pass to A/);
  assert.match(f.html(), /Choose at least one/);
  f.vote([true, false, false]);
  f.click('ready');
  f.click(null, true);
  f.hide();
  assert.match(f.html(), /Pass to B/);
  f.vote([true, false, false]);
  f.vote([true, false, false]);
  f.unlock('2468');
  assert.match(f.html(), /Heavy · 3/);
});
