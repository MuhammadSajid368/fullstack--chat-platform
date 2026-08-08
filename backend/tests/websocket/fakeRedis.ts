import type { Redis } from "ioredis";

type Entry = { value: string; expiresAt?: number };

/**
 * Minimal Redis stub for socket/presence unit tests (no network).
 * Supports the O(1) commands used by PresenceRepository (including pipelines).
 */
export function createFakeRedis(): Redis {
  const store = new Map<string, Entry>();
  const sets = new Map<string, Set<string>>();
  const hashes = new Map<string, Map<string, string>>();

  const isExpired = (entry: Entry | undefined): boolean =>
    Boolean(entry?.expiresAt && entry.expiresAt < Date.now());

  const getString = (key: string): string | null => {
    const entry = store.get(key);
    if (!entry) {
      return null;
    }
    if (isExpired(entry)) {
      store.delete(key);
      return null;
    }
    return entry.value;
  };

  const api: Record<string, unknown> = {
    status: "ready" as string,
    async connect() {
      this.status = "ready";
    },
    async quit() {
      this.status = "end";
    },
    disconnect() {
      this.status = "end";
    },
    duplicate() {
      return createFakeRedis();
    },
    async set(
      key: string,
      value: string,
      ...args: Array<string | number>
    ): Promise<"OK" | null> {
      const tokens = args.map(String);
      const nx = tokens.includes("NX");
      if (nx && getString(key) !== null) {
        return null;
      }
      const entry: Entry = { value };
      const exIdx = tokens.indexOf("EX");
      const pxIdx = tokens.indexOf("PX");
      if (exIdx >= 0 && tokens[exIdx + 1]) {
        entry.expiresAt = Date.now() + Number(tokens[exIdx + 1]) * 1000;
      }
      if (pxIdx >= 0 && tokens[pxIdx + 1]) {
        entry.expiresAt = Date.now() + Number(tokens[pxIdx + 1]);
      }
      store.set(key, entry);
      return "OK";
    },
    async exists(key: string): Promise<number> {
      if (getString(key) !== null) {
        return 1;
      }
      return hashes.has(key) || sets.has(key) ? 1 : 0;
    },
    async get(key: string): Promise<string | null> {
      return getString(key);
    },
    async del(...keys: string[]): Promise<number> {
      let n = 0;
      for (const key of keys) {
        if (store.delete(key)) {
          n += 1;
        }
        if (sets.delete(key)) {
          n += 1;
        }
        if (hashes.delete(key)) {
          n += 1;
        }
      }
      return n;
    },
    async sadd(key: string, ...members: string[]): Promise<number> {
      let set = sets.get(key);
      if (!set) {
        set = new Set();
        sets.set(key, set);
      }
      let added = 0;
      for (const m of members) {
        if (!set.has(m)) {
          set.add(m);
          added += 1;
        }
      }
      return added;
    },
    async srem(key: string, ...members: string[]): Promise<number> {
      const set = sets.get(key);
      if (!set) {
        return 0;
      }
      let removed = 0;
      for (const m of members) {
        if (set.delete(m)) {
          removed += 1;
        }
      }
      return removed;
    },
    async scard(key: string): Promise<number> {
      return sets.get(key)?.size ?? 0;
    },
    async smembers(key: string): Promise<string[]> {
      return [...(sets.get(key) ?? [])];
    },
    async expire(key: string, _seconds: number): Promise<number> {
      return store.has(key) || sets.has(key) || hashes.has(key) ? 1 : 0;
    },
    async pexpire(key: string, _ms: number): Promise<number> {
      const entry = store.get(key);
      if (entry) {
        entry.expiresAt = Date.now() + _ms;
        return 1;
      }
      return store.has(key) || sets.has(key) || hashes.has(key) ? 1 : 0;
    },
    async incr(key: string): Promise<number> {
      const current = Number(getString(key) ?? 0);
      const next = current + 1;
      store.set(key, { value: String(next) });
      return next;
    },
    async decr(key: string): Promise<number> {
      const current = Number(getString(key) ?? 0);
      const next = current - 1;
      store.set(key, { value: String(next) });
      return next;
    },
    async incrby(key: string, amount: number): Promise<number> {
      const current = Number(getString(key) ?? 0);
      const next = current + amount;
      store.set(key, { value: String(next) });
      return next;
    },
    async decrby(key: string, amount: number): Promise<number> {
      const current = Number(getString(key) ?? 0);
      const next = current - amount;
      store.set(key, { value: String(next) });
      return next;
    },
    async scan(
      _cursor: string,
      ...args: Array<string | number>
    ): Promise<[string, string[]]> {
      const tokens = args.map(String);
      const matchIdx = tokens.indexOf("MATCH");
      const pattern = matchIdx >= 0 ? tokens[matchIdx + 1] ?? "*" : "*";
      const prefix = pattern.endsWith("*") ? pattern.slice(0, -1) : pattern;
      const keys: string[] = [];
      for (const key of store.keys()) {
        if (getString(key) === null) {
          continue;
        }
        if (pattern === "*" || key.startsWith(prefix) || key === pattern) {
          keys.push(key);
        }
      }
      return ["0", keys];
    },
    async hset(key: string, ...fieldValues: string[]): Promise<number> {
      let hash = hashes.get(key);
      if (!hash) {
        hash = new Map();
        hashes.set(key, hash);
      }
      let added = 0;
      for (let i = 0; i < fieldValues.length; i += 2) {
        const field = fieldValues[i];
        const value = fieldValues[i + 1];
        if (field === undefined || value === undefined) {
          break;
        }
        if (!hash.has(field)) {
          added += 1;
        }
        hash.set(field, value);
      }
      return added;
    },
    async hget(key: string, field: string): Promise<string | null> {
      return hashes.get(key)?.get(field) ?? null;
    },
    async hmget(key: string, ...fields: string[]): Promise<Array<string | null>> {
      const hash = hashes.get(key);
      return fields.map((f) => hash?.get(f) ?? null);
    },
    async hgetall(key: string): Promise<Record<string, string>> {
      const hash = hashes.get(key);
      if (!hash) {
        return {};
      }
      return Object.fromEntries(hash.entries());
    },
    pipeline() {
      const ops: Array<() => Promise<unknown>> = [];
      const chain: Record<string, unknown> = {};
      const add = (fn: () => Promise<unknown>) => {
        ops.push(fn);
        return chain;
      };
      chain.sadd = (key: string, ...members: string[]) =>
        add(() => api.sadd(key, ...members) as Promise<unknown>);
      chain.srem = (key: string, ...members: string[]) =>
        add(() => api.srem(key, ...members) as Promise<unknown>);
      chain.expire = (key: string, seconds: number) =>
        add(() => api.expire(key, seconds) as Promise<unknown>);
      chain.pexpire = (key: string, ms: number) =>
        add(() => api.pexpire(key, ms) as Promise<unknown>);
      chain.hset = (key: string, ...fieldValues: string[]) =>
        add(() => api.hset(key, ...fieldValues) as Promise<unknown>);
      chain.hgetall = (key: string) =>
        add(() => api.hgetall(key) as Promise<unknown>);
      chain.del = (...keys: string[]) =>
        add(() => api.del(...keys) as Promise<unknown>);
      chain.set = (key: string, value: string, ...args: Array<string | number>) =>
        add(() => api.set(key, value, ...args) as Promise<unknown>);
      chain.exec = async () => {
        const out: Array<[Error | null, unknown]> = [];
        for (const op of ops) {
          try {
            out.push([null, await op()]);
          } catch (err) {
            out.push([err as Error, null]);
          }
        }
        return out;
      };
      return chain;
    },
  };

  return api as unknown as Redis;
}
