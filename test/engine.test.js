import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createGame, exitFor, legalMoves, applyMove, positionKey, chooseMove } from '../src/engine.js';

function fixture(sparks, extra = {}) {
  const state = { tiles: Array(36).fill(0), sparks, scores: [0, 0], turn: 0, ply: 0, winner: null, repetitions: {}, ...extra };
  state.repetitions = { [positionKey(state)]: 1, ...(extra.repetitions || {}) };
  return state;
}
const spark = (id, row, col, entry) => ({ id, row, col, entry });

test('both switch states pair every port exactly once, with no straight paths', () => {
  for (const tile of [0, 1]) for (let entry = 0; entry < 4; entry++) {
    const exit = exitFor(tile, entry);
    assert.equal(exitFor(tile, exit), entry);
    assert.notEqual(exit, entry);
    assert.notEqual(exit, (entry + 2) % 4);
  }
  assert.deepEqual([0, 1, 2, 3].map(entry => exitFor(0, entry)), [1, 0, 3, 2]);
  assert.deepEqual([0, 1, 2, 3].map(entry => exitFor(1, entry)), [3, 2, 1, 0]);
});

test('opening is rotationally symmetric, has eight distinct interior sparks and immutable state', () => {
  const state = createGame();
  assert.equal(state.sparks.length, 8);
  for (let index = 0; index < 36; index++) assert.equal(state.tiles[index], state.tiles[35 - index]);
  for (const point of state.sparks) {
    assert(point.col > 0 && point.col < 5);
    assert(state.sparks.some(other => other.row === 5 - point.row && other.col === 5 - point.col && other.entry === (point.entry + 2) % 4));
  }
  assert.equal(new Set(state.sparks.map(s => s.row * 6 + s.col)).size, 8);
  assert(Object.isFrozen(state));
  assert(Object.isFrozen(state.tiles));
  assert(Object.isFrozen(state.sparks[0]));
});

test('only unoccupied tiles or passing are legal; invalid moves do not modify input', () => {
  const state = createGame();
  const before = JSON.stringify(state);
  assert.equal(legalMoves(state).length, 29);
  assert(legalMoves(state).includes(null));
  for (const p of state.sparks) assert.throws(() => applyMove(state, p.row * 6 + p.col), /occupied/i);
  for (const bad of [-1, 36, 1.2, undefined, '1', NaN]) assert.throws(() => applyMove(state, bad));
  assert.equal(JSON.stringify(state), before);
});

test('simultaneous routes all use the old tile and visits flip by 2, 3, or 4 parity', () => {
  for (const count of [2, 3, 4]) {
    const state = fixture(Array.from({ length: count }, (_, id) => spark(id, 2, 2, id % 4)));
    const result = applyMove(state, null);
    assert.equal(result.state.tiles[14], count % 2);
    assert.deepEqual(result.events.map(e => e.exit), [1, 0, 3, 2].slice(0, count));
    assert.deepEqual(result.state.sparks.map(s => [s.row, s.col, s.entry]), [[2, 3, 3], [1, 2, 2], [2, 1, 1], [3, 2, 0]].slice(0, count));
  }
});

test('flipped unoccupied tile does not affect simultaneous routing before arrival', () => {
  const state = fixture([spark(0, 2, 2, 0)]);
  const result = applyMove(state, 15);
  assert.equal(result.state.tiles[14], 1);
  assert.equal(result.state.tiles[15], 1);
  assert.equal(result.state.sparks[0].col, 3);
  assert.equal(state.tiles[14], 0);
  assert.equal(state.tiles[15], 0);
});

test('north and south walls reflect to the same cell with the wall as next entry', () => {
  const result = applyMove(fixture([spark(0, 0, 2, 1), spark(1, 5, 3, 3)]), null);
  assert.deepEqual(result.state.sparks, [spark(0, 0, 2, 0), spark(1, 5, 3, 2)]);
  assert(result.events.every(e => e.reflected && e.score === null));
});

test('west and east collect simultaneously and remove scored sparks', () => {
  const state = fixture([spark(0, 2, 0, 2), spark(1, 3, 5, 0)]);
  const { state: next, events } = applyMove(state, null);
  assert.deepEqual(next.scores, [1, 1]);
  assert.deepEqual(next.sparks, []);
  assert.deepEqual(events.map(e => [e.score, e.to]), [[0, null], [1, null]]);
  assert.equal(next.turn, 1);
  assert.equal(next.ply, 1);
});

test('either side can win during either player turn; simultaneous 4-4 is a draw', () => {
  for (const turn of [0, 1]) for (const side of [0, 1]) {
    const state = fixture([spark(0, 2, side ? 5 : 0, side ? 0 : 2)], { turn, scores: side ? [2, 4] : [4, 2] });
    const next = applyMove(state, null).state;
    assert.equal(next.winner, side);
    assert.deepEqual(legalMoves(next), []);
    assert.throws(() => applyMove(next, null), /over/i);
  }
  const drawn = applyMove(fixture([spark(0, 2, 0, 2), spark(1, 3, 5, 0)], { scores: [3, 3] }), null).state;
  assert.equal(drawn.winner, 'draw');
});

