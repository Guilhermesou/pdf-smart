import { AnalysisCache } from './analysis-cache';
import { pruneResources } from './runtime';
import type { PageItem, Source } from './types';

/** Owns exactly one editor session, including active operations and deferred disposal. */
export class SessionResources {
  readonly sources = new Map<string, Source>();
  readonly thumbnailUrls = new Set<string>();
  readonly cache = new AnalysisCache();
  private readonly controller = new AbortController();
  private readonly active = new Set<Promise<unknown>>();
  private readonly retiring = new Set<Promise<void>>();
  private retained:
    | { pages: PageItem[]; history: PageItem[][]; revision: number }
    | undefined;
  private revision = 0;
  private disposal: Promise<void> | undefined;
  private closed = false;
  private readonly revoke: (url: string) => void;
  constructor(
    revoke: (url: string) => void = (url) => URL.revokeObjectURL(url),
  ) {
    this.revoke = revoke;
  }
  get signal() {
    return this.controller.signal;
  }
  assertOpen() {
    if (this.closed) throw new Error('A sessão do documento foi encerrada.');
  }
  addSource(id: string, source: Source) {
    this.assertOpen();
    this.revision++;
    let destruction: Promise<void> | undefined;
    this.sources.set(id, {
      ...source,
      destroy: () => {
        if (!destruction) {
          destruction = Promise.resolve()
            .then(() => source.destroy())
            .finally(() => {
              this.retiring.delete(destruction!);
            });
          this.retiring.add(destruction);
        }
        return destruction;
      },
    });
  }
  addThumbnail(url: string) {
    this.assertOpen();
    this.revision++;
    this.thumbnailUrls.add(url);
  }
  run<T>(operation: () => Promise<T>): Promise<T> {
    this.assertOpen();
    const pending = Promise.resolve()
      .then(() => {
        this.assertOpen();
        return operation();
      })
      .finally(() => {
        this.active.delete(pending);
        this.flushRetained();
      });
    this.active.add(pending);
    return pending;
  }
  retain(pages: PageItem[], history: PageItem[][]) {
    if (this.closed) return;
    this.retained = { pages, history, revision: this.revision };
    this.flushRetained();
  }
  private flushRetained() {
    if (this.closed || this.active.size || !this.retained) return;
    const { pages, history, revision } = this.retained;
    this.retained = undefined;
    // A snapshot predating newly imported resources cannot decide their lifetime.
    if (revision !== this.revision) return;
    pruneResources(
      this.sources,
      this.thumbnailUrls,
      pages,
      history,
      this.revoke,
    );
    this.cache.retainSources(new Set(this.sources.keys()));
  }
  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.closed = true;
    this.controller.abort();
    this.disposal = (async () => {
      await Promise.allSettled(this.active);
      const destroying = [...this.sources.values()].map((source) =>
        source.destroy(),
      );
      this.sources.clear();
      for (const url of this.thumbnailUrls) this.revoke(url);
      this.thumbnailUrls.clear();
      this.cache.clear();
      await Promise.allSettled([...destroying, ...this.retiring]);
    })();
    return this.disposal;
  }
}
