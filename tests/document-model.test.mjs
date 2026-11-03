import test from 'node:test';
import assert from 'node:assert/strict';
import {
  documentReducer,
  createDocumentState,
  movePage,
  rotatePages,
  duplicatePages,
  HISTORY_LIMIT,
} from '../features/editor/model/document.ts';
const page = (id) => ({
  id,
  source: 'original',
  index: 0,
  rotation: 0,
  thumb: 'blob:original',
  text: '',
  ink: 0,
});
const commit = (state, pages) =>
  documentReducer(state, { type: 'commit', pages });

test('consecutive commits use the latest document, undo and redo are atomic', () => {
  const first = [page('a')],
    second = [...first, page('b')];
  let state = commit(createDocumentState(), first);
  state = commit(state, second);
  state = documentReducer(state, { type: 'select', selected: new Set(['b']) });
  const undone = documentReducer(state, { type: 'undo' });
  assert.deepEqual(undone.pages, first);
  assert.deepEqual(undone.future, [second]);
  assert.equal(undone.selected.size, 0);
  const redone = documentReducer(undone, { type: 'redo' });
  assert.deepEqual(redone.pages, second);
  assert.equal(redone.future.length, 0);
  assert.deepEqual(state.pages, second);
});

test('editing after undo invalidates redo and retains only existing selections', () => {
  let state = commit(commit(createDocumentState(), [page('a')]), [
    page('a'),
    page('b'),
  ]);
  state = documentReducer(state, { type: 'undo' });
  state = documentReducer(state, {
    type: 'select',
    selected: new Set(['a', 'b']),
  });
  state = commit(state, [page('c')]);
  assert.equal(state.future.length, 0);
  assert.equal(state.selected.size, 0);
});

test('incremental import is committed against the snapshot before import', () => {
  const original = [page('a')],
    imported = [...original, page('b'), page('c')];
  let state = commit(createDocumentState(), original);
  state = documentReducer(state, {
    type: 'replace',
    pages: [...original, page('b')],
  });
  state = documentReducer(state, {
    type: 'commit',
    pages: imported,
    previous: original,
  });
  assert.deepEqual(documentReducer(state, { type: 'undo' }).pages, original);
  assert.deepEqual(
    documentReducer(documentReducer(state, { type: 'undo' }), { type: 'redo' })
      .pages,
    imported,
  );
});

test('analysis replaces evidence without adding an undo entry', () => {
  let state = commit(createDocumentState(), [page('a')]);
  const history = state.history;
  state = documentReducer(state, {
    type: 'replace',
    pages: (pages) => pages.map((p) => ({ ...p, text: 'evidence' })),
  });
  assert.equal(state.pages[0].text, 'evidence');
  assert.equal(state.history, history);
});

test('history stays bounded and clearing removes all retained snapshots', () => {
  let state = createDocumentState();
  for (let i = 0; i < HISTORY_LIMIT + 10; i++)
    state = commit(state, [page(String(i))]);
  assert.equal(state.history.length, HISTORY_LIMIT);
  state = documentReducer(state, { type: 'undo' });
  const cleared = documentReducer(state, { type: 'clear' });
  assert.deepEqual(cleared, createDocumentState());
  assert.equal(documentReducer(cleared, { type: 'undo' }), cleared);
  assert.equal(documentReducer(cleared, { type: 'redo' }), cleared);
});

test('moving invalid IDs or destinations is a no-op; valid moves preserve original pages', () => {
  const pages = [page('a'), page('b'), page('c')];
  for (const [id, destination] of [
    ['missing', 0],
    ['a', -1],
    ['a', 3],
    ['a', 0],
  ])
    assert.equal(movePage(pages, id, destination), pages);
  assert.deepEqual(
    movePage(pages, 'a', 2).map((p) => p.id),
    ['b', 'c', 'a'],
  );
  assert.deepEqual(
    pages.map((p) => p.id),
    ['a', 'b', 'c'],
  );
});

test('rotation and duplication preserve shared sources and change only selected pages', () => {
  const pages = [page('a'), { ...page('b'), rotation: 270 }],
    selected = new Set(['b']);
  const rotated = rotatePages(pages, selected);
  assert.equal(rotated[0], pages[0]);
  assert.equal(rotated[1].rotation, 0);
  assert.equal(pages[1].rotation, 270);
  const duplicated = duplicatePages(pages, selected, () => 'copy');
  assert.deepEqual(
    duplicated.map((p) => p.id),
    ['a', 'b', 'copy'],
  );
  assert.equal(duplicated[2].source, pages[1].source);
  assert.equal(duplicated[2].thumb, pages[1].thumb);
  assert.equal(duplicated[2].rotation, 270);
});
