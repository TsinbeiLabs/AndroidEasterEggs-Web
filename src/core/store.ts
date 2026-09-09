import type { EggStore } from './types';

const PREFIX = 'aee:';

function safeParse<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * localStorage backed store namespaced per egg. Falls back to an in-memory map
 * when storage is unavailable (private mode, sandboxed iframe, ...).
 */
export function createStore(namespace: string): EggStore {
  const memory = new Map<string, string>();
  let backend: 'local' | 'memory' = 'memory';

  try {
    const probe = `${PREFIX}probe`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    backend = 'local';
  } catch {
    backend = 'memory';
  }

  const key = (name: string) => `${PREFIX}${namespace}:${name}`;

  const read = (name: string): string | null =>
    backend === 'local' ? localStorage.getItem(key(name)) : (memory.get(key(name)) ?? null);

  const write = (name: string, value: string): void => {
    if (backend === 'local') {
      try {
        localStorage.setItem(key(name), value);
        return;
      } catch {
        backend = 'memory';
      }
    }
    memory.set(key(name), value);
  };

  return {
    get<T>(name: string, fallback: T): T {
      return safeParse<T>(read(name), fallback);
    },
    set<T>(name: string, value: T): void {
      write(name, JSON.stringify(value));
    },
    remove(name: string): void {
      if (backend === 'local') localStorage.removeItem(key(name));
      memory.delete(key(name));
    },
    clear(): void {
      const prefix = `${PREFIX}${namespace}:`;
      if (backend === 'local') {
        const doomed: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k !== null && k.startsWith(prefix)) doomed.push(k);
        }
        for (const k of doomed) localStorage.removeItem(k);
      }
      for (const k of Array.from(memory.keys())) {
        if (k.startsWith(prefix)) memory.delete(k);
      }
    },
  };
}
