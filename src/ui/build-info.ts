/** Header build label; constants are injected by Vite and defined in Vitest. */
export function buildVersionLabel(): string {
  return `${__COMMIT_HASH__} · built ${__BUILD_DATE__}`;
}
