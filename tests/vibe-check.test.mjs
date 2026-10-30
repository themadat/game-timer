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
function flow({ confirm = true, start = true } = {}) {
  const listeners = {}, visibility = {}, status = { textContent: '' };
  let markup = '', clock = 1000;
  const node = { focus() {}, setAttribute() {}, textContent: "", dataset: {}, style: {}, clientWidth: 600, clientHeight: 304 };
  const continueButton = { type: 'button', dataset: {}, textContent: '' };
  const body = {
    get innerHTML() { return markup; }, set innerHTML(value) { markup = value; },
    querySelector(selector) { return selector === '[data-vibe-error]' ? status : selector === '[data-vibe-continue]' ? continueButton : node; },
    querySelectorAll() { return []; },
    addEventListener(name, handler) { listeners[name] = handler; }
  };
  const dialog = { dataset: {}, addEventListener(name, handler) { visibility[name] = handler; } };
  const button = { addEventListener(name, handler) { listeners.open = handler; } };
  const state = { preferences: { game: { vibeWeightStep: .25 } }, workspace: { people: ['A', 'B', 'C'].map((name, i) => ({ name, color: ['#ff0000', '#00ff00', '#0000ff'][i] })) } };
  const App = {
    utils: { normalizeColor: (value, fallback) => /^#[0-9a-f]{6}$/.test(value || '') ? value : fallback, escapeHtml: value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;') },
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
  const sandbox = vm.createContext({ window: { LocalApp: App, addEventListener() {} }, document, Math, requestAnimationFrame: callback => callback(), Date: { now: () => clock } });
  vm.runInContext(source, sandbox);
  App.vibeCheck.init();
  listeners.open({ currentTarget: button });
  const form = {
    id: 'vibeSetup',
    reportValidity: () => true,
    querySelectorAll: () => [0, 1, 2].map(value => ({ value: String(value) })),
    elements: { fixed: { checked: true }, heavyGame: { value: '' }, lightGame: { value: '' } }
  };
  const submit = target => listeners.submit({ preventDefault() {}, target });
  const click = (action, answer, digit) => {
    listeners.click({
      detail: 1,
      target: { closest: selector => {
        if (selector === '[data-vibe-digit]') return digit === undefined ? null : { dataset: { vibeDigit: digit } };
        if (selector === '[data-vibe-answer]') return answer === undefined ? null : { dataset: { vibeAnswer: String(answer) } };
        if (selector === '[data-vibe]') return { dataset: { vibe: action }, setAttribute() {} };
        if (selector === 'form') return form;
        return null;
      } }
    });
    // Browsers run the default submit action after click handlers, using the new type.
    if (['setup-tables', 'setup-start'].includes(action) && continueButton.type === 'submit') submit(form);
  };
  for (let i = 0; i < 3; i++) listeners.click({ target: { closest: selector => selector === '[data-vibe-person]' ? { dataset: { vibePerson: String(i) }, setAttribute() {} } : null } });
  click('fixed');
  if (start) { click('setup-tables'); click('setup-start'); }
  const pin = code => { for (const digit of code) click(null, undefined, digit); };
  if (start && confirm) { pin('2468'); pin('2468'); }
  const vote = answers => { click('ready'); answers.forEach(answer => click(null, answer)); click('submit'); };
  const key = key => listeners.keydown({ key, preventDefault() {}, stopPropagation() {} });
  return { vote, click, pin, key, submit: () => submit(form), continueButton, unlock: pin, html: () => markup, status, close: () => visibility.close(), hide: () => { document.hidden = true; visibility.visibilitychange(); document.hidden = false; }, advance: ms => { clock += ms; } };

}

test('Next opens Tables without also submitting setup; the next click opens PIN setup', () => {
  const f = flow({ start: false });
  f.click('setup-tables');
  assert.equal(f.continueButton.textContent, 'Next: set host PIN');
  assert.equal(f.continueButton.type, 'button');
  assert.match(f.html(), /id="vibeSetup"/);
  f.click('setup-start');
  assert.match(f.html(), /Choose host PIN/);
});

test('submitting from People opens Tables before a second submit opens PIN setup', () => {
  const f = flow({ start: false });
  f.submit();
  assert.match(f.html(), /id="vibeSetup"/);
  assert.equal(f.continueButton.textContent, 'Next: set host PIN');
  f.submit();
  assert.match(f.html(), /Choose host PIN/);
});

test('host code gates every result and re-locks when hidden; ending clears the DOM', () => {
  const f = flow();
  for (let i = 0; i < 3; i++) f.vote([true, false, false]);
  assert.match(f.html(), /data-vibe-pin/);
  assert.doesNotMatch(f.html(), /Tonight’s tables|vibe-results|No valid arrangement/);
  f.unlock('0000');
  assert.match(f.html(), /Incorrect PIN/);
  assert.doesNotMatch(f.html(), /vibe-results/);
  f.unlock('2468');
  assert.match(f.html(), /Tonight’s tables/);
  assert.match(f.html(), />A<\/span>/);
  f.click('lock');
  assert.doesNotMatch(f.html(), /<li>/);
  f.unlock('2468');
  assert.match(f.html(), /Tonight’s tables/);
  f.hide();
  assert.match(f.html(), /data-vibe-pin/);
  assert.doesNotMatch(f.html(), /<li>/);
  f.close();
  assert.equal(f.html(), '');
});

test('five wrong codes throttle reveal, including a correct code until cooldown ends', () => {
  const f = flow();
  for (let i = 0; i < 3; i++) f.vote([false, false, true]);
  for (let i = 0; i < 5; i++) f.unlock('9999');
  assert.match(f.html(), /Wait 15 seconds/);
  f.unlock('2468');
  assert.doesNotMatch(f.html(), /Tonight’s tables/);
  f.advance(15000);
  f.unlock('2468');
  assert.match(f.html(), /Out <span>3<\/span>/);
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
  assert.match(f.html(), /Heavy <span>3<\/span>/);
});

test('weight thresholds include the boundary and heavier games, exclude unknowns while filtering', () => {
  const games = [
    { id: 'light', complexityWeight: 1.5 }, { id: 'boundary', complexityWeight: 2.5 },
    { id: 'heavy', complexityWeight: 4.2 }, { id: 'unknown', complexityWeight: null },
    { id: 'missing' }, { id: 'custom', complexityWeight: 5 }
  ];
  const filter = minimum => Array.from(context.window.LocalApp.vibeCheck.filterGames(games, minimum), game => game.id);
  assert.deepEqual(filter('2.5'), ['boundary', 'heavy']);
  assert.deepEqual(filter(''), ['light', 'boundary', 'heavy', 'unknown', 'missing']);
  assert.deepEqual(filter('5'), []);
  assert.equal(games.length, 6);
});

test('freeform targets stay within bounds and never overlap on supported canvas sizes', () => {
  let seed = 888;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const distinct = new Set();
  for (const [width, height, bw, bh] of [[299, 200, 120, 64], [700, 350, 200, 90], [1200, 500, 240, 96]]) {
    for (let i = 0; i < 100; i++) {
      const points = context.window.LocalApp.vibeCheck.answerPositions(width, height, bw, bh, random);
      for (const point of points) {
        assert.ok(point.x >= 0 && point.x + bw <= width);
        assert.ok(point.y >= 0 && point.y + bh <= height);
        distinct.add(point.x.toFixed(2) + ',' + point.y.toFixed(2));
      }
      assert.ok(Math.abs(points[0].x - points[1].x) >= bw + 16 || Math.abs(points[0].y - points[1].y) >= bh + 16);
    }
  }
  assert.ok(distinct.size > 100);
});

test('PIN setup requires confirmation and contains no autofill or credential inputs', () => {
  const f = flow({ confirm: false });
  assert.match(f.html(), /Choose host PIN/);
  assert.doesNotMatch(f.html(), /<input|<textarea|contenteditable/);
  f.pin('2468');
  assert.match(f.html(), /Confirm host PIN/);
  f.pin('1111');
  assert.match(f.html(), /PINs do not match/);
  assert.doesNotMatch(f.html(), /Pass to A|2468/);
  f.pin('2468');
  assert.match(f.html(), /Pass to A/);
});

test('keyboard PIN supports correction; names and colors appear during voting and all three result columns exist', () => {
  const f = flow({ confirm: false });
  f.key('2'); f.key('9'); f.key('Backspace');
  f.key('4'); f.key('6'); f.key('8');
  for (const digit of '2468') f.key(digit);
  f.click('ready');
  assert.match(f.html(), />A<\/span>/);
  assert.match(f.html(), /--person-color:#ff0000/);
  f.click(null, true); f.click(null, false); f.click(null, false); f.click('submit');
  f.vote([true, false, false]); f.vote([true, false, false]); f.unlock('2468');
  for (const kind of ['heavy', 'light', 'out']) assert.match(f.html(), new RegExp('vibe-result-' + kind));
  assert.match(f.html(), /--person-color:#00ff00/);
  assert.match(f.html(), /--person-color:#0000ff/);
  assert.match(f.html(), /Nobody here/);
});

test('hiding during PIN confirmation discards partial PINs and requires a fresh confirmed code', () => {
  const f = flow({ confirm: false });
  f.pin('2468'); f.pin('24'); f.hide();
  assert.match(f.html(), /Choose host PIN/);
  f.pin('9753');
  assert.match(f.html(), /Confirm host PIN/);
  f.pin('9753');
  assert.match(f.html(), /Pass to A/);
  for (let i = 0; i < 3; i++) f.vote([true, false, false]);
  f.unlock('2468');
  assert.doesNotMatch(f.html(), /Tonight’s tables/);
  f.unlock('9753');
  assert.match(f.html(), /Tonight’s tables/);
});

test('default attendee selection matches only the named regulars without adding people', () => {
  const names = ['ADAM', ' Austin ', 'Bryson', 'Johanna', 'Tristen', 'Kathleen', 'Jake', 'Kacie', 'Someone else'];
  const people = names.map(name => ({ name }));
  assert.deepEqual(Array.from(context.window.LocalApp.vibeCheck.defaultAttendees(people)), [0,1,2,3,4,5,6,7]);
  assert.equal(people.length, 9);
  assert.deepEqual(Array.from(context.window.LocalApp.vibeCheck.defaultAttendees([{ name: 'Other' }])), []);
});

test('Light uses an inclusive maximum and zero disables either weight filter', () => {
  const games = [{ id: 'a', complexityWeight: 1 }, { id: 'b', complexityWeight: 2.5 }, { id: 'c', complexityWeight: 4 }, { id: 'unknown', complexityWeight: null }];
  const filter = (weight, direction) => Array.from(context.window.LocalApp.vibeCheck.filterGames(games, weight, direction), game => game.id);
  assert.deepEqual(filter('2.5', 'maximum'), ['a', 'b']);
  assert.deepEqual(filter('0.0', 'maximum'), ['a', 'b', 'c', 'unknown']);
  assert.deepEqual(filter('0.0', 'minimum'), ['a', 'b', 'c', 'unknown']);
});
