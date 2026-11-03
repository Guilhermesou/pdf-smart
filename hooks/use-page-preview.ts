'use client';
import { useEffect, useRef, useState } from 'react';
import type { PageItem } from '@/lib/pdf/types';
import { canvasBlob, withAbort } from '@/lib/pdf/runtime';

export function usePagePreview(
  onError: (message: string) => void,
  render: (page: PageItem) => Promise<HTMLCanvasElement>,
  signal: AbortSignal,
) {
  const [previewPageId, setPreviewPageId] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewInfo, setPreviewInfo] = useState<PageItem['verdict']>();
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);
  const previewUrl = useRef<string | null>(null);
  const previewRequest = useRef(0);
  useEffect(
    () => () => {
      previewRequest.current++;
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );
  async function inspect(p: PageItem, i: number) {
    setPreviewPageId(p.id);
    const request = ++previewRequest.current;
    if (previewUrl.current) {
      URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = null;
    }
    setPreviewInfo(p.verdict);
    setPreviewTitle(`Página ${i + 1}`);
    setPreviewBusy(true);
    setPreview('');
    try {
      const canvas = await render(p);
      try {
        const blob = await withAbort(
          canvasBlob(canvas, 'image/webp', 0.95),
          signal,
        );
        if (request === previewRequest.current) {
          previewUrl.current = URL.createObjectURL(blob);
          setPreview(previewUrl.current);
        }
      } finally {
        canvas.width = 0;
      }
    } catch {
      if (request === previewRequest.current) {
        onError('Não foi possível ampliar esta página.');
        setPreview(null);
      }
    } finally {
      if (request === previewRequest.current) setPreviewBusy(false);
    }
  }
  function closePreview() {
    previewRequest.current++;
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    setPreview(null);
    setPreviewBusy(false);
    setPreviewPageId(null);
  }
  return {
    previewPageId,
    preview,
    previewInfo,
    previewTitle,
    previewBusy,
    inspect,
    closePreview,
  };
}
