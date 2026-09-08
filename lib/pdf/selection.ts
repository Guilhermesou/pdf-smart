/** Strict 1-based page ranges. Invalid input never produces a partial selection. */
export function parsePageSelection(input: string, total: number): number[] {
  if (!input.trim())
    throw new Error('Informe páginas ou intervalos, como 1, 3, 5–10.');
  const chosen = new Set<number>();
  for (const token of input.replace(/[–—]/g, '-').split(/[,;]/)) {
    const match = token.trim().match(/^(\d+)\s*(?:-\s*(\d+))?$/);
    if (!match)
      throw new Error(`Trecho inválido: “${token.trim()}”. Use 1, 3, 5–10.`);
    const start = Number(match[1]),
      end = Number(match[2] ?? match[1]);
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 1 ||
      end > total ||
      start > end
    )
      throw new Error(
        `Use páginas de 1 a ${total} e intervalos em ordem crescente.`,
      );
    for (let n = start; n <= end; n++) chosen.add(n);
  }
  return [...chosen].sort((a, b) => a - b);
}
export function formatPageSelection(pages: number[]): string {
  const nums = [...new Set(pages)].sort((a, b) => a - b),
    ranges: string[] = [];
  for (let i = 0; i < nums.length; i++) {
    const start = nums[i];
    let end = start;
    while (nums[i + 1] === end + 1) end = nums[++i];
    ranges.push(start === end ? `${start}` : `${start}–${end}`);
  }
  return ranges.join(', ');
}
