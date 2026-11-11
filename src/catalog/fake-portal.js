// Portal Bitrix24 de mentira para testes e demonstração local do painel de catálogo.
// Responde aos métodos catalog.* no mesmo formato da REST 2 (result.<plural>, total, 50 por página).

export function fakeCatalogData() {
  return {
    catalogs: [
      { id: 14, iblockId: 14, name: 'Catálogo de produtos CRM', productIblockId: null },
      { id: 16, iblockId: 16, name: 'Catálogo de produtos CRM (ofertas)', productIblockId: 14 },
    ],
    sections: [
      { id: 1, iblockId: 14, iblockSectionId: null, name: 'Telefonia', sort: 100, active: 'Y' },
      { id: 2, iblockId: 14, iblockSectionId: 1, name: 'PABX', sort: 100, active: 'Y' },
      { id: 3, iblockId: 14, iblockSectionId: null, name: 'Equipamentos', sort: 200, active: 'Y' },
      { id: 4, iblockId: 14, iblockSectionId: null, name: 'equipamentos ', sort: 300, active: 'Y' },
      { id: 5, iblockId: 14, iblockSectionId: null, name: 'Teste antigo', sort: 400, active: 'Y' },
      { id: 6, iblockId: 14, iblockSectionId: null, name: 'Promoções 2023', sort: 500, active: 'Y' },
    ],
    products: [
      { id: 101, iblockId: 14, name: 'PABX em Nuvem - Ramal', active: 'Y', iblockSectionId: 2, type: 7, previewText: 'Ramal virtual. Cobrança mensal.' },
      { id: 102, iblockId: 14, name: 'INSTALAÇÃO PABX', active: 'Y', iblockSectionId: 1, type: 1, previewText: '' },
      { id: 103, iblockId: 14, name: 'Telefone IP Intelbras V3501', active: 'Y', iblockSectionId: 3, type: 1, previewText: 'Aparelho IP com 4 contas SIP.' },
      { id: 104, iblockId: 14, name: 'Headset USB', active: 'Y', iblockSectionId: 4, type: 1, previewText: '' },
      { id: 105, iblockId: 14, name: 'Telefone  IP Intelbras V3501', active: 'Y', iblockSectionId: 4, type: 1, previewText: '' },
      { id: 106, iblockId: 14, name: 'Número 0800', active: 'Y', iblockSectionId: null, type: 7, previewText: '' },
      { id: 107, iblockId: 14, name: 'Plano 1000 minutos', active: 'N', iblockSectionId: 6, type: 7, previewText: '' },
      { id: 108, iblockId: 14, name: 'Gateway GSM', active: 'Y', iblockSectionId: 3, type: 3, previewText: 'Gateway com 1, 2 ou 4 chips.' },
    ],
    offers: [
      { id: 201, iblockId: 16, name: 'Gateway GSM 1 chip', active: 'Y', parentId: { value: 108, valueId: 1 } },
      { id: 202, iblockId: 16, name: 'Gateway GSM 2 chips', active: 'Y', parentId: { value: 108, valueId: 2 } },
    ],
    prices: [
      { id: 1, productId: 101, catalogGroupId: 1, price: 39.9, currency: 'BRL' },
      { id: 2, productId: 103, catalogGroupId: 1, price: 489, currency: 'BRL' },
      { id: 3, productId: 104, catalogGroupId: 1, price: 0, currency: 'BRL' },
      { id: 4, productId: 105, catalogGroupId: 1, price: 499, currency: 'BRL' },
      { id: 5, productId: 106, catalogGroupId: 1, price: 150, currency: 'BRL' },
      { id: 6, productId: 107, catalogGroupId: 1, price: 99, currency: 'BRL' },
    ],
    priceTypes: [{ id: 1, name: 'Preço base', base: 'Y', sort: 100 }],
    measures: [{ id: 5, code: 796, measureTitle: 'Peça', symbol: 'pç', isDefault: 'Y' }],
    vats: [],
  };
}

export function createFakeCatalogClient(data = fakeCatalogData()) {
  const calls = [];
  let nextId = 1000;
  const page = (items, key, start = 0) => ({ result: { [key]: items.slice(start, start + 50) }, total: items.length });

  async function call(method, params = {}) {
    calls.push({ method, params });
    const f = params.filter ?? {};
    switch (method) {
      case 'catalog.catalog.list': return page(data.catalogs, 'catalogs', params.start);
      case 'catalog.section.list': return page(data.sections.filter(s => !f.iblockId || s.iblockId === f.iblockId), 'sections', params.start);
      case 'catalog.product.list': return page(data.products.filter(p => !f.iblockId || p.iblockId === f.iblockId), 'products', params.start);
      case 'catalog.product.offer.list': return page(data.offers, 'offers', params.start);
      case 'catalog.price.list': return page(data.prices, 'prices', params.start);
      case 'catalog.priceType.list': return page(data.priceTypes, 'priceTypes', params.start);
      case 'catalog.measure.list': return page(data.measures, 'measures', params.start);
      case 'catalog.vat.list': return page(data.vats, 'vats', params.start);
      case 'catalog.product.update':
      case 'catalog.product.service.update':
      case 'catalog.product.sku.update': {
        const p = data.products.find(x => x.id === Number(params.id));
        if (!p) throw new Error('not found');
        Object.assign(p, params.fields);
        return { result: { element: p } };
      }
      case 'catalog.product.add':
      case 'catalog.product.service.add': {
        const p = { id: nextId++, type: method.includes('service') ? 7 : 1, active: 'Y', ...params.fields };
        data.products.push(p);
        return { result: method.includes('service') ? { service: p } : { element: p } };
      }
      case 'catalog.product.delete':
      case 'catalog.product.service.delete':
        data.products = data.products.filter(x => x.id !== Number(params.id));
        return { result: true };
      case 'catalog.price.update': {
        const pr = data.prices.find(x => x.id === Number(params.id));
        Object.assign(pr, params.fields);
        return { result: { price: pr } };
      }
      case 'catalog.price.add': {
        const pr = { id: nextId++, ...params.fields };
        data.prices.push(pr);
        return { result: { price: pr } };
      }
      case 'catalog.section.add': {
        const s = { id: nextId++, active: 'Y', sort: 500, ...params.fields };
        data.sections.push(s);
        return { result: { section: s } };
      }
      case 'catalog.section.update': {
        const s = data.sections.find(x => x.id === Number(params.id));
        Object.assign(s, params.fields);
        return { result: { section: s } };
      }
      case 'catalog.section.delete':
        data.sections = data.sections.filter(x => x.id !== Number(params.id));
        return { result: true };
      default:
        throw new Error(`fake portal: método não suportado ${method}`);
    }
  }

  return { call, calls, data, portal: 'fake.bitrix24.com.br' };
}
