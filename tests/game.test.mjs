import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const read = file => readFileSync(new URL('../assets/js/' + file, import.meta.url), 'utf8');

function element() {
  return { innerHTML: '', textContent: '', content: { childNodes: [], textContent: '' }, appendChild() {}, setAttribute() {} };
}

function load({ setupHarness = false, random = Math.random } = {}) {
  let current = null;
  const context = vm.createContext({
    window: { LocalApp: {}, crypto: globalThis.crypto, addEventListener() {}, dispatchEvent() {} },
    document: { documentElement: { dataset: { motion: "reduce" } }, createElement: element, createDocumentFragment: element, createTextNode: element, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
    Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: {},
    CustomEvent: class { constructor(name, options) { this.type = name; this.detail = options && options.detail; } },
    Math: Object.assign(Object.create(Math), { random }),
    structuredClone: globalThis.structuredClone,
    console
  });
  context.window.window = context.window;
  for (const file of ['config.js', 'icons.js', 'data/games.js', 'core/utils.js', 'core/state.js']) vm.runInContext(`(function (window) { ${read(file)} })(window);`, context);
  const App = context.window.LocalApp;
  current = App.stateModel.createDefaultState({ demo: false });
  App.storage = { getState: () => current, mutate(callback) { callback(current); current = App.stateModel.normalize(current); return current; } };
  App.components = { toast() {}, confirm: async () => true, openDialog() {}, closeDialog() {} };
  let playSource = read('features/play.js');
  if (setupHarness) playSource = playSource.replace('  App.play = {', `
    render = () => {};
    App.play = {
      setupTest: { chooseSetupStarter, shuffleSetupOrder, startGame, pickFirstPlayer, hydrateFromSnapshot, buildSessionSnapshot, handleChange },`);
  vm.runInContext(`(function (window) { ${playSource} })(window);`, context);
  const librarySource = setupHarness ? read('features/library.js').replace('  App.library = {', '  App.library = { deleteTest: { removeLibraryGame, deleteCustomGame, edit: id => { editingCustomGameId = id; } },') : read('features/library.js');
  vm.runInContext(`(function (window) { ${librarySource} })(window);`, context);
  return { App, setState: next => { current = next; } };
}

const turn = (start, duration) => ({ startedAt: start, duration, endedAt: start + duration });

test('weight and BGG rating preserve full decimal precision through normalization and sync', () => {
  const { App } = load();
  const model = App.stateModel;
  const state = model.createDefaultState({ demo: false });
  state.workspace.library.customGames.push({ id: 'custom-decimal', name: 'Decimal game', complexityWeight: 2.3456789 });
  state.workspace.library.games['custom-decimal'] = { metadata: { bggRating: 7.44999, additionalTypes: ['Family', 'Strategy'], catalog: { complexityWeight: 3.99991 } } };
  const normalized = model.normalize(state);
  const game = normalized.workspace.library.customGames.find(game => game.id === 'custom-decimal');
  assert.equal(game.complexityWeight, 2.3456789);
  const entry = normalized.workspace.library.games['custom-decimal'];
  assert.equal(entry.metadata.catalog.complexityWeight, 3.99991);
  assert.equal(entry.metadata.bggRating, 7.44999);
  assert.deepEqual([...entry.metadata.additionalTypes], ['Family', 'Strategy']);
  const roundTrip = model.prepareSync(model.syncPayload(normalized)).state;
  assert.deepEqual(roundTrip.workspace.library.games['custom-decimal'].metadata, entry.metadata);
});

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
  assert.deepEqual([...normalized.workspace.people].map(person => person.name), ['Adam']);
  assert.equal(normalized.workspace.people[0].color, '#ef4444');
  assert.deepEqual([...normalized.workspace.library.games.catan.owners], ['Adam']);
  assert.equal(normalized.workspace.library.games.root, undefined);
  assert.equal(normalized.workspace.library.games.scythe.rating, 5);
  assert.equal(normalized.workspace.library.customGames.length, 1);
  assert.match(normalized.workspace.library.customGames[0].id, /^custom-/);
  assert.deepEqual([...normalized.workspace.history].map(record => record.id), ['g1']);
  assert.equal(normalized.preferences.game.keepAwake, true);
});

test('new installs start with the default people and no history', () => {
  const { App } = load();
  const state = App.stateModel.normalize(App.stateModel.createDefaultState({ demo: false }));
  assert.ok(state.workspace.people.length >= 2);
  assert.deepEqual([...state.workspace.history], []);
  assert.equal(state.ui.view, 'play');
});

test('sync payload carries library, history, and people and merges separate devices', () => {
  const { App } = load();
  const model = App.stateModel;
  const record = (id, gameEndedAt) => ({ id, gameId: 'catan', gameName: 'Catan', gameStartedAt: gameEndedAt - 10, gameEndedAt, players: [{ name: 'Adam', type: 'player', placement: '1', turns: [] }] });
  const local = model.normalize({ workspace: { people: [{ name: 'Adam' }], library: { games: { catan: { owned: true, owners: ['Adam'] } } }, history: [record('g1', 20)] }, preferences: { game: { timeFormat: 'units' } } });
  const remote = model.normalize({ workspace: { people: [{ name: 'Adam' }, { name: 'Kacie' }], library: { games: { root: { wishlist: true } } }, history: [record('g2', 40)] } });
  const payload = model.syncPayload(local);
  assert.deepEqual(Object.keys(payload.data).sort(), ['history', 'libraryGames', 'people']);
  assert.equal(model.prepareSync(payload).state.workspace.history[0].id, 'g1');
  const merged = model.merge(local, remote);
  assert.deepEqual([...merged.workspace.history].map(item => item.id), ['g2', 'g1']);
  assert.deepEqual(Object.keys(merged.workspace.library.games).sort(), ['catan', 'root']);
  assert.deepEqual([...merged.workspace.people].map(person => person.name), ['Adam', 'Kacie']);
  assert.equal(merged.preferences.game.timeFormat, 'units');
  const edited = model.normalize(JSON.parse(JSON.stringify(remote)));
  edited.workspace.library.games.catan = { owned: true, owners: ['Kacie'] };
  assert.equal(model.canMerge(local, edited), false);
});

