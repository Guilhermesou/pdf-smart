'use client';
import { useEffect, useRef } from 'react';
import type { PageItem } from '@/lib/pdf/types';

/** Owns browser subscriptions; the editor model has no browser API dependency. */
export function useDocumentBridge(pages: PageItem[], busy: string) {
  const state = useRef({ pages, busy });
  useEffect(() => {
    state.current = { pages, busy };
  }, [pages, busy]);
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (tool: unknown, options: unknown) => void;
        };
      }
    ).modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    try {
      context.registerTool(
        {
          name: 'read_pdf_pages',
          description: 'Lista páginas e resultados da análise do PDF aberto.',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute: (input: unknown) => {
            if (
              !input ||
              typeof input !== 'object' ||
              Object.keys(input).length
            )
              throw new Error('Informe um objeto vazio.');
            return {
              busy: state.current.busy,
              pages: state.current.pages.map((p, i) => ({
                position: i + 1,
                rotation: p.rotation,
                verdict: p.verdict?.kind ?? 'not_analyzed',
              })),
            };
          },
        },
        { signal: lifecycle.signal },
      );
    } catch {}
    return () => lifecycle.abort();
  }, []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (state.current.pages.length) {
        e.preventDefault();
        // Required by older desktop WebViews.
        // oxlint-disable-next-line typescript/no-deprecated
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
}
