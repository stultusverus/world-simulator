export function qs<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (value >= 10000) return `${Math.round(value / 1000)}k`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(Math.round(value));
}

export function formatYear(year: number): string {
  return `Year ${year}`;
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function barHtml(ratio: number, color: string): string {
  const percent = Math.round(clamp01(ratio) * 100);
  return `<span class="meter"><span class="meter-fill" style="width:${percent}%;background:${color}"></span></span>`;
}

export function makeElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
