import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const read = file => readFileSync(new URL('../assets/js/' + file, import.meta.url), 'utf8');

function element() {
  return { innerHTML: '', textContent: '', content: { childNodes: [], textContent: '' }, appendChild() {}, setAttribute() {} };
}

function load() {
  let current = null;
  const context = vm.createContext({
    window: { LocalApp: {}, crypto: globalThis.crypto, addEventListener() {}, dispatchEvent() {} },
    document: { createElement: element, createDocumentFragment: element, createTextNode: element, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
    Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: {},
    CustomEvent: class { constructor(name, options) { this.type = name; this.detail = options && options.detail; } },
    structuredClone: globalThis.structuredClone,
    console
  });
  context.window.window = context.window;
  for (const file of ['config.js', 'icons.js', 'data/games.js', 'core/utils.js', 'core/state.js']) vm.runInContext(`(function (window) { ${read(file)} })(window);`, context);
  const App = context.window.LocalApp;
  current = App.stateModel.createDefaultState({ demo: false });
  App.storage = { getState: () => current, mutate(callback) { callback(current); current = App.stateModel.normalize(current); return current; } };
  App.components = { toast() {}, confirm: async () => true, openDialog() {}, closeDialog() {} };
  vm.runInContext(`(function (window) { ${read('features/play.js')} })(window);`, context);
  return { App, setState: next => { current = next; } };
}

const turn = (start, duration) => ({ startedAt: start, duration, endedAt: start + duration });

test('player-count fit ranks best, recommended, avoided, and unsupported counts', () => {
  const { App } = load();
  const root = App.play.gameById('root');
  assert.equal(App.play.playerCountFit(root, 4).key, 'best');
  assert.equal(App.play.playerCountFit(root, 3).key, 'good');
  assert.equal(App.play.playerCountFit(root, 2).key, 'avoid');
  assert.equal(App.play.playerCountFit(root, 9).key, 'outside');
  assert.deepEqual([...App.play.parsePlayerCounts('2, 5-6')], [2, 5, 6]);
  assert.equal(App.play.parsePlayerCounts('--').size, 0);
});

test('placements support ties and renumber later ranks', () => {
  const { App } = load();
  const game = { players: ['a', 'b', 'c'].map(id => ({ id, name: id, type: 'player', placement: '', turns: [] })) };
  App.play.stats.applyPlacement(game, 'a', '1');
  App.play.stats.applyPlacement(game, 'b', '1');
  App.play.stats.applyPlacement(game, 'c', '2');
  assert.deepEqual(game.players.map(player => player.placement), ['1', '1', '3']);
  assert.deepEqual(App.play.stats.sortPlayersByPlacement(game.players).map(player => player.id), ['a', 'b', 'c']);
});

test('totals and awards come from recorded turns and pauses', () => {
  const { App } = load();
  const start = 1_000_000;
  const game = {
    gameStartedAt: start,
    firstTurnStartedAt: start + 60_000,
    setupElapsed: 60_000,
    gameEndedAt: start + 600_000,
    pauses: [{ start: start + 300_000, end: start + 330_000, duration: 30_000 }],
    players: [
      { id: 'fast', name: 'Fast', type: 'player', placement: '', turns: [turn(start + 60_000, 20_000), turn(start + 120_000, 30_000)] },
      { id: 'slow', name: 'Slow', type: 'player', placement: '', turns: [turn(start + 80_000, 90_000)] }
    ]
  };
  const totals = App.play.stats.gameTotals(game);
  assert.equal(totals.total, 600_000);
  assert.equal(totals.setup, 60_000);
  assert.equal(totals.paused, 30_000);
  assert.equal(totals.play, 510_000);
  assert.equal(totals.turns, 3);
  const awards = App.play.stats.computeAwards(game);
  assert.equal(awards.fastestAverage, 'fast');
  assert.equal(awards.slowestTurn, 'slow');
});

test('state keeps valid history, library, people, and custom games while dropping junk', () => {
  const { App } = load();
  const normalized = App.stateModel.normalize({
    workspace: {
      people: [{ name: 'Adam', color: '#EF4444' }, { name: 'adam' }, { name: '' }],
      library: {
        games: { catan: { owned: true, owners: ['Adam', 'Adam'] }, root: { owned: false }, scythe: { wishlist: true, rating: 9 } },
        customGames: [{ name: 'Wingspan', minPlayers: 1, maxPlayers: 5, bestPlayers: '3-4' }, { name: '' }]
      },
      history: [
        { id: 'g1', gameId: 'catan', gameName: 'Catan', gameStartedAt: 10, gameEndedAt: 20, players: [{ name: 'Adam', type: 'player', placement: '1', turns: [{ duration: 5 }] }] },
        { id: 'bad', gameStartedAt: 30, gameEndedAt: 20, players: [] }
      ]
    }
  });
  assert.deepEqual(normalized.workspace.people.map(person => person.name), ['Adam']);
  assert.equal(normalized.workspace.people[0].color, '#ef4444');
  assert.deepEqual(normalized.workspace.library.games.catan.owners, ['Adam']);
  assert.equal(normalized.workspace.library.games.root, undefined);
  assert.equal(normalized.workspace.library.games.scythe.rating, 5);
  assert.equal(normalized.workspace.library.customGames.length, 1);
  assert.match(normalized.workspace.library.customGames[0].id, /^custom-/);
  assert.deepEqual(normalized.workspace.history.map(record => record.id), ['g1']);
  assert.equal(normalized.preferences.game.keepAwake, true);
});

test('new installs start with the default people and no history', () => {
  const { App } = load();
  const state = App.stateModel.normalize(App.stateModel.createDefaultState({ demo: false }));
  assert.ok(state.workspace.people.length >= 2);
  assert.deepEqual(state.workspace.history, []);
  assert.equal(state.ui.view, 'play');
});
