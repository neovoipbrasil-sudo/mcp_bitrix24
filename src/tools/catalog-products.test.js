import { describe, it, expect } from 'vitest';
import {
  listProducts, getProduct, createProduct, updateProduct, listSections, resolveProductIblockId,
} from './catalog-products.js';

// Portal falso que responde como REST 2: result.<plural>, 50 por página, filtros por iblockId/productId.
function fakeClient() {
  const data = {
    catalogs: [
      { id: 16, iblockId: 16, name: 'Ofertas', productIblockId: 14 },
      { id: 14, iblockId: 14, name: 'Catálogo CRM', productIblockId: null },
    ],
    sections: [
      { id: 1, iblockId: 14, iblockSectionId: null, name: 'Telefonia' },
      { id: 9, iblockId: 99, iblockSectionId: null, name: 'Outro catálogo' },
    ],
    products: [
      ...Array.from({ length: 55 }, (_, i) => ({ id: i + 1, iblockId: 14, name: `P${i + 1}`, type: 1, active: 'Y' })),
      { id: 500, iblockId: 14, name: 'Ramal', type: 7, active: 'Y' },
    ],
    prices: [
      { id: 1, productId: 1, catalogGroupId: 1, price: 10, currency: 'BRL' },
      { id: 2, productId: 1, catalogGroupId: 2, price: 8, currency: 'BRL' },
      { id: 3, productId: 500, catalogGroupId: 1, price: 39.9, currency: 'BRL' },
    ],
    priceTypes: [{ id: 2, name: 'Atacado', base: 'N' }, { id: 1, name: 'Base', base: 'Y' }],
  };
  const calls = [];
  let nextId = 1000;
  const page = (items, key, start = 0) => ({ result: { [key]: items.slice(start, start + 50) }, total: items.length });
  async function call(method, params = {}) {
    calls.push({ method, params });
    const f = params.filter ?? {};
    switch (method) {
      case 'catalog.catalog.list': return page(data.catalogs, 'catalogs', params.start);
      case 'catalog.section.list': return page(data.sections.filter(s => s.iblockId === f.iblockId), 'sections', params.start);
      case 'catalog.product.list': return page(data.products.filter(p => p.iblockId === f.iblockId), 'products', params.start);
      case 'catalog.product.get': return { result: { product: data.products.find(p => p.id === params.id) ?? null } };
      case 'catalog.price.list': return page(data.prices.filter(p => f.productId.includes(p.productId)), 'prices', params.start);
      case 'catalog.priceType.list': return page(data.priceTypes, 'priceTypes', params.start);
      case 'catalog.product.add': {
        const p = { id: nextId++, type: 1, ...params.fields };
        data.products.push(p);
        return { result: { element: p } };
      }
      case 'catalog.product.update':
      case 'catalog.product.service.update':
        Object.assign(data.products.find(p => p.id === params.id), params.fields);
        return { result: { element: {} } };
      case 'catalog.price.add': {
        const pr = { id: nextId++, ...params.fields };
        data.prices.push(pr);
        return { result: { price: pr } };
      }
      case 'catalog.price.update':
        Object.assign(data.prices.find(p => p.id === params.id), params.fields);
        return { result: { price: {} } };
      default: throw new Error(`unsupported ${method}`);
    }
  }
  return { call, calls, data, portal: 'fake' };
}

