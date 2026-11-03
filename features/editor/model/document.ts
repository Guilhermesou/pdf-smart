import type { PageItem } from '../../../lib/pdf/types';

export const HISTORY_LIMIT = 20;
export type DocumentState = {
  pages: PageItem[];
  selected: Set<string>;
  history: PageItem[][];
  future: PageItem[][];
};
export const createDocumentState = (): DocumentState => ({
  pages: [],
  selected: new Set(),
  history: [],
  future: [],
});
type Change<T> = T | ((previous: T) => T);
export type DocumentAction =
  | { type: 'replace'; pages: Change<PageItem[]> }
  | { type: 'select'; selected: Change<Set<string>> }
  | { type: 'commit'; pages: PageItem[]; previous?: PageItem[] }
  | { type: 'undo' | 'redo' | 'clear' };
const appendHistory = (history: PageItem[][], pages: PageItem[]) => [
  ...history.slice(-(HISTORY_LIMIT - 1)),
  pages,
];

/** Pure, atomic document transitions. Temporary import/analysis updates aren't edits. */
export function documentReducer(
  state: DocumentState,
  action: DocumentAction,
): DocumentState {
  switch (action.type) {
    case 'replace':
      return {
        ...state,
        pages:
          typeof action.pages === 'function'
            ? action.pages(state.pages)
            : action.pages,
      };
    case 'select':
      return {
        ...state,
        selected:
          typeof action.selected === 'function'
            ? action.selected(state.selected)
            : action.selected,
      };
    case 'commit': {
      if (action.pages === state.pages && !action.previous) return state;
      const ids = new Set(action.pages.map((page) => page.id));
      return {
        pages: action.pages,
        selected: new Set([...state.selected].filter((id) => ids.has(id))),
        history: appendHistory(state.history, action.previous ?? state.pages),
        future: [],
      };
    }
    case 'undo':
      if (!state.history.length) return state;
      return {
        pages: state.history.at(-1)!,
        selected: new Set(),
        history: state.history.slice(0, -1),
        future: appendHistory(state.future, state.pages),
      };
    case 'redo':
      if (!state.future.length) return state;
      return {
        pages: state.future.at(-1)!,
        selected: new Set(),
        history: appendHistory(state.history, state.pages),
        future: state.future.slice(0, -1),
      };
    case 'clear':
      return createDocumentState();
  }
}

export function movePage(
  pages: PageItem[],
  id: string,
  destination: number,
): PageItem[] {
  const from = pages.findIndex((page) => page.id === id);
  if (
    from < 0 ||
    destination < 0 ||
    destination >= pages.length ||
    from === destination
  )
    return pages;
  const next = [...pages];
  const [page] = next.splice(from, 1);
  next.splice(destination, 0, page);
  return next;
}
export function rotatePages(pages: PageItem[], selected: Set<string>) {
  return pages.map((page) =>
    selected.has(page.id)
      ? { ...page, rotation: (page.rotation + 90) % 360 }
      : page,
  );
}
export function duplicatePages(
  pages: PageItem[],
  selected: Set<string>,
  createId: () => string,
) {
  return pages.flatMap((page) =>
    selected.has(page.id) ? [page, { ...page, id: createId() }] : [page],
  );
}
