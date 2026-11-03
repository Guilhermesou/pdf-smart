'use client';
import { useReducer, type SetStateAction } from 'react';
import type { PageItem } from '@/lib/pdf/types';
import { createDocumentState, documentReducer } from '../model/document';

export function useDocumentModel() {
  const [state, dispatch] = useReducer(
    documentReducer,
    undefined,
    createDocumentState,
  );
  return {
    ...state,
    setPages: (pages: SetStateAction<PageItem[]>) =>
      dispatch({ type: 'replace', pages }),
    setSelected: (selected: SetStateAction<Set<string>>) =>
      dispatch({ type: 'select', selected }),
    commit: (pages: PageItem[], previous?: PageItem[]) =>
      dispatch({ type: 'commit', pages, previous }),
    undo: () => dispatch({ type: 'undo' }),
    redo: () => dispatch({ type: 'redo' }),
    clear: () => dispatch({ type: 'clear' }),
  };
}