describe('catalog-products tools', () => {
  it('resolves the product iblock (catalog without productIblockId)', async () => {
    expect(await resolveProductIblockId(fakeClient())).toBe(14);
  });

  it('lists products with camelCase select, required iblockId and base price', async () => {
    const client = fakeClient();
    const out = await listProducts(client, { filter: { active: 'Y' } });
    const listCall = client.calls.find(c => c.method === 'catalog.product.list');
    expect(listCall.params.filter).toEqual({ active: 'Y', iblockId: 14 });
    expect(listCall.params.select).toContain('id');
    expect(listCall.params.select).toContain('iblockSectionId');
    expect(listCall.params.select.some(f => f === f.toUpperCase() && f.length > 2)).toBe(false);
    expect(out.iblockId).toBe(14);
    expect(out.count).toBe(50);
    const p1 = out.products.find(p => p.id === 1);
    expect(p1).toMatchObject({ name: 'P1', price: 10, currency: 'BRL', priceId: 1 });
    expect(out.products.find(p => p.id === 2).price).toBeNull();
  });

  it('pages through result.products when all_pages is set', async () => {
    const out = await listProducts(fakeClient(), { all_pages: true, include_prices: false });
    expect(out.count).toBe(56);
    expect(out.products[55].price).toBeUndefined();
  });

  it('translates legacy uppercase filter/select keys', async () => {
    const client = fakeClient();
    await listProducts(client, { filter: { SECTION_ID: 5, '%NAME': 'pabx' }, select: ['ID', 'NAME', 'PRICE'], include_prices: false });
    const { params } = client.calls.find(c => c.method === 'catalog.product.list');
    expect(params.filter).toEqual({ iblockSectionId: 5, '%name': 'pabx', iblockId: 14 });
    expect(params.select).toEqual(['id', 'iblockId', 'name']);
  });

  it('uses an explicit iblock_id without calling catalog.catalog.list', async () => {
    const client = fakeClient();
    await listProducts(client, { iblock_id: 14, include_prices: false });
    expect(client.calls.some(c => c.method === 'catalog.catalog.list')).toBe(false);
  });

  it('gets a product from result.product with its base price', async () => {
    const out = await getProduct(fakeClient(), { id: '500' });
    expect(out.product).toMatchObject({ id: 500, name: 'Ramal', price: 39.9 });
  });

  it('creates a product with iblockId and sets the base price via catalog.price.add', async () => {
    const client = fakeClient();
    const out = await createProduct(client, { fields: { NAME: 'Headset', SECTION_ID: 1, PRICE: 120, CURRENCY_ID: 'BRL' } });
    const add = client.calls.find(c => c.method === 'catalog.product.add');
    expect(add.params.fields).toEqual({ name: 'Headset', iblockSectionId: 1, iblockId: 14 });
    expect(out.created_id).toBe(1000);
    const priceAdd = client.calls.find(c => c.method === 'catalog.price.add');
    expect(priceAdd.params.fields).toEqual({ productId: 1000, catalogGroupId: 1, price: 120, currency: 'BRL' });
  });

  it('rejects a product without name', async () => {
    await expect(createProduct(fakeClient(), { fields: { previewText: 'x' } })).rejects.toThrow(/name/);
  });

  it('updates fields with the method for the item type and updates the existing base price', async () => {
    const client = fakeClient();
    await updateProduct(client, { id: 500, fields: { name: 'Ramal virtual', price: 45 } });
    const upd = client.calls.find(c => c.method === 'catalog.product.service.update');
    expect(upd.params).toEqual({ id: 500, fields: { name: 'Ramal virtual' } });
    const priceUpd = client.calls.find(c => c.method === 'catalog.price.update');
    expect(priceUpd.params).toEqual({ id: 3, fields: { price: 45, currency: 'BRL' } });
  });

  it('updates only the base price (not the wholesale one) of a simple product', async () => {
    const client = fakeClient();
    await updateProduct(client, { id: 1, fields: { price: 12 } });
    expect(client.calls.some(c => c.method === 'catalog.product.update')).toBe(false);
    expect(client.data.prices.find(p => p.id === 1).price).toBe(12);
    expect(client.data.prices.find(p => p.id === 2).price).toBe(8);
  });

  it('lists sections with select and filter.iblockId', async () => {
    const client = fakeClient();
    const out = await listSections(client, {});
    const call = client.calls.find(c => c.method === 'catalog.section.list');
    expect(call.params.filter).toEqual({ iblockId: 14 });
    expect(call.params.select).toContain('iblockSectionId');
    expect(out).toMatchObject({ iblockId: 14, total: 1 });
    expect(out.sections[0].name).toBe('Telefonia');
    expect((await listSections(fakeClient(), { catalog_id: 99 })).sections[0].id).toBe(9);
  });
});
