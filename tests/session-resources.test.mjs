import './register-types.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { SessionResources } = await import('../lib/pdf/session-resources.ts');
const { requestWorker } = await import('../lib/pdf/worker-client.ts');
const source = (destroy) => ({
  name: 'test.pdf',
  file: new Blob(),
  doc: {},
  destroy,
});
const page = { source: 'a', thumb: 'blob:a' };
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test('sessions isolate documents, thumbnails and OCR evidence', async () => {
  const revokedA = [],
    revokedB = [];
  const a = new SessionResources((url) => revokedA.push(url));
  const b = new SessionResources((url) => revokedB.push(url));
  let destroyedA = 0,
    destroyedB = 0;
  a.addSource(
    'a',
    source(async () => {
      destroyedA++;
    }),
  );
  b.addSource(
    'a',
    source(async () => {
      destroyedB++;
    }),
  );
  a.addThumbnail('blob:a');
  b.addThumbnail('blob:b');
  a.cache.set('a:0', {
    plainOcr: { data: { text: 'private', confidence: 90 }, review: false },
  });
  assert.equal(b.cache.get('a:0'), undefined);
  await a.dispose();
  assert.equal(a.cache.get('a:0'), undefined);
  assert.equal(b.signal.aborted, false);
  assert.equal(b.sources.size, 1);
  assert.equal(destroyedA, 1);
  assert.equal(destroyedB, 0);
  assert.deepEqual(revokedA, ['blob:a']);
  assert.deepEqual(revokedB, []);
  await b.dispose();
});

test('pruning waits for an active consumer and retains undo references', async () => {
  const revoked = [],
    session = new SessionResources((url) => revoked.push(url));
  let destroyed = 0;
  session.addSource(
    'a',
    source(async () => {
      destroyed++;
    }),
  );
  session.addThumbnail('blob:a');
  session.retain([], [[page]]);
  assert.equal(session.sources.size, 1);
  const read = deferred();
  const pending = session.run(() => read.promise);
  session.retain([], []);
  assert.equal(session.sources.size, 1);
  read.resolve();
  await pending;
  assert.equal(session.sources.size, 0);
  assert.equal(destroyed, 1);
  assert.deepEqual(revoked, ['blob:a']);
  await session.dispose();
  assert.equal(destroyed, 1);
});

test('close aborts the session, rejects new operations and waits before destruction', async () => {
  const session = new SessionResources(() => {}),
    job = deferred();
  let destroyed = 0,
    completed = false;
  session.addSource(
    'a',
    source(async () => {
      destroyed++;
    }),
  );
  const pending = session.run(() => job.promise);
  await Promise.resolve();
  const disposing = session.dispose();
  assert.equal(session.dispose(), disposing);
  assert.equal(session.signal.aborted, true);
  assert.throws(() => session.run(async () => {}), /encerrada/);
  void disposing.then(() => {
    completed = true;
  });
  await Promise.resolve();
  assert.equal(completed, false);
  assert.equal(destroyed, 0);
  job.resolve();
  await pending;
  await disposing;
  assert.equal(completed, true);
  assert.equal(destroyed, 1);
});

test('a stale retained snapshot cannot delete resources added by an import', async () => {
  const session = new SessionResources(() => {}),
    importing = deferred();
  const pending = session.run(async () => {
    await importing.promise;
    session.addSource(
      'a',
      source(async () => {}),
    );
    session.addThumbnail('blob:a');
  });
  session.retain([], []);
  importing.resolve();
  await pending;
  assert.equal(session.sources.size, 1);
  assert.equal(session.thumbnailUrls.size, 1);
  session.retain([page], []);
  assert.equal(session.sources.size, 1);
  await session.dispose();
});

test('close also waits for destruction already started by pruning', async () => {
  const session = new SessionResources(() => {}),
    destroying = deferred();
  let closed = false;
  session.addSource(
    'a',
    source(() => destroying.promise),
  );
  session.retain([], []);
  const disposing = session.dispose().then(() => {
    closed = true;
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(closed, false);
  destroying.resolve();
  await disposing;
  assert.equal(closed, true);
});

test('close settles a pending worker instead of leaving an unresolved promise', async () => {
  const session = new SessionResources(() => {});
  const worker = {
    postMessage() {},
    terminate() {
      this.terminated = true;
    },
  };
  const pending = session.run(() =>
    requestWorker(
      worker,
      { type: 'save' },
      { signal: session.signal, expected: 'result' },
    ),
  );
  const rejected = assert.rejects(pending, /encerrada/);
  await Promise.resolve();
  await session.dispose();
  await rejected;
  assert.equal(worker.terminated, true);
  assert.equal(worker.onmessage, null);
});
