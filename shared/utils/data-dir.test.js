import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { resolveDataDir } from './data-dir.js';

describe('resolveDataDir', () => {
  it('usa DATA_DIR quando definida', () => {
    expect(resolveDataDir({ env: { DATA_DIR: '/vol/data' }, exists: () => true })).toBe('/vol/data');
  });

  it('usa src/bot/data quando a pasta antiga existe', () => {
    const dir = resolveDataDir({ env: {}, exists: () => true });
    expect(dir.endsWith(path.join('src', 'bot', 'data'))).toBe(true);
  });

  it('cai em bot/data por padrão', () => {
    const dir = resolveDataDir({ env: {}, exists: () => false });
    expect(dir.endsWith(path.join('bot', 'data'))).toBe(true);
    expect(dir.includes(path.join('src', 'bot'))).toBe(false);
  });
});