test('position key includes board, all spark positions/entries, turn and score; ignores ply and ordering', () => {
  const state = createGame();
  assert.equal(positionKey(state), positionKey({ ...state, ply: 99, sparks: [...state.sparks].reverse() }));
  for (const altered of [
    { ...state, turn: 1 },
    { ...state, scores: [1, 0] },
    { ...state, tiles: state.tiles.map((n, index) => index ? n : 1 - n) },
    { ...state, sparks: state.sparks.map((p, index) => index ? p : { ...p, entry: (p.entry + 1) % 4 }) },
  ]) assert.notEqual(positionKey(state), positionKey(altered));
});

test('third full-position occurrence draws, second does not, without mutating previous repetition counts', () => {
  const base = fixture([spark(0, 2, 2, 0)]);
  const key = positionKey(applyMove(base, null).state);
  const second = applyMove({ ...base, repetitions: { ...base.repetitions, [key]: 1 } }, null).state;
  assert.equal(second.winner, null);
  assert.equal(second.repetitions[key], 2);
  const input = { ...base, repetitions: { ...base.repetitions, [key]: 2 } };
  const third = applyMove(input, null).state;
  assert.equal(third.winner, 'draw');
  assert.equal(input.repetitions[key], 2);
});


test('a real circulating position draws on its third occurrence, with no turn limit', () => {
  const tiles = Array(36).fill(0);
  tiles[14] = 1;
  tiles[21] = 1;
  let state = fixture([spark(0, 2, 2, 2), spark(1, 2, 2, 2)], { tiles, scores: [3, 3] });
  const original = positionKey(state);
  for (let ply = 1; ply <= 8; ply++) {
    state = applyMove(state, null).state;
    assert.equal(state.winner, ply === 8 ? 'draw' : null);
    assert.equal(state.sparks.length, 2);
    if (ply % 4 === 0) assert.equal(positionKey(state), original);
  }
  assert.equal(state.repetitions[original], 3);
});

test('state and nested animation events are independent immutable snapshots', () => {
  const input = fixture([spark(0, 2, 2, 0)]);
  const result = applyMove(input, null);
  input.sparks[0].row = 4;
  input.tiles[0] = 1;
  assert.equal(result.events[0].from.row, 2);
  assert.equal(result.state.tiles[0], 0);
  assert(Object.isFrozen(result.events));
  assert(Object.isFrozen(result.events[0]));
  assert(Object.isFrozen(result.events[0].from));
  assert(Object.isFrozen(result.events[0].to));
  assert.throws(() => { result.events[0].to.row = 99; }, TypeError);
});

test('conserves all eight sparks over deterministic varied legal trajectories', () => {
  let random = 719;
  for (let game = 0; game < 12; game++) {
    let state = createGame();
    for (let ply = 0; ply < 250 && state.winner === null; ply++) {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      const moves = legalMoves(state);
      const next = applyMove(state, moves[random % moves.length]).state;
      assert.equal(next.sparks.length + next.scores[0] + next.scores[1], 8);
      assert(next.sparks.every(p => p.row >= 0 && p.row < 6 && p.col >= 0 && p.col < 6 && p.entry >= 0 && p.entry < 4));
      assert.equal(new Set(next.sparks.map(p => p.id)).size, next.sparks.length);
      state = next;
    }
  }
});

test('AI returns legal deterministic moves promptly and prioritizes terminal wins', () => {
  const state = createGame();
  const start = performance.now();
  const move = chooseMove(state, { depth: 3 });
  const elapsed = performance.now() - start;
  assert(legalMoves(state).includes(move));
  assert.equal(chooseMove(state, { depth: 3 }), move);
  assert(elapsed < 500, `AI took ${elapsed.toFixed(1)}ms`);
  // This spark arrives in the eastmost cell; blue can make its following route east.
  const tiles = Array(36).fill(0);
  tiles[11] = 1;
  tiles[17] = 1;
  const winning = fixture([spark(0, 1, 5, 1)], { turn: 1, scores: [0, 4], tiles });
  const selected = chooseMove(winning, { depth: 3 });
  assert(legalMoves(winning).includes(selected));
  const next = applyMove(winning, selected).state;
  const terminal = applyMove(next, null).state;
  assert.equal(terminal.winner, 1);
});

test('bounded AI self-play preserves rules and reaches actual terminal outcomes', () => {
  const outcomes = [];
  for (const depth of [1, 2, 3]) {
    let state = createGame();
    for (let ply = 0; ply < 200 && state.winner === null; ply++) {
      const move = chooseMove(state, { depth });
      assert(legalMoves(state).includes(move));
      state = applyMove(state, move).state;
      assert.equal(state.sparks.length + state.scores[0] + state.scores[1], 8);
    }
    outcomes.push({ depth, winner: state.winner, scores: state.scores, ply: state.ply });
  }
  console.log('AI self-play:', JSON.stringify(outcomes));
  assert(outcomes.every(outcome => outcome.winner !== null), 'Every bounded self-play game should finish naturally from this opening.');
});
