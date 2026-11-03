import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorSessionStore } from '../lib/platform/editor-session-store.ts';

test('session ownership starts on subscription, survives multiple readers and disposes exactly once', () => {
  let created = 0,
    disposed = 0;
  const store = createEditorSessionStore(() => {
    created++;
    return {
      disposeResources: async () => {
        disposed++;
      },
    };
  });
  assert.equal(created, 0);
  assert.equal(store.getSnapshot(), null);
  const first = store.subscribe(() => {}),
    snapshot = store.getSnapshot();
  const second = store.subscribe(() => {});
  assert.equal(created, 1);
  assert.equal(store.getSnapshot(), snapshot);
  first();
  assert.equal(disposed, 0);
  second();
  assert.equal(disposed, 1);
  assert.equal(store.getSnapshot(), null);
  second();
  assert.equal(disposed, 1);
});

test('StrictMode subscribe-cleanup-subscribe creates a fresh, open session', () => {
  const sessions = [];
  const store = createEditorSessionStore(() => {
    const session = {
      closed: false,
      disposeResources: async () => {
        session.closed = true;
      },
    };
    sessions.push(session);
    return session;
  });
  const release = store.subscribe(() => {}),
    old = store.getSnapshot();
  release();
  const close = store.subscribe(() => {}),
    current = store.getSnapshot();
  assert.notEqual(current.id, old.id);
  assert.equal(old.services.closed, true);
  assert.equal(current.services.closed, false);
  assert.equal(sessions.length, 2);
  assert.equal(store.getServerSnapshot(), null);
  close();
});
