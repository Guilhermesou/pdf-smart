'use client';
import { useEffect } from 'react';

export type EditorKeyboardProps = {
  busy: string;
  selectedSize: number;
  shownSize: number;
  undo: () => void;
  redo: () => void;
  remove: () => void;
  rotateSelected: () => void;
  selectVisible: (checked: boolean) => void;
  clearSelection: () => void;
  previewOpen: boolean;
  closePreview: () => void;
};

export function useEditorKeyboard({
  busy,
  selectedSize,
  shownSize,
  undo,
  redo,
  remove,
  rotateSelected,
  selectVisible,
  clearSelection,
  previewOpen,
  closePreview,
}: EditorKeyboardProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (e.key === 'Escape') {
        if (previewOpen) {
          e.preventDefault();
          closePreview();
        } else if (selectedSize > 0) {
          e.preventDefault();
          clearSelection();
        }
        return;
      }

      if (busy) return;

      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      if (modKey && (e.key === 'z' || e.key === 'Z')) {
        if (isInput) return;
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }

      if (!isMac && modKey && (e.key === 'y' || e.key === 'Y')) {
        if (isInput) return;
        e.preventDefault();
        redo();
        return;
      }

      if (modKey && (e.key === 'a' || e.key === 'A')) {
        if (isInput) return;
        e.preventDefault();
        selectVisible(true);
        return;
      }

      if (!isInput && selectedSize > 0) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          remove();
        } else if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          rotateSelected();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    busy,
    selectedSize,
    shownSize,
    undo,
    redo,
    remove,
    rotateSelected,
    selectVisible,
    clearSelection,
    previewOpen,
    closePreview,
  ]);
}
