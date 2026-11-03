'use client';
import { useRef, useState } from 'react';
export type EditorOperation = 'import' | 'analysis' | 'export' | 'compress';

/** A synchronous gate prevents repeated clicks before React commits busy state. */
export function useEditorOperation() {
  const [operation, setOperation] = useState<EditorOperation | null>(null);
  const [busy, setBusy] = useState('');
  const locked = useRef(false);
  const cancel = useRef(false);
  function beginOperation(kind: EditorOperation, message: string) {
    if (locked.current) return false;
    locked.current = true;
    cancel.current = false;
    setOperation(kind);
    setBusy(message);
    return true;
  }
  function finishOperation() {
    locked.current = false;
    setOperation(null);
    setBusy('');
  }
  function requestCancel() {
    cancel.current = true;
  }
  function resetCancel() {
    cancel.current = false;
  }
  return {
    operation,
    busy,
    setBusy,
    locked,
    cancel,
    beginOperation,
    finishOperation,
    requestCancel,
    resetCancel,
  };
}
