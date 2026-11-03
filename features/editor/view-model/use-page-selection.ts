'use client';
import { useState } from 'react';
import {
  paritySelection,
  parsePageSelection,
  formatPageSelection,
} from '@/lib/pdf/selection';
import type { PageItem } from '@/lib/pdf/types';

export type PageSelectionProps = {
  pages: PageItem[];
  selected: Set<string>;
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>;
  candidates: PageItem[];
  shown: PageItem[];
  setMessage: (msg: string) => void;
};

export function usePageSelection({
  pages,
  selected,
  setSelected,
  candidates,
  shown,
  setMessage,
}: PageSelectionProps) {
  const [range, setRange] = useState('');
  const [rangeError, setRangeError] = useState('');
  const [filter, setFilter] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const selectParity = (parity: 'odd' | 'even') => {
    const nums = paritySelection(pages.length, parity);
    setSelected(new Set(nums.map((n) => pages[n - 1].id)));
    setRangeError('');
    setMessage(
      `${nums.length} páginas ${parity === 'odd' ? 'ímpares' : 'pares'} selecionadas na ordem atual.`,
    );
  };

  const applyRange = () => {
    try {
      const positions = parsePageSelection(range, pages.length);
      setSelected(new Set(positions.map((n) => pages[n - 1].id)));
      setRangeError('');
      setMessage(
        `${positions.length} páginas selecionadas: ${formatPageSelection(positions)}.`,
      );
    } catch (e) {
      setRangeError(e instanceof Error ? e.message : 'Seleção inválida.');
    }
  };

  const invertSelection = () =>
    setSelected(
      new Set(
        pages.filter((page) => !selected.has(page.id)).map((page) => page.id),
      ),
    );

  const selectSuggestions = () => {
    setSelected(new Set(candidates.map((page) => page.id)));
    setFilter(true);
  };

  const selectVisible = (checked: boolean) =>
    setSelected(checked ? new Set(shown.map((page) => page.id)) : new Set());

  const searchInPages = (term: string) => {
    const query = term.trim().toLowerCase();
    setSearchTerm(term);
    if (!query) return;
    const matches = pages.filter((p) => p.text.toLowerCase().includes(query));
    if (matches.length) {
      setSelected(new Set(matches.map((p) => p.id)));
      setMessage(
        `${matches.length} páginas encontradas contendo “${term.trim()}”.`,
      );
    } else {
      setMessage(`Nenhuma página contém o texto “${term.trim()}”.`);
    }
  };

  return {
    range,
    setRange,
    rangeError,
    setRangeError,
    filter,
    setFilter,
    searchTerm,
    setSearchTerm,
    searchInPages,
    applyRange,
    selectParity,
    invertSelection,
    selectSuggestions,
    selectVisible,
  };
}
