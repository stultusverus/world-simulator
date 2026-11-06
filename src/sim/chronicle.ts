import { CHRONICLE_LIMIT } from '../config';
import type { ChronicleEntry, ChronicleKind } from '../world/types';

export class Chronicle {
  entries: ChronicleEntry[] = [];

  add(year: number, kind: ChronicleKind, text: string, civ?: number, x?: number, y?: number): void {
    this.entries.push({ year, kind, text, civ, x, y });
    if (this.entries.length > CHRONICLE_LIMIT) {
      this.entries.splice(0, this.entries.length - CHRONICLE_LIMIT);
    }
  }

  recent(limit = 120): ChronicleEntry[] {
    if (limit >= this.entries.length) return this.entries;
    return this.entries.slice(this.entries.length - limit);
  }

  clear(): void {
    this.entries = [];
  }
}