test('library sheet metadata survives normalization and sync without changing history', () => {
  const { App } = load();
  const model = App.stateModel;
  const state = model.createDefaultState({ demo: false });
  state.workspace.library.games.root = { metadata: { year: '2018', bggRating: '8.125', category: 'Strategy', bggId: '237182' } };
  state.workspace.library.games.catan = { metadata: { year: 'oops', bggRating: 15, bggId: 'javascript:alert(1)' }, owned: true, rating: 4, note: 'Keep' };
  Object.assign(state.modules.library, { sortBy: 'bggRating', category: 'Strategy', verified: 'yes' });
  const normalized = model.normalize(state);
  assert.deepEqual(JSON.parse(JSON.stringify(normalized.workspace.library.games.root.metadata)), { year: 2018, bggRating: 8.125, category: 'Strategy', bggId: '237182' });
  assert.equal(normalized.workspace.library.games.catan.metadata.year, null);
  assert.equal(normalized.workspace.library.games.catan.metadata.bggRating, null);
  assert.equal(normalized.workspace.library.games.catan.metadata.bggId, '');
  assert.equal(normalized.workspace.library.games.catan.note, 'Keep');
  assert.equal(normalized.modules.library.sortBy, 'bggRating');
  assert.equal(normalized.modules.library.category, 'all');
  assert.equal(normalized.modules.library.verified, 'yes');
  const restored = model.prepareSync(model.syncPayload(normalized)).state;
  assert.equal(restored.workspace.library.games.root.metadata.bggId, '237182');
  assert.deepEqual(restored.workspace.history, normalized.workspace.history);
});

test('half-star ratings persist through normalization and sync with owner sorting', () => {
  const { App } = load();
  const model = App.stateModel;
  const state = model.createDefaultState({ demo: false });
  state.workspace.library.games.root = { rating: 3.5 };
  state.workspace.library.games.catan = { rating: 0.5 };
  state.workspace.library.games.scythe = { rating: 9 };
  state.modules.library.sortBy = 'owners';
  const normalized = model.normalize(state);
  assert.equal(normalized.workspace.library.games.root.rating, 3.5);
  assert.equal(normalized.workspace.library.games.catan.rating, 0.5);
  assert.equal(normalized.workspace.library.games.scythe.rating, 5);
  assert.equal(normalized.modules.library.sortBy, 'owners');
  const restored = model.prepareSync(model.syncPayload(normalized)).state;
  assert.equal(restored.workspace.library.games.root.rating, 3.5);
  assert.equal(model.normalize(restored).workspace.library.games.catan.rating, 0.5);
  assert.deepEqual(restored.workspace.history, normalized.workspace.history);
});

test('What’s New visibility is a persistent preference with backward-compatible defaults', () => {
  const { App } = load();
  const model = App.stateModel;
  const defaults = model.normalize({});
  assert.equal(defaults.preferences.controls.showWhatsNew, true);
  const state = model.normalize({ preferences: { controls: { showWhatsNew: false } }, workspace: { library: { games: { root: { rating: 3.5 } } } } });
  assert.equal(model.normalize(JSON.parse(JSON.stringify(state))).preferences.controls.showWhatsNew, false);
  const reset = model.resetPreferences(state);
  assert.equal(reset.preferences.controls.showWhatsNew, true);
  assert.equal(reset.workspace.library.games.root.rating, 3.5);
  assert.equal(JSON.stringify(reset.workspace.history), JSON.stringify(state.workspace.history));
});

