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
  vm.runInContext(`(function (window) { ${read('features/library.js')} })(window);`, context);
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
  assert.deepEqual(JSON.parse(JSON.stringify(normalized.workspace.library.games.root.metadata)), { year: 2018, bggRating: 8.13, category: 'Strategy', bggId: '237182' });
  assert.equal(normalized.workspace.library.games.catan.metadata.year, null);
  assert.equal(normalized.workspace.library.games.catan.metadata.bggRating, null);
  assert.equal(normalized.workspace.library.games.catan.metadata.bggId, '');
  assert.equal(normalized.workspace.library.games.catan.note, 'Keep');
  assert.equal(normalized.modules.library.sortBy, 'bggRating');
  assert.equal(normalized.modules.library.category, 'Strategy');
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
  assert.deepEqual(plain(setup.colors), [{name:'Green',value:'#22c55e'}]);
  assert.equal(setup.unknown, undefined);
  App.storage.mutate(next => { next.workspace.library = normalized.workspace.library; });
  assert.equal(App.play.gameById('dune-2019').turnOrder, null);
  state.workspace.library.games['dune-2019'].metadata.setup = { openColorPool: false, colors: [], turnOrder: { firstMode:'arbitrary', defaultOthers:['', 'Bidding'], autoSortFactions:'yes' } };
  const invalid = App.stateModel.normalize(state).workspace.library.games['dune-2019'].metadata.setup;
  assert.equal(invalid.openColorPool, false);
  assert.equal(invalid.turnOrder.firstMode, 'current-order');
  assert.equal(invalid.turnOrder.autoSortFactions, false);
});


test('multiple hosts and separate type/category/mechanism filters normalize and migrate legacy hosts', () => {
  const { App } = load();
  const state = App.stateModel.normalize({workspace:{people:[{name:'Adam'},{name:'Bea'}]},modules:{library:{hosts:['Adam','Bea','Adam','Missing'],category:'Strategy',mechanism:'Drafting',mainType:'Cards'}}});
  assert.deepEqual([...state.modules.library.hosts], ['Adam','Bea']);
  assert.equal(state.modules.library.host,'all');
  assert.equal(state.modules.library.category,'Strategy');
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
