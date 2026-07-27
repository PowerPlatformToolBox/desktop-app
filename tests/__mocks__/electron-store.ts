/**
 * Manual mock for the `electron-store` module.
 *
 * Replaces the file-backed Store with an in-memory Map so that unit tests
 * run without touching the filesystem and without requiring the Electron
 * runtime.
 */

interface StoreOptions<T extends Record<string, unknown>> {
    name?: string;
    defaults?: Partial<T>;
    schema?: unknown;
}

class MockStore<T extends Record<string, unknown>> {
    private data: Map<string, unknown>;
    private readonly defaults: Partial<T>;

    constructor(options: StoreOptions<T> = {}) {
        this.defaults = options.defaults ?? {};
        this.data = new Map<string, unknown>();
    }

    get store(): T {
        const result: Record<string, unknown> = { ...this.defaults };
        for (const [k, v] of this.data.entries()) {
            result[k] = v;
        }
        return result as T;
    }

    get<K extends keyof T>(key: K): T[K] {
        if (this.data.has(key as string)) {
            return this.data.get(key as string) as T[K];
        }
        return (this.defaults as T)[key];
    }

    set<K extends keyof T>(key: K, value: T[K]): void;
    set(key: string, value: unknown): void;
    set(key: string, value: unknown): void {
        this.data.set(key, value);
    }

    has(key: string): boolean {
        return this.data.has(key) || Object.prototype.hasOwnProperty.call(this.defaults, key);
    }

    delete(key: string): void {
        this.data.delete(key);
    }

    clear(): void {
        this.data.clear();
    }
}

export default MockStore;
