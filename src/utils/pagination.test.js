import { describe, it, expect } from 'vitest';
import { fetchAllPages } from './pagination.js';

function pagedClient(items, wrap) {
  const calls = [];
  return {
    calls,
    async call(method, params) {
      calls.push(params.start);
      const page = items.slice(params.start, params.start + 50);
      return { result: wrap(page), total: items.length };
    },
  };
}

const items = Array.from({ length: 120 }, (_, i) => ({ id: i + 1 }));

describe('fetchAllPages', () => {
  it('pages through array results', async () => {
    const client = pagedClient(items, p => p);
    const out = await fetchAllPages(client, 'x.list');
    expect(out).toHaveLength(120);
    expect(client.calls).toEqual([0, 50, 100]);
  });

  it('pages through REST 2 object results with an explicit key', async () => {
    const client = pagedClient(items, p => ({ products: p }));
    const out = await fetchAllPages(client, 'catalog.product.list', {}, 'products');
    expect(out).toHaveLength(120);
    expect(out[0]).toEqual({ id: 1 });
  });

  it('detects the single list property when no key is given', async () => {
    const client = pagedClient(items, p => ({ items: p }));
    const out = await fetchAllPages(client, 'crm.item.list');
    expect(out).toHaveLength(120);
    expect(client.calls).toEqual([0, 50, 100]);
  });

  it('stops on an empty object page', async () => {
    const client = pagedClient([], p => ({ sections: p }));
    expect(await fetchAllPages(client, 'catalog.section.list', {}, 'sections')).toEqual([]);
  });
});
