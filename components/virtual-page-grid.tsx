'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { virtualWindow } from '@/lib/pdf/runtime';
export function VirtualPageGrid<T>({
  items,
  renderItem,
  empty,
  className = '',
}: {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  empty: ReactNode;
  className?: string;
}) {
  const view = useRef<HTMLDivElement>(null),
    [size, setSize] = useState({ width: 1000, height: 650 }),
    [top, setTop] = useState(0),
    [jump, setJump] = useState('');
  useEffect(() => {
    const node = view.current;
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setSize({ width: node.clientWidth, height: node.clientHeight }),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const columns =
      size.width < 500
        ? 2
        : Math.max(2, Math.min(6, Math.floor((size.width + 16) / 196))),
    width = (size.width - (columns - 1) * 16) / columns,
    rowHeight = Math.ceil((width - 20) * 1.26 + 130);
  const window = virtualWindow(
    items.length,
    columns,
    rowHeight,
    top,
    size.height,
  );
  useEffect(() => {
    const node = view.current;
    if (node && node.scrollTop > Math.max(0, window.height - size.height)) {
      node.scrollTop = Math.max(0, window.height - size.height);
      setTop(node.scrollTop);
    }
  }, [window.height, size.height]);
  return (
    <>
      <div className="grid-navigation">
        <span>
          {items.length
            ? `${window.start + 1}–${window.end} de ${items.length} miniaturas · role para continuar`
            : 'Nenhuma miniatura'}
        </span>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(jump);
            if (Number.isInteger(n) && n >= 1 && n <= items.length)
              view.current?.scrollTo({
                top: Math.floor((n - 1) / columns) * rowHeight,
                behavior: 'instant',
              });
          }}
        >
          <Input
            aria-label="Ir à miniatura na lista atual"
            type="number"
            min={1}
            max={items.length}
            value={jump}
            onChange={(e) => setJump(e.target.value)}
            placeholder="Nº"
          />
          <button className="secondary" disabled={!items.length}>
            Ir
          </button>
        </form>
      </div>
      <div
        className={`virtual-viewport ${className}`}
        ref={view}
        onScroll={(e) => setTop(e.currentTarget.scrollTop)}
        tabIndex={0}
        aria-label="Páginas do documento"
      >
        <div
          style={{
            height: items.length ? window.height : 260,
            position: 'relative',
          }}
        >
          {items.length ? (
            <div
              className="page-grid virtual-grid"
              style={{
                position: 'absolute',
                top: window.offset,
                width: '100%',
                display: 'grid',
                gridTemplateColumns: `repeat(${columns},minmax(0,1fr))`,
                gridAutoRows: rowHeight - 16,
                gap: 16,
              }}
            >
              {items
                .slice(window.start, window.end)
                .map((item, index) => renderItem(item, window.start + index))}
            </div>
          ) : (
            empty
          )}
        </div>
      </div>
    </>
  );
}
