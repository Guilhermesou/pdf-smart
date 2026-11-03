'use client';
import { useState, useSyncExternalStore } from 'react';
import { useEditorViewModel } from '@/features/editor/view-model/use-editor-view-model';
import { EditorView } from '@/features/editor/views/editor-view';
import { createBrowserEditorServices } from '@/lib/platform/editor-services';
import { createEditorSessionStore } from '@/lib/platform/editor-session-store';
import type { EditorServices } from '@/features/editor/model/editor-services';

function EditorSession({ services }: { services: EditorServices }) {
  const model = useEditorViewModel(services);
  return <EditorView model={model} />;
}
export default function Home() {
  const [store] = useState(() =>
    createEditorSessionStore(createBrowserEditorServices),
  );
  const session = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  return session ? (
    <EditorSession key={session.id} services={session.services} />
  ) : (
    <main aria-busy="true">Abrindo editor…</main>
  );
}
