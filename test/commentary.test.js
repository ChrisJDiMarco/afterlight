import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMove, createGame, legalMoves, positionKey } from '../src/engine.js';
import { explainMove } from '../src/commentary.js';

function fixture({ sparks = [{ id: 0, row: 2, col: 1, entry: 0 }], scores = [0, 0], turn = 0, tiles = Array(36).fill(0) } = {}) {
  return { tiles, sparks, scores, turn, ply: 0, winner: null, repetitions: {} };
}
const explain = (state, move) => explainMove(state, move, applyMove(state, move));

test('pass commentary describes continuing movement, deterministically', () => {
  const state = createGame();
  const result = explain(state, null);
  assert.match(result.summary, /Amber passes.*Every spark still advances/);
  assert.deepEqual(result, explain(state, null));
  assert.deepEqual(Object.keys(result).sort(), ['consequence', 'insight', 'summary', 'tag', 'title']);
});

test('empty setup makes no claim to change movement on this advance', () => {
  const result = explain(fixture(), 0);
  assert.equal(result.tag, 'PREPARATION');
  assert.match(result.summary, /empty junction at A1/);
  assert.match(result.insight, /No spark reaches.*changes no route on the current advance/);
});

test('arriving sparks lock the turned junction only for their next exit', () => {
  const state = fixture();
  const moved = applyMove(state, 14);
  assert.deepEqual(moved.state.sparks, applyMove(state, null).state.sparks);
  assert.notDeepEqual(applyMove(moved.state, null).state.sparks, applyMove(applyMove(state, null).state, null).state.sparks);
  const result = explainMove(state, 14, moved);
  assert.match(result.summary, /C3.*one spark arriving/);
  assert.match(result.insight, /next exit.*locked against Blue/);
});

function edgeApproach(tile, scores = [0, 0], turn = 0) {
  const tiles = Array(36).fill(0);
  tiles[18] = 1;
  tiles[12] = tile;
  return fixture({ tiles, scores, turn, sparks: [{ id: 0, row: 3, col: 0, entry: 3 }] });
}

test('exact next-advance counterfactual supports a collection denial', () => {
  const result = explain(edgeApproach(0, [0, 0], 1), 12);
  assert.equal(result.tag, 'INTERCEPTION');
  assert.match(result.insight, /prevents Amber from collecting one spark on the next advance/);
});

test('next-advance collection and forced finish use occupied departures', () => {
  assert.match(explain(edgeApproach(1), 12).insight, /guaranteed to collect one spark/);
  assert.match(explain(edgeApproach(1, [4, 0]), 12).insight, /Amber will reach 5.*No legal reply/);
  assert.match(explain(edgeApproach(1, [3, 4]), 12).insight, /four each.*No legal reply can prevent the draw/);
  const winning = applyMove(edgeApproach(1, [4, 0]), 12).state;
  for (const reply of legalMoves(winning)) assert.equal(applyMove(winning, reply).state.winner, 0);
});

test('a repetition after passing is not called an unavoidable draw', () => {
  const state = fixture();
  const next = applyMove(applyMove(state, 0).state, null).state;
  state.repetitions[positionKey(next)] = 2;
  assert.equal(applyMove(applyMove(state, 0).state, null).state.winner, 'draw');
  assert.doesNotMatch(explain(state, 0).insight, /draw|finish/);
});

test('immediate points are not falsely attributed to an empty flip', () => {
  const state = fixture({ sparks: [{ id: 0, row: 2, col: 0, entry: 2 }] });
  const result = explain(state, 35);
  assert.match(result.consequence, /Amber collects one spark.*exits were already set/);
});

test('winning, drawn, and already completed games never simulate an illegal pass', () => {
  for (const scores of [[4, 0], [3, 4]]) {
    const state = fixture({ scores, sparks: [{ id: 0, row: 2, col: 0, entry: 2 }] });
    const result = applyMove(state, null);
    assert.equal(explainMove(state, null, result).tag, 'FINALE');
    assert.equal(explainMove(result.state, null, result).tag, 'FINALE');
  }
});