const pasteFixture = name => readFileSync(new URL('./fixtures/' + name, import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

test('BGG correction paste reads primary identity, ranges and full tags without admin actions', () => {
  const { App } = load();
  const parsed = App.library.parseBggPaste(pasteFixture('bgg-correction.txt'));
  assert.equal(parsed.fields.name, 'Dune');
  assert.equal(parsed.fields.year, 2019);
  assert.equal(parsed.fields.minPlayers, 2);
  assert.equal(parsed.fields.maxPlayers, 6);
  assert.equal(parsed.fields.minMinutes, 120);
  assert.equal(parsed.fields.maxMinutes, 180);
  assert.match(parsed.fields.category, /Science Fiction/);
  assert.ok(parsed.fields.mechanisms.includes('Variable Player Powers'));
  assert.deepEqual(plain(parsed.fields.expansions), ['Dune: CHOAM & Richese']);
  assert.equal(parsed.fields.category.split(', ').filter(tag => tag === 'Negotiation').length, 1);
  assert.doesNotMatch(parsed.fields.category, /Bill Eberle|CHOAM|Animals: Worms|Remove/);
  assert.equal(parsed.fields.bggRating, undefined);
  assert.equal(App.library.parseBggPaste('Edit Name\nDune').fields.name, 'Dune');
});

test('BGG overview prefers the primary game over reimplementation links and rating counts', () => {
  const { App } = load();
  assert.deepEqual(plain(App.library.parseBggPaste(pasteFixture('bgg-overview.md')).fields), {
    name: 'Dune', bggId: '283355', year: 2019, minPlayers: 2, maxPlayers: 6,
    minMinutes: 120, maxMinutes: 180, complexityWeight: 3.98, bggRating: 7.9
  });
  const text = '7.9\nDune (2019)\n2–6 Players\n120–180 Min\nWeight: 3.98 / 5';
  const fields = App.library.parseBggPaste(text).fields;
  assert.equal(fields.bggRating, 7.9);
  assert.equal(fields.complexityWeight, 3.98);
  assert.equal(fields.bggId, undefined);
});

test('BGG polls use dominant votes, skip open-ended counts and leave ties neutral', () => {
  const { App } = load();
  const result = App.library.parseBggPaste(pasteFixture('bgg-poll.md'));
  assert.deepEqual(plain(result.fields), { bestPlayers: '6', recommendedPlayers: '5', avoidPlayers: '1, 2, 3, 4' });
  assert.match(result.warnings.join(' '), /Open-ended/);
  const tabbed = 'Players\tBest\tRecommended\tNot Recommended\n2\t50% (5)\t50% (5)\t0% (0)\n3\t80% (8)\t10% (1)\t10% (1)';
  const ties = App.library.parseBggPaste(tabbed);
  assert.equal(ties.fields.bestPlayers, '3');
  assert.equal(ties.fields.recommendedPlayers, '--');
  assert.match(ties.warnings.join(' '), /Tied votes at 2/);
  const rounded = App.library.parseBggPaste('Best | Recommended | Not Recommended\n| 4 | 50.0% (1000) | 50.0% (1001) | 0% (0) | 2001 |');
  assert.equal(rounded.fields.recommendedPlayers, '4');
});

test('BGG parser combines all three formats and refuses unsupported or reversed ranges', () => {
  const { App } = load();
  const combined = App.library.parseBggPaste(['bgg-correction.txt', 'bgg-overview.md', 'bgg-poll.md'].map(pasteFixture).join('\n'));
  assert.equal(combined.fields.bggId, '283355');
  assert.equal(combined.fields.bestPlayers, '6');
  assert.ok(combined.fields.mechanisms.includes('Variable Player Powers'));
  assert.deepEqual(plain(App.library.parseBggPaste('Submit Correction\nNotes to Admin\nDesigner\nRemove John').fields), {});
  const bad = App.library.parseBggPaste('Edit Minimum Players 6\nEdit Maximum Players 2\nWeight: 12 / 5\n9999–10000 Min');
  assert.equal(bad.fields.minPlayers, undefined);
  assert.equal(bad.fields.maxMinutes, undefined);
  assert.equal(bad.fields.complexityWeight, undefined);
  assert.ok(bad.warnings.length >= 2);
});

test('pasted catalog overrides survive sync, update Play and preserve user data and history', () => {
  const { App } = load();
  const model = App.stateModel;
  const state = model.createDefaultState({ demo: false });
  const parsed = App.library.parseBggPaste(['bgg-correction.txt', 'bgg-overview.md', 'bgg-poll.md'].map(pasteFixture).join('\n')).fields;
  state.workspace.library.games.root = { owned: true, owners: ['Adam'], rating: 4.5, note: 'Keep my note', metadata: {
    year: parsed.year, bggId: parsed.bggId, bggRating: parsed.bggRating, category: parsed.category, mechanisms: parsed.mechanisms, expansions: parsed.expansions, mainTag: "Science Fiction",
    catalog: { minMinutes: 120, maxMinutes: 180, complexityWeight: 3.98, bestPlayers: '6', recommendedPlayers: '5', avoidPlayers: '1, 2, 3, 4', colors: ['malicious'], unknown: true }
  } };
  const normalized = model.normalize(state);
  const entry = normalized.workspace.library.games.root;
  assert.equal(entry.metadata.catalog.complexityWeight, 3.98);
  assert.equal(entry.metadata.catalog.colors, undefined);
  assert.equal(entry.metadata.catalog.unknown, undefined);
  assert.ok(entry.metadata.mechanisms.includes('Variable Player Powers'));
  assert.equal(entry.metadata.mainTag, 'Science Fiction');
  const restored = model.prepareSync(model.syncPayload(normalized)).state;
  App.storage.mutate(next => { next.workspace.library = restored.workspace.library; });
  assert.equal(App.play.gameById('root').minMinutes, 120);
  assert.equal(App.play.gameById('root').bestPlayers, '6');
  assert.ok(App.play.gameById('root').colors.length > 1);
  assert.equal(restored.workspace.library.games.root.rating, 4.5);
  assert.equal(restored.workspace.library.games.root.note, 'Keep my note');
  assert.deepEqual([...restored.workspace.library.games.root.owners], ['Adam']);
  assert.equal(JSON.stringify(restored.workspace.history), JSON.stringify(state.workspace.history));
});

test('catalog normalization drops unsupported fields and invalid-only overrides', () => {
  const { App } = load();
  const normalized = App.stateModel.normalize({ workspace: { library: { games: {
    root: { metadata: { catalog: { minPlayers: 0, maxPlayers: 99, minMinutes: -1, complexityWeight: 12, colors: [] } } },
    catan: { metadata: { catalog: { minPlayers: 6, maxPlayers: 2, minMinutes: 60, maxMinutes: 30, bestPlayers: '6<script>' } } }
  } } } });
  assert.equal(normalized.workspace.library.games.root, undefined);
  const catalog = normalized.workspace.library.games.catan.metadata.catalog;
  assert.equal(catalog.maxPlayers, 6);
  assert.equal(catalog.maxMinutes, 60);
  assert.equal(catalog.bestPlayers, '6');
});

test('tag sections and a valid main tag survive normalization and sync with legacy categories', () => {
  const { App } = load();
  const model = App.stateModel;
  const state = model.normalize({ workspace: { library: { games: {
    dune: { metadata: { category: 'Science Fiction, Negotiation', mechanisms: 'Alliances; Area Movement; Alliances', expansions: ['Dune: CHOAM & Richese'], mainTag: 'Area Movement' } },
    root: { metadata: { category: 'Legacy tag', mechanisms: [], mainTag: 'Unknown' } }
  } } } });
  const dune = state.workspace.library.games.dune.metadata;
  assert.deepEqual([...dune.mechanisms], ['Alliances', 'Area Movement']);
  assert.deepEqual([...dune.expansions], ['Dune: CHOAM & Richese']);
  assert.equal(dune.mainTag, 'Area Movement');
  assert.equal(state.workspace.library.games.root.metadata.category, 'Legacy tag');
  assert.equal(state.workspace.library.games.root.metadata.mainTag, undefined);
  const restored = model.prepareSync(model.syncPayload(state)).state;
  assert.equal(restored.workspace.library.games.dune.metadata.mainTag, 'Area Movement');
  assert.deepEqual([...restored.workspace.library.games.dune.metadata.mechanisms], ['Alliances', 'Area Movement']);
});

test('main types, independent owned/wishlist flags and owner-based host filters normalize safely', () => {
  const { App } = load();
  const model = App.stateModel;
  const state = model.normalize({ workspace: { people: [{ name: 'Adam' }], library: { games: {
    root: { owned: true, owners: ['Adam'], wishlist: true, metadata: { mainType: 'Coop', category: 'Strategy', mechanisms: ['Alliances'] } },
    catan: { metadata: { mainType: 'Unknown' } }
  } } }, modules: { library: { host: 'Adam' } } });
  assert.equal(state.workspace.library.games.root.owned, true);
  assert.equal(state.workspace.library.games.root.wishlist, true);
  assert.equal(state.workspace.library.games.root.metadata.mainType, 'Coop');
  assert.equal(state.workspace.library.games.catan, undefined);
  assert.equal(state.modules.library.host, 'Adam');
  const restored = model.prepareSync(model.syncPayload(state)).state;
  assert.equal(restored.workspace.library.games.root.wishlist, true);
  assert.equal(restored.workspace.library.games.root.metadata.mainType, 'Coop');
  const reset = model.resetPreferences(state);
  assert.equal(reset.modules.library.host, 'all');
  assert.equal(reset.workspace.library.games.root.wishlist, true);
  state.modules.library.hosts = ['Missing host'];
  assert.equal(model.normalize(state).modules.library.host, 'all');
});

test('game setup colors and timing rules survive normalization and sync and reach Play', () => {
  const { App } = load();
  const state = App.stateModel.createDefaultState({ demo: false });
  state.workspace.library.games.root = { owned: true, wishlist: true, rating: 4.5, note: 'Keep', metadata: { setup: {
    openColorPool: false, verified: true,
    colors: [{ name: 'Faction A', value: '#ABCDEF' }, { name: 'Faction B', value: '#123456' }],
    turnOrder: { firstMode: 'faction-order', autoSortFactions: true, label: 'Faction turn', note: 'Clockwise', defaultOthers: ['Bidding', 'Upkeep', 'Bidding'] }
  } } };
  const restored = App.stateModel.prepareSync(App.stateModel.syncPayload(App.stateModel.normalize(state))).state;
  App.storage.mutate(next => { next.workspace.library = restored.workspace.library; });
  const game = App.play.gameById('root');
  assert.equal(game.openColorPool, false);
  assert.equal(game.verified, true);
  assert.deepEqual(plain(App.play.colorsForGame(game)), [{ name: 'Faction A', value: '#abcdef' }, { name: 'Faction B', value: '#123456' }]);
  assert.equal(game.turnOrder.firstMode, 'faction-order');
  assert.deepEqual([...game.turnOrder.defaultOthers], ['Bidding', 'Upkeep']);
  assert.equal(restored.workspace.library.games.root.rating, 4.5);
  assert.equal(restored.workspace.library.games.root.note, 'Keep');
  assert.equal(restored.workspace.library.games.root.wishlist, true);
  assert.deepEqual(plain(restored.workspace.history), plain(state.workspace.history));
});

test('setup normalization rejects unsafe colors and rules and allows clearing built-in rules', () => {
  const { App } = load();
  const state = App.stateModel.createDefaultState({ demo: false });
  state.workspace.library.games['dune-2019'] = { metadata: { setup: { openColorPool: false, colors: [{name:'Bad',value:'url(https://example.com)'}, {name:'Green',value:'#22c55e'}, {name:'Green',value:'#ffffff'}], turnOrder: null, unknown: true } } };
  const normalized = App.stateModel.normalize(state);
  const setup = normalized.workspace.library.games['dune-2019'].metadata.setup;
  assert.deepEqual(plain(setup.colors), [{name:'Pine',value:'#15803d'}]);
  assert.equal(setup.unknown, undefined);
  App.storage.mutate(next => { next.workspace.library = normalized.workspace.library; });
  assert.equal(App.play.gameById('dune-2019').turnOrder, null);
  state.workspace.library.games['dune-2019'].metadata.setup = { openColorPool: false, colors: [], turnOrder: { firstMode:'arbitrary', defaultOthers:['', 'Bidding'], autoSortFactions:'yes' } };
  const invalid = App.stateModel.normalize(state).workspace.library.games['dune-2019'].metadata.setup;
  assert.equal(invalid.openColorPool, false);
  assert.equal(invalid.turnOrder.firstMode, 'current-order');
  assert.equal(invalid.turnOrder.autoSortFactions, false);
});


test('multiple hosts and type/mechanism filters normalize while legacy category filters are ignored', () => {
  const { App } = load();
  const state = App.stateModel.normalize({workspace:{people:[{name:'Adam'},{name:'Bea'}]},modules:{library:{hosts:['Adam','Bea','Adam','Missing'],category:'Strategy',mechanism:'Drafting',mainType:'Cards'}}});
  assert.deepEqual([...state.modules.library.hosts], ['Adam','Bea']);
  assert.equal(state.modules.library.host,'all');
  assert.equal(state.modules.library.category,'all');
  assert.equal(state.modules.library.mechanism,'Drafting');
  assert.equal(state.modules.library.mainType,'Cards');
  assert.deepEqual([...App.stateModel.normalize(state).modules.library.hosts],['Adam','Bea']);
  const legacy = App.stateModel.normalize({workspace:{people:[{name:'Adam'}]},modules:{library:{host:'Adam'}}});
  assert.deepEqual([...legacy.modules.library.hosts],['Adam']);
  const legacyType = App.stateModel.normalize({modules:{library:{category:'Coop'}}});
  assert.equal(legacyType.modules.library.mainType,'Coop');
  assert.equal(legacyType.modules.library.category,'all');
  legacy.modules.library.hosts=[];
  assert.equal(App.stateModel.normalize(legacy).modules.library.host,'all');
});

test('custom palettes, named factions and an empty selected pool persist through sync', () => {
  const { App } = load();
  const state = App.stateModel.createDefaultState({demo:false});
  state.workspace.library.games.root={metadata:{setup:{openColorPool:false,colors:[],palette:[{name:'Foxes',value:'#12AB34'},{name:'Invalid',value:'red'}],factions:true,turnOrder:{firstMode:'',label:'Setup',defaultOthers:['Auction']}}}};
  const restored=App.stateModel.prepareSync(App.stateModel.syncPayload(App.stateModel.normalize(state))).state;
  App.storage.mutate(next=>{next.workspace.library=restored.workspace.library;});
  const game=App.play.gameById('root');
  assert.deepEqual(plain(App.play.colorsForGame(game)),[]);
  assert.equal(game.openColorPool,false);
  assert.equal(game.turnOrder.firstMode,'');
  assert.deepEqual(plain(game.palette),[{name:'Foxes',value:'#12ab34'}]);
  App.storage.mutate(next=>{next.workspace.library.games.root.metadata.setup.colors=[{name:'Foxes',value:'#12ab34'}];});
  assert.equal(App.play.colorsForGame(App.play.gameById('root'))[0].faction,true);
  App.storage.mutate(next=>{next.workspace.library.games.root.metadata.setup.factions=false;});
  assert.equal(App.play.colorsForGame(App.play.gameById('root'))[0].faction,false);
});

test('expansion ownership and Additional Types survive sync independently of wishlist and owners', () => {
  const { App } = load();
  const model = App.stateModel;
  const state = model.createDefaultState({demo:false});
  state.workspace.library.games.root={owned:true,owners:['Bea'],wishlist:true,rating:4.5,note:'Keep',metadata:{expansions:['Riverfolk','Underworld'],ownedExpansions:['Riverfolk','Missing','Riverfolk'],additionalTypes:['Strategy',"Children's",'Unknown','Strategy']}};
  state.modules.library.showExpansions=true;
  state.modules.library.mainType='additional:Strategy';
  const normalized=model.normalize(state);
  assert.equal(normalized.modules.library.showExpansions,true);
  assert.equal(normalized.modules.library.mainType,'additional:Strategy');
  const restored=model.prepareSync(model.syncPayload(normalized)).state;
  const game=restored.workspace.library.games.root;
  assert.deepEqual([...game.metadata.ownedExpansions],['Riverfolk']);
  assert.deepEqual([...game.metadata.additionalTypes],['Strategy',"Children's"]);
  assert.deepEqual([...game.owners],['Bea']);
  assert.equal(game.owned,true);
  assert.equal(game.wishlist,true);
  assert.equal(game.rating,4.5);
  assert.equal(game.note,'Keep');
  assert.deepEqual(plain(restored.workspace.history),plain(state.workspace.history));
  const reset=model.resetPreferences(normalized);
  assert.equal(reset.modules.library.showExpansions,false);
  assert.deepEqual([...reset.workspace.library.games.root.metadata.ownedExpansions],['Riverfolk']);
});

test('expansion and type normalization rejects unknown data without creating game records', () => {
  const { App } = load();
  const state=App.stateModel.normalize({workspace:{library:{games:{root:{metadata:{ownedExpansions:['Unknown'],additionalTypes:['Unknown']}}}}},modules:{library:{showExpansions:'yes',mainType:'additional:Unknown'}}});
  assert.equal(state.workspace.library.games.root,undefined);
  assert.equal(state.modules.library.showExpansions,false);
  assert.equal(state.modules.library.mainType,'all');
});

test('linked custom expansions survive sync and remain editable without standalone Play entries', () => {
  const { App } = load();
  const state=App.stateModel.createDefaultState({demo:false});
  state.workspace.library.customGames=[{id:'custom-root-pack',name:'Root Pack',minPlayers:2,maxPlayers:4,minMinutes:30,maxMinutes:60}];
  state.workspace.library.games.root={owned:true,wishlist:true,metadata:{expansions:['Root Pack'],ownedExpansions:['Root Pack']}};
  state.workspace.library.games['custom-root-pack']={owned:true,note:'Pack note',metadata:{expansionOf:'root'}};
  state.modules.library.expansionDisclosure={root:true, invalid:'yes'};
  const normalized=App.stateModel.normalize(state);
  assert.deepEqual(plain(normalized.modules.library.expansionDisclosure),{root:true});
  const restored=App.stateModel.prepareSync(App.stateModel.syncPayload(normalized)).state;
  App.storage.mutate(next=>{next.workspace.library=restored.workspace.library;});
  assert.equal(App.play.allGames().some(game=>game.id==='custom-root-pack'),false);
  assert.equal(App.play.allGames(true).some(game=>game.id==='custom-root-pack'),true);
  assert.equal(App.play.gameById('custom-root-pack').expansionOf,'root');
  assert.equal(restored.workspace.library.games['custom-root-pack'].note,'Pack note');
  assert.equal(restored.workspace.library.games.root.wishlist,true);
  assert.deepEqual(plain(restored.workspace.history),plain(state.workspace.history));
});

test('invalid, cyclic and missing expansion parents cannot hide standalone games', () => {
  const { App }=load();
  const state=App.stateModel.normalize({workspace:{library:{customGames:[{id:'custom-pack',name:'Pack'}],games:{'custom-pack':{owned:true,metadata:{expansionOf:'missing'}},root:{owned:true,metadata:{expansionOf:'root'}}}}}});
  assert.equal(state.workspace.library.games['custom-pack'].metadata.expansionOf,undefined);
  assert.equal(state.workspace.library.games.root.metadata.expansionOf,undefined);
  state.workspace.library.games.root.metadata.expansionOf='custom-pack';
  state.workspace.library.games['custom-pack'].metadata.expansionOf='root';
  const normalized=App.stateModel.normalize(state);
  assert.equal(normalized.workspace.library.games.root.metadata.expansionOf,undefined);
  assert.equal(normalized.workspace.library.games['custom-pack'].metadata.expansionOf,undefined);
  App.storage.mutate(next=>{next.workspace.library=normalized.workspace.library;});
  assert.equal(App.play.allGames().some(game=>game.id==='custom-pack'),true);
});


test('normalization reconnects linked expansions to a missing parent expansion list', () => {
  const { App }=load();
  const state=App.stateModel.normalize({workspace:{library:{customGames:[{id:'custom-pack',name:'Pack'}],games:{'custom-pack':{owned:true,metadata:{expansionOf:'root'}}}}}});
  assert.deepEqual([...state.workspace.library.games.root.metadata.expansions],['Pack']);
  assert.deepEqual([...state.workspace.library.games.root.metadata.ownedExpansions],['Pack']);
  assert.equal(state.workspace.library.games.root.owned,false);
  const normalized=App.stateModel.normalize(state);
  assert.deepEqual(plain(normalized.workspace.library),plain(state.workspace.library));
});

test('negative published years parse from correction and overview and survive sync', () => {
  const { App }=load();
  assert.equal(App.library.parseBggPaste('Edit Name Ancient Game\nEdit Year Released -500').fields.year,-500);
  const overview=App.library.parseBggPaste('# [Ancient Game](https://boardgamegeek.com/boardgame/123/ancient-game)(-500)\n2–4 Players');
  assert.equal(overview.fields.year,-500);
  assert.equal(overview.fields.name,'Ancient Game');
  const state=App.stateModel.createDefaultState({demo:false});
  state.workspace.library.games.root={metadata:{year:-500}};
  state.workspace.library.games.catan={metadata:{year:0}};
  const restored=App.stateModel.prepareSync(App.stateModel.syncPayload(App.stateModel.normalize(state))).state;
  assert.equal(restored.workspace.library.games.root.metadata.year,-500);
  assert.equal(restored.workspace.library.games.catan.metadata.year,0);
});

test('overview, player poll and correction can be parsed together in form display order', () => {
  const { App }=load();
  const fields=App.library.parseBggPaste(['bgg-overview.md','bgg-poll.md','bgg-correction.txt'].map(pasteFixture).join('\n\n')).fields;
  assert.equal(fields.name,'Dune');
  assert.equal(fields.bggId,'283355');
  assert.equal(fields.bestPlayers,'6');
  assert.ok(fields.mechanisms.includes('Variable Player Powers'));
});


test('legacy category data remains backed up while category filters and sorts are retired', () => {
  const { App }=load();
  const state=App.stateModel.normalize({workspace:{library:{games:{root:{metadata:{category:'RetiredCategoryOnly'}}}}},modules:{library:{category:'RetiredCategoryOnly',sortBy:'categories'}}});
  assert.equal(state.modules.library.category,'all');
  assert.equal(state.modules.library.sortBy,'fit');
  App.storage.mutate(next=>{next.workspace.library=state.workspace.library;});
  assert.equal(App.library.gameSearchText(App.play.gameById('root')).includes('retiredcategoryonly'),false);
  const restored=App.stateModel.prepareSync(App.stateModel.syncPayload(state)).state;
  assert.equal(restored.workspace.library.games.root.metadata.category,'RetiredCategoryOnly');
  assert.equal(App.stateModel.normalize({modules:{library:{sortBy:'category'}}}).modules.library.sortBy,'mainType');
});

test('yearless BGG overview reads the title hyperlink and rating rather than ranks or vote counts', () => {
  const { App } = load();
  const overview = `RANK:
- OVERALL [31,090](https://boardgamegeek.com/browse/boardgame?rank=31090)
* PARTY [941](https://boardgamegeek.com/partygames/browse/boardgame?rank=941)
[**5.2&#xA0;**](https://boardgamegeek.com/boardgame/15832/cheat/ratings?rated=1\\&comment=1)
# [Cheat](https://boardgamegeek.com/boardgame/15832/cheat)
Empty your hand of cards by lying about them without being caught out.
[**449 Ratings**](https://boardgamegeek.com/boardgame/15832/cheat/ratings?rated=1)
## Game Information
### Number of Players
**3–10 Players&#xA0;**
### Play Time
**10 Min&#xA0;**
### Complexity
**Weight: 1.12 / 5**`;
  const fields = App.library.parseBggPaste(overview).fields;
  assert.equal(fields.name, 'Cheat');
  assert.equal(fields.bggId, '15832');
  assert.equal(fields.bggRating, 5.2);
  assert.equal(fields.year, undefined);
  assert.equal(fields.minPlayers, 3);
  assert.equal(fields.maxPlayers, 10);
  assert.equal(fields.minMinutes, 10);
  assert.equal(fields.maxMinutes, 10);
  assert.equal(fields.complexityWeight, 1.12);
  const plain = App.library.parseBggPaste('5.2\n\n# Cheat\n449 Ratings').fields;
  assert.equal(plain.name, 'Cheat');
  assert.equal(plain.bggRating, 5.2);
  assert.equal(App.library.parseBggPaste('[Cheat](https://boardgamegeek.com/boardgame/15832/cheat)').fields.name, 'Cheat');
});

test('alternative names normalize, survive sync and participate in library search', () => {
  const { App, setState } = load();
  const state = App.stateModel.normalize({ workspace: { library: { games: {
    root: { metadata: { alternativeNames: 'Дюна; Dune: Der Wüstenplanet; Дюна\n沙丘' } }
  } } } });
  const restored = App.stateModel.prepareSync(App.stateModel.syncPayload(state)).state;
  assert.deepEqual([...restored.workspace.library.games.root.metadata.alternativeNames], ['Дюна', 'Dune: Der Wüstenplanet', '沙丘']);
  setState(restored);
  assert.ok(App.library.gameSearchText(App.play.gameById('root')).includes('wüstenplanet'));
  const parsed = App.library.parseBggPaste('Edit Name Dune\nEdit Name  Set as Primary Name  Remove Name\tДюна (alternate)').fields;
  assert.deepEqual([...parsed.alternativeNames], ['Дюна']);
});

test('whole correction page ignores navigation and reads rows without edit controls', () => {
  const { App } = load();
  const paste = readFileSync(new URL('fixtures/bgg-correction-page.md', import.meta.url), 'utf8');
  const fields = App.library.parseBggPaste(paste).fields;
  assert.equal(fields.name, 'Codenames: Pictures');
  assert.equal(fields.bggId, '198773');
  assert.equal(fields.year, 2016);
  assert.equal(fields.minPlayers, 2);
  assert.equal(fields.maxPlayers, 8);
  assert.equal(fields.minMinutes, 15);
  assert.equal(fields.maxMinutes, 15);
  assert.equal(fields.bggRating, undefined);
  assert.equal(fields.alternativeNames.length, 23);
  assert.ok(fields.alternativeNames.includes('Codenames: Images'));
  assert.deepEqual([...fields.mechanisms], ['Communication Limits', 'Memory', 'Team-Based Game']);
  assert.equal(fields.expansions.length, 7);
  assert.ok(fields.expansions.every(name => !/\bpromo\b/i.test(name)));
  assert.ok(!fields.expansions.includes('Codenames: Duet'));
  assert.ok(!fields.alternativeNames.includes('boardgame geek'));
  const combined = App.library.parseBggPaste('[**7.1**](https://boardgamegeek.com/boardgame/198773/codenames-pictures/ratings)\n' + paste).fields;
  assert.equal(combined.bggRating, 7.1);
  assert.equal(combined.name, 'Codenames: Pictures');
});

test('BGG IDs parse from slugless title links, correction URLs and explicit labels', () => {
  const { App } = load();
  assert.equal(App.library.parseBggPaste('# [Cheat](https://boardgamegeek.com/boardgame/15832)').fields.bggId, '15832');
  assert.equal(App.library.parseBggPaste('https://boardgamegeek.com/geekitem/edit/thing/198773').fields.bggId, '198773');
  assert.equal(App.library.parseBggPaste('BGG ID: 198773\n[Other game](https://boardgamegeek.com/boardgame/13/catan/ratings)').fields.bggId, '198773');
  assert.equal(App.library.parseBggPaste('BGG ID: 0').fields.bggId, undefined);
});

test('correction imports skip fan expansions in labeled and bare rows', () => {
  const { App } = load();
  for (const prefix of ['', 'Remove\t']) {
    const text = `Expansion\n${prefix}Dune: Official Pack\n${prefix}Dune: Landsraad (fan expansion for Dune)\n${prefix}Dune: More (Fan-Made Expansion)\n${prefix}Dune: Extra (fan-made)\nAdd Expansion\nFan Expansions\n${prefix}Dune: Unofficial Pack\nExpands\nDune`;
    assert.deepEqual([...App.library.parseBggPaste(text).fields.expansions], ['Dune: Official Pack']);
  }
  assert.deepEqual([...App.library.parseBggPaste('Expansion\nRemove Dune: Fan (fan expansion)\nAdd Expansion').fields.expansions], []);
  assert.deepEqual([...App.library.parseBggPaste('Expansion\nFantasy Realms: Official Pack\nExpands').fields.expansions], ['Fantasy Realms: Official Pack']);
});

test('unknown custom player and timing data remains unknown through sync and linked expansion setup', () => {
  const { App, setState } = load();
  const state = App.stateModel.normalize({workspace:{library:{customGames:[{id:'custom-unknown',name:'Unknown Pack'}],games:{'custom-unknown':{owned:true,metadata:{expansionOf:'root'}}}}}});
  const restored = App.stateModel.prepareSync(App.stateModel.syncPayload(state)).state;
  const game = restored.workspace.library.customGames.find(game=>game.id==='custom-unknown');
  for (const key of ['minPlayers','maxPlayers','minMinutes','maxMinutes']) assert.equal(game[key],null);
  assert.equal(game.bestPlayers,'--');
  assert.equal(game.recommendedPlayers,'--');
  setState(restored);
  const linked = App.play.gameById('custom-unknown');
  assert.equal(linked.maxPlayers,null);
  assert.equal(linked.maxMinutes,null);
  assert.equal(App.play.playerCountFit(linked,4).score,0);
});

test('correction imports exclude promo names and sections without dropping normal expansions', () => {
  const { App } = load();
  for (const prefix of ['', 'Remove\t']) {
    const fields = App.library.parseBggPaste(`Expansion\n${prefix}Codenames: Official Pack\n${prefix}Codenames: 5x5 Promo Tiles\n${prefix}Codenames: Promotional Pack\n${prefix}Codenames: Extra (promos)\nAdd Expansion\nPromo Expansions\n${prefix}Unmarked Pack\nExpands`).fields;
    assert.deepEqual([...fields.expansions], ['Codenames: Official Pack']);
  }
});


test('Forest Shuffle correction excludes promo cards including German Promokarte', () => {
  const { App } = load();
  const names = ["Embosca't: Geneta / Teixó Promo Card", "Forest Shuffle: Alpine", "Forest Shuffle: Arara-Azul / Guaraná Promo Card", "Forest Shuffle: Exploration", "Forest Shuffle: Песец / Соболь Promo Card", "Forêt Mixte: Palmier Promo Card", "Mischwald: Dürer-Fledermaus / Feldhase Promokarte", "Forest Shuffle: Woodland Edge", "Forest Shuffle: Památná lípa"];
  for (const prefix of ['', 'Remove ']) {
    const fields = App.library.parseBggPaste('Expansion\n' + names.map(name=>prefix+name).join('\n') + '\nAdd Expansion').fields;
    assert.deepEqual([...fields.expansions], ['Forest Shuffle: Alpine','Forest Shuffle: Exploration','Forest Shuffle: Woodland Edge','Forest Shuffle: Památná lípa']);
  }
  assert.deepEqual([...App.library.parseBggPaste('Expansion\nForest Shuffle: Maple Promo Card\nExpands').fields.expansions], []);
});


function setupSession(api, { clockwise = true, gameId = 'custom' } = {}) {
  const players = ['a', 'b', 'c', 'd'].map(id => ({ id, name: id.toUpperCase(), type: 'player', color: '#ffffff' }));
  const others = [{ id: 'combat', name: 'Combat', type: 'other', color: '#ffffff' }];
  api.hydrateFromSnapshot({ v: 1, state: { view: 'setup', players: [] }, selectedGameId: gameId,
    setupEntries: [players[0], others[0], ...players.slice(1)], playersInClockwiseOrder: clockwise });
}

test('choosing a clockwise starter rotates players, keeps timers separate and starts in that order', () => {
  const { App } = load({ setupHarness: true });
  const api = App.play.setupTest;
  setupSession(api);
  api.chooseSetupStarter('c');
  const snapshot = api.buildSessionSnapshot();
  assert.deepEqual(plain(snapshot.setupEntries.map(p => p.id)), ['c', 'd', 'a', 'b', 'combat']);
  assert.equal(snapshot.selectedStarterId, 'c');
  api.hydrateFromSnapshot(JSON.parse(JSON.stringify(snapshot)));
  api.startGame();
  assert.deepEqual(plain(api.buildSessionSnapshot().state.players.filter(p => p.type === 'player').map(p => p.id)), ['c', 'd', 'a', 'b']);
});

test('non-table starter keeps the remaining order; full shuffle preserves player identities and other timers', () => {
  const { App } = load({ setupHarness: true, random: () => 0 });
  const api = App.play.setupTest;
  setupSession(api, { clockwise: false });
  api.chooseSetupStarter('c');
  assert.deepEqual(plain(api.buildSessionSnapshot().setupEntries.map(p => p.id)), ['c', 'a', 'b', 'd', 'combat']);
  api.shuffleSetupOrder();
  const snapshot = api.buildSessionSnapshot();
  assert.deepEqual(plain(snapshot.setupEntries.filter(p => p.type === 'player').map(p => p.id).sort()), ['a', 'b', 'c', 'd']);
  assert.deepEqual(plain(snapshot.setupEntries.filter(p => p.type === 'player').map(p => p.id)), ['a', 'b', 'd', 'c']);
  assert.equal(snapshot.setupEntries.at(-1).id, 'combat');
  assert.equal(snapshot.selectedStarterId, snapshot.setupEntries[0].id);
  assert.equal(snapshot.playersInClockwiseOrder, false);
  api.hydrateFromSnapshot(JSON.parse(JSON.stringify(snapshot)));
  assert.equal(api.buildSessionSnapshot().playersInClockwiseOrder, false);
  api.startGame();
  assert.deepEqual(plain(api.buildSessionSnapshot().state.players.filter(p => p.type === 'player').map(p => p.id)), plain(snapshot.setupEntries.filter(p => p.type === 'player').map(p => p.id)));
});

test('clockwise shuffle is guarded and legacy sessions default to table seating', () => {
  const { App } = load({ setupHarness: true });
  const api = App.play.setupTest;
  setupSession(api);
  const snapshot = api.buildSessionSnapshot();
  api.shuffleSetupOrder();
  assert.deepEqual(plain(api.buildSessionSnapshot().setupEntries), plain(snapshot.setupEntries));
  delete snapshot.playersInClockwiseOrder;
  api.hydrateFromSnapshot(snapshot);
  assert.equal(api.buildSessionSnapshot().playersInClockwiseOrder, true);
  snapshot.selectedGameId = 'dune-2019';
  api.hydrateFromSnapshot(snapshot);
  assert.equal(api.buildSessionSnapshot().playersInClockwiseOrder, false);
});

test('Uprising uses its Objective starter and four colors, independently of influence factions', () => {
  const { App } = load({ setupHarness: true });
  const api = App.play.setupTest;
  const game = App.play.gameById('dune-imperium-uprising');
  assert.equal(game.turnOrder.firstMode, 'manual');
  assert.equal(game.turnOrder.sequence, 'clockwise');
  assert.equal(game.factions, false);
  assert.deepEqual(plain(App.play.colorsForGame(game).map(c => c.name)), ['Red', 'Blue', 'Green', 'Yellow']);
  setupSession(api, { gameId: game.id });
  api.pickFirstPlayer();
  assert.equal(api.buildSessionSnapshot().selectedStarterId, null);
  api.startGame();
  assert.equal(api.buildSessionSnapshot().state.view, 'setup');
  api.chooseSetupStarter('b');
  api.startGame();
  assert.deepEqual(plain(api.buildSessionSnapshot().state.players.filter(p => p.type === 'player').map(p => p.id)), ['b', 'c', 'd', 'a']);
  assert.equal(App.play.gameById('dune-2019').turnOrder.firstMode, 'faction-order');
});

test('separate sequence and first-player choices normalize and survive sync', () => {
  const { App } = load();
  const state = App.stateModel.createDefaultState({ demo: false });
  state.workspace.library.games.root = { metadata: { setup: { turnOrder: { firstMode: 'manual', sequence: 'clockwise' } } } };
  const restored = App.stateModel.prepareSync(App.stateModel.syncPayload(App.stateModel.normalize(state))).state;
  assert.equal(restored.workspace.library.games.root.metadata.setup.turnOrder.firstMode, 'manual');
  assert.equal(restored.workspace.library.games.root.metadata.setup.turnOrder.sequence, 'clockwise');
  state.workspace.library.games.root.metadata.setup.turnOrder = { firstMode: 'random-first', sequence: 'unsafe' };
  const rule = App.stateModel.normalize(state).workspace.library.games.root.metadata.setup.turnOrder;
  assert.equal(rule.firstMode, 'random-first');
  assert.equal(rule.sequence, 'clockwise');
});


test('random first-player roll preserves clockwise order and excludes other timers', () => {
  const { App } = load({ setupHarness: true, random: () => 0.6 });
  const api = App.play.setupTest;
  setupSession(api);
  api.pickFirstPlayer();
  const snapshot = api.buildSessionSnapshot();
  assert.equal(snapshot.selectedStarterId, 'c');
  assert.deepEqual(plain(snapshot.setupEntries.map(p => p.id)), ['c', 'd', 'a', 'b', 'combat']);
});


test('legacy standard game colors migrate while custom hex colors and history remain intact', () => {
  const { App } = load();
  const state = App.stateModel.createDefaultState({ demo: false });
  state.workspace.people = [{ id: 'tristen', name: 'Tristen', color: '#22c55e' }];
  const colors = [
    { name: 'Green', value: '#22c55e' }, { name: 'Teal', value: '#14b8a6' },
    { name: 'Gray', value: '#94a3b8' }, { name: 'Pine', value: '#15803d' },
    { name: 'Custom Green', value: '#123456' }, { name: 'Atreides', value: '#22c55e' }
  ];
  state.workspace.library.games.root = { metadata: { setup: { colors, palette: colors, openColorPool: false } } };
  const expected = [
    { name: 'Pine', value: '#15803d' }, { name: 'Lime', value: '#a3e635' },
    { name: 'Slate', value: '#475569' },
    { name: 'Custom Green', value: '#123456' }, { name: 'Atreides', value: '#22c55e' }
  ];
  const normalized = App.stateModel.normalize(state);
  const setup = normalized.workspace.library.games.root.metadata.setup;
  assert.deepEqual(plain(setup.colors), expected);
  assert.deepEqual(plain(setup.palette), expected);
  assert.equal(normalized.workspace.people[0].color, '#15803d');
  assert.deepEqual(plain(normalized.workspace.history), plain(state.workspace.history));
  assert.deepEqual(plain(App.stateModel.normalize(normalized).workspace.library.games.root.metadata.setup), plain(setup));
  assert.deepEqual(plain(App.gameData.migrateStandardColor({ name: 'Green', value: '#123456' })), { name: 'Green', value: '#123456' });
  assert.equal(App.gameData.colorDef('Green', '#7ABB66').value, '#7ABB66');
  assert.equal(App.gameData.colorDef('Green', 'Green', '#169549').value, '#169549');
  assert.equal(App.gameData.colorDef('Green').name, 'Pine');
  assert.equal(App.gameData.colorDef('Teal').value, '#a3e635');
  assert.equal(App.gameData.colorDef('Gray').name, 'Slate');
  assert.equal(App.stateModel.createDefaultState({ demo: false }).workspace.people.find(person => person.name === 'Tristen').color, '#15803d');
});


test('deleting a built-in game persists through normalization and sync, preserving history', () => {
  const { App } = load({ setupHarness: true });
  App.storage.mutate(state => {
    state.workspace.library.games.root = { owned: true, note: 'Keep metadata' };
    state.workspace.history.push({ id: 'saved-root', gameId: 'root', gameName: 'Root', gameStartedAt: 1000, gameEndedAt: 3000, players: [{id:'adam', name:'Adam', type:'player', placement:1, turns:[]}] });
  });
  const before = plain(App.storage.getState().workspace.history);
  assert.equal(before.length, 1);
  App.library.deleteTest.removeLibraryGame(App.play.gameById('root'));
  assert.equal(App.play.gameById('root'), null);
  assert.equal(App.play.allGames().some(game => game.id === 'root'), false);
  assert.deepEqual(plain(App.storage.getState().workspace.history), before);
  const restored = App.stateModel.prepareSync(App.stateModel.syncPayload(App.storage.getState())).state;
  assert.equal(restored.workspace.library.games.root.deleted, true);
  assert.equal(restored.workspace.library.games.root.note, 'Keep metadata');
  const fresh = App.stateModel.createDefaultState({ demo: false });
  fresh.workspace.library.games.root = { deleted: 'true' };
  assert.notEqual(App.stateModel.normalize(fresh).workspace.library.games.root?.deleted, true);
  fresh.workspace.library.games.custom = { deleted: true };
  assert.equal(App.stateModel.normalize(fresh).workspace.library.games.custom?.deleted, undefined);
});

test('deleting a base game keeps linked expansions as standalone games', () => {
  const { App } = load({ setupHarness: true });
  App.storage.mutate(state => {
    state.workspace.library.customGames.push({ id: 'custom-expansion', name: 'Expansion' });
    state.workspace.library.games['custom-expansion'] = { metadata: { expansionOf: 'root' } };
  });
  App.library.deleteTest.removeLibraryGame(App.play.gameById('root'));
  assert.equal(App.play.gameById('custom-expansion').expansionOf, undefined);
  assert.equal(App.play.allGames().some(game => game.id === 'custom-expansion'), true);
  App.library.deleteTest.removeLibraryGame(App.play.gameById('custom-expansion'));
  assert.equal(App.play.gameById('custom-expansion'), null);
  assert.equal(App.storage.getState().workspace.library.games['custom-expansion'], undefined);
});

test('canceling deletion preserves the game; Custom Game cannot be deleted', async () => {
  const { App } = load({ setupHarness: true });
  App.components.confirm = async () => false;
  App.library.deleteTest.edit('root');
  await App.library.deleteTest.deleteCustomGame();
  assert.ok(App.play.gameById('root'));
  App.components.confirm = async () => { throw Error('Must not prompt for Custom Game'); };
  App.library.deleteTest.edit('custom');
  await App.library.deleteTest.deleteCustomGame();
  assert.ok(App.play.gameById('custom'));
});

test('deletion clears setup selection but preserves a running session and its game ID on reload', () => {
  const { App } = load({ setupHarness: true });
  const api = App.play.setupTest;
  setupSession(api, { gameId: 'root' });
  const game = App.play.gameById('root');
  App.library.deleteTest.removeLibraryGame(game);
  assert.equal(api.buildSessionSnapshot().selectedGameId, 'custom');
  const running = api.buildSessionSnapshot();
  running.selectedGameId = 'root';
  running.state.view = 'game';
  running.state.gameName = 'Root';
  api.hydrateFromSnapshot(running);
  App.play.gameDeleted('root');
  api.hydrateFromSnapshot(JSON.parse(JSON.stringify(api.buildSessionSnapshot())));
  assert.equal(api.buildSessionSnapshot().selectedGameId, 'root');
  assert.equal(api.buildSessionSnapshot().state.gameName, 'Root');
});

test('Vibe Check weight step defaults safely and normalizes supported saved settings', () => {
  const { App } = load();
  const model = App.stateModel;
  assert.equal(model.createDefaultState({ demo: false }).preferences.game.vibeWeightStep, 0.25);
  for (const value of [0.1, 0.25, 0.5, 1, '0.5']) {
    const state = model.createDefaultState({ demo: false });
    state.preferences.game.vibeWeightStep = value;
    assert.equal(model.normalize(state).preferences.game.vibeWeightStep, Number(value));
  }
  for (const value of [undefined, null, 0, -1, 3, 'bad']) {
    const state = model.createDefaultState({ demo: false });
    state.preferences.game.vibeWeightStep = value;
    const normalized = model.normalize(state);
    assert.equal(normalized.preferences.game.vibeWeightStep, 0.25);
    assert.deepEqual(normalized.workspace.history, state.workspace.history);
  }
});
