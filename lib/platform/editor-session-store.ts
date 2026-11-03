/** Allocates at subscription time, so discarded renders and StrictMode don't own sessions. */
export function createEditorSessionStore<
  T extends { disposeResources: () => Promise<void> },
>(create: () => T) {
  let snapshot: { id: number; services: T } | null = null;
  let revision = 0;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => null,
    subscribe: (listener: () => void) => {
      if (!snapshot) snapshot = { id: ++revision, services: create() };
      const subscription = () => listener();
      listeners.add(subscription);
      let connected = true;
      return () => {
        if (!connected) return;
        connected = false;
        listeners.delete(subscription);
        if (!listeners.size && snapshot) {
          const previous = snapshot;
          snapshot = null;
          void previous.services.disposeResources();
        }
      };
    },
  };
}
