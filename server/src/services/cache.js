export class TtlCache {
  constructor() {
    this.items = new Map();
  }

  get(key) {
    const item = this.items.get(key);

    if (!item) {
      return null;
    }

    if (Date.now() > item.expiresAt) {
      this.items.delete(key);
      return null;
    }

    return item.value;
  }

  set(key, value, ttlMs) {
    this.items.set(key, {
      value,
      expiresAt: Date.now() + ttlMs
    });
  }

  async remember(key, ttlMs, loader) {
    const cached = this.get(key);

    if (cached) {
      return {
        ...cached,
        cache: {
          hit: true,
          key,
          ttlMs
        }
      };
    }

    const value = await loader();
    this.set(key, value, ttlMs);

    return {
      ...value,
      cache: {
        hit: false,
        key,
        ttlMs
      }
    };
  }
}

export const cache = new TtlCache();

export const ttl = {
  live: 15 * 1000,
  fixtures: 60 * 1000,
  standings: 2 * 60 * 1000,
  bracket: 2 * 60 * 1000,
  predictions: 10 * 60 * 1000,
  odds: 15 * 60 * 1000,
  reference: 24 * 60 * 60 * 1000
};
