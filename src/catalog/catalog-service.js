// Leitura e escrita do Catálogo Comercial do Bitrix24 (métodos catalog.*, REST 2).
//
// Como o catálogo funciona (documentação oficial: github.com/bitrix24/b24restdocs, api-reference/catalog):
// - Cada catálogo é um "bloco de informação" (iblock). O catálogo de produtos do CRM tem um iblock de
//   produtos e, se houver variações, um segundo iblock de ofertas (productIblockId aponta para o primeiro).
// - Pastas = seções (catalog.section.*), em árvore via iblockSectionId. APAGAR UMA SEÇÃO APAGA AS
//   SUBSEÇÕES E OS PRODUTOS QUE SÓ ESTÃO NELA, sem volta — por isso aqui só se apaga seção vazia.
// - Tipos de item (campo "type"): 1 produto simples, 2 kit, 3 produto com variações, 4 variação, 7 serviço.
//   Cada tipo tem seu grupo de métodos (catalog.product.*, .service.*, .sku.*, .offer.*).
// - Preço não é campo do produto: fica em catalog.price.*, um por tipo de preço (catalog.priceType.*);
//   o tipo marcado como base é o "preço de venda" usado nos negócios do CRM.
// - Listas devolvem result.<plural> com 50 itens por página (parâmetro start).

export const PRODUCT_TYPES = {
  1: 'Produto',
  2: 'Kit',
  3: 'Produto com variações',
  4: 'Variação',
  5: 'Variação sem produto',
  6: 'Variação vazia',
  7: 'Serviço',
};

const PRODUCT_SELECT = [
  'id', 'iblockId', 'name', 'active', 'iblockSectionId', 'type', 'code', 'sort',
  'previewText', 'detailText', 'measure', 'vatId', 'vatIncluded',
  'purchasingPrice', 'purchasingCurrency', 'dateCreate', 'timestampX', 'xmlId',
];

const SNAPSHOT_TTL_MS = 5 * 60 * 1000;

// Métodos de escrita por tipo de item (REST 2 não troca o tipo de um item existente).
function productMethods(type) {
  const t = Number(type);
  if (t === 7) return { update: 'catalog.product.service.update', delete: 'catalog.product.service.delete' };
  if (t === 3) return { update: 'catalog.product.sku.update', delete: 'catalog.product.sku.delete' };
  if (t === 4 || t === 5 || t === 6) return { update: 'catalog.product.offer.update', delete: 'catalog.product.offer.delete' };
  return { update: 'catalog.product.update', delete: 'catalog.product.delete' };
}

export async function listAll(client, method, params, key) {
  const items = [];
  let start = 0;
  for (;;) {
    const res = await client.call(method, { ...params, start });
    const page = res.result?.[key] ?? [];
    items.push(...page);
    start += 50;
    if (page.length < 50 || start >= (res.total ?? 0)) break;
  }
  return items;
}

function yn(v) {
  return v === true || v === 'Y';
}

function parentIdOf(offer) {
  const p = offer.parentId;
  if (p && typeof p === 'object') return Number(p.value) || null;
  return Number(p) || null;
}

// Monta uma visão única do catálogo: pastas com caminho/contagens e itens com preço base.
export function buildSnapshot({ catalogs, sections, products, offers = [], prices, priceTypes, measures = [], vats = [], loadedAt = new Date().toISOString() }) {
  const baseType = priceTypes.find(t => yn(t.base)) ?? priceTypes[0] ?? null;
  const measureById = new Map(measures.map(m => [Number(m.id), m]));

  const sectionById = new Map();
  for (const s of sections) {
    sectionById.set(Number(s.id), {
      id: Number(s.id),
      iblockId: Number(s.iblockId),
      parentId: Number(s.iblockSectionId) || null,
      name: s.name ?? '',
      code: s.code ?? null,
      sort: Number(s.sort) || 500,
      active: s.active === undefined ? true : yn(s.active),
      description: s.description ?? '',
      children: [],
      productIds: [],
    });
  }
  for (const s of sectionById.values()) {
    if (s.parentId && sectionById.has(s.parentId)) sectionById.get(s.parentId).children.push(s.id);
  }
  function pathOf(id) {
    const names = [];
    const seen = new Set();
    let cur = sectionById.get(id);
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      names.unshift(cur.name);
      cur = cur.parentId ? sectionById.get(cur.parentId) : null;
    }
    return names;
  }

  const pricesByProduct = new Map();
  for (const p of prices) {
    const pid = Number(p.productId);
    if (!pricesByProduct.has(pid)) pricesByProduct.set(pid, []);
    pricesByProduct.get(pid).push({ id: Number(p.id), typeId: Number(p.catalogGroupId), price: p.price === null ? null : Number(p.price), currency: p.currency });
  }

  const variationsByParent = new Map();
  for (const o of offers) {
    const parent = parentIdOf(o);
    if (!parent) continue;
    variationsByParent.set(parent, (variationsByParent.get(parent) ?? 0) + 1);
  }

  const items = products.map(p => {
    const id = Number(p.id);
    const sectionId = Number(p.iblockSectionId) || null;
    const itemPrices = pricesByProduct.get(id) ?? [];
    const base = baseType ? itemPrices.find(x => x.typeId === Number(baseType.id)) : itemPrices[0];
    const measure = measureById.get(Number(p.measure));
    if (sectionId && sectionById.has(sectionId)) sectionById.get(sectionId).productIds.push(id);
    return {
      id,
      iblockId: Number(p.iblockId),
      name: p.name ?? '',
      type: Number(p.type) || 1,
      typeLabel: PRODUCT_TYPES[Number(p.type)] ?? `Tipo ${p.type}`,
      active: yn(p.active),
      sectionId,
      sectionPath: sectionId ? pathOf(sectionId) : [],
      code: p.code ?? null,
      sort: Number(p.sort) || 500,
      description: p.previewText || p.detailText || '',
      previewText: p.previewText ?? '',
      detailText: p.detailText ?? '',
      measure: measure ? measure.symbol || measure.measureTitle : null,
      price: base?.price ?? null,
      currency: base?.currency ?? null,
      priceId: base?.id ?? null,
      otherPrices: itemPrices.filter(x => x !== base),
      purchasingPrice: p.purchasingPrice === null || p.purchasingPrice === undefined ? null : Number(p.purchasingPrice),
      variations: variationsByParent.get(id) ?? 0,
      vatId: p.vatId ?? null,
      vatIncluded: p.vatIncluded === undefined ? null : yn(p.vatIncluded),
      createdAt: p.dateCreate ?? null,
      updatedAt: p.timestampX ?? null,
    };
  });

  // Contagens recursivas (itens na própria pasta e em todas as subpastas).
  const productById = new Map(items.map(i => [i.id, i]));
  const memo = new Map();
  function totals(id, seen = new Set()) {
    if (memo.has(id)) return memo.get(id);
    const s = sectionById.get(id);
    if (!s || seen.has(id)) return { total: 0, active: 0 };
    seen.add(id);
    let total = s.productIds.length;
    let active = s.productIds.filter(pid => productById.get(pid)?.active).length;
    for (const c of s.children) {
      const t = totals(c, seen);
      total += t.total;
      active += t.active;
    }
    const r = { total, active };
    memo.set(id, r);
    return r;
  }

  const sectionList = [...sectionById.values()].map(s => {
    const t = totals(s.id);
    return {
      ...s,
      path: pathOf(s.id),
      depth: pathOf(s.id).length,
      directCount: s.productIds.length,
      totalCount: t.total,
      activeCount: t.active,
    };
  });

  return {
    loadedAt,
    catalogs: catalogs.map(c => ({ id: Number(c.id), iblockId: Number(c.iblockId), name: c.name, productIblockId: c.productIblockId ? Number(c.productIblockId) : null })),
    baseCurrency: items.find(i => i.currency)?.currency ?? 'BRL',
    priceTypes: priceTypes.map(t => ({ id: Number(t.id), name: t.name, base: yn(t.base) })),
    basePriceTypeId: baseType ? Number(baseType.id) : null,
    measures: measures.map(m => ({ id: Number(m.id), code: m.code, title: m.measureTitle, symbol: m.symbol, isDefault: yn(m.isDefault) })),
    vats: vats.map(v => ({ id: Number(v.id), name: v.name, rate: v.rate })),
    sections: sectionList,
    products: items,
    offersCount: offers.length,
  };
}

export function createCatalogService({ client, now = () => Date.now() }) {
  let cache = null;
  let cacheAt = 0;
  let inflight = null;

  async function fetchSnapshot() {
    const catalogs = await listAll(client, 'catalog.catalog.list', { select: ['id', 'iblockId', 'name', 'productIblockId'] }, 'catalogs');
    // Catálogos de produto (o de ofertas aponta para um catálogo de produto via productIblockId).
    const productCatalogs = catalogs.filter(c => !c.productIblockId);
    const offerCatalogs = catalogs.filter(c => c.productIblockId);

    const sections = [];
    const products = [];
    for (const c of productCatalogs) {
      sections.push(...await listAll(client, 'catalog.section.list', {
        select: ['id', 'iblockId', 'iblockSectionId', 'name', 'code', 'sort', 'active', 'description'],
        filter: { iblockId: c.iblockId },
        order: { sort: 'asc' },
      }, 'sections'));
      products.push(...await listAll(client, 'catalog.product.list', {
        select: PRODUCT_SELECT,
        filter: { iblockId: c.iblockId },
        order: { id: 'asc' },
      }, 'products'));
    }

    const offers = [];
    for (const c of offerCatalogs) {
      try {
        offers.push(...await listAll(client, 'catalog.product.offer.list', {
          select: ['id', 'iblockId', 'name', 'active', 'parentId'],
          filter: { iblockId: c.iblockId },
        }, 'offers'));
      } catch {
        // Sem variações (ou sem permissão): segue sem elas.
      }
    }

    const prices = await listAll(client, 'catalog.price.list', {
      select: ['id', 'productId', 'catalogGroupId', 'price', 'currency'],
      filter: {},
    }, 'prices');
    const priceTypes = await listAll(client, 'catalog.priceType.list', { select: ['id', 'name', 'base', 'sort'] }, 'priceTypes');
    const measures = await listAll(client, 'catalog.measure.list', {}, 'measures').catch(() => []);
    const vats = await listAll(client, 'catalog.vat.list', {}, 'vats').catch(() => []);

    return buildSnapshot({ catalogs, sections, products, offers, prices, priceTypes, measures, vats, loadedAt: new Date(now()).toISOString() });
  }

  async function getSnapshot({ force = false } = {}) {
    if (!force && cache && now() - cacheAt < SNAPSHOT_TTL_MS) return cache;
    if (!inflight) {
      inflight = fetchSnapshot()
        .then(s => {
          cache = s;
          cacheAt = now();
          return s;
        })
        .finally(() => {
          inflight = null;
        });
    }
    return inflight;
  }

  function invalidate() {
    cache = null;
  }

  // ─── Escrita ──────────────────────────────────────────────────────────────

  async function requireProduct(id) {
    let snap = await getSnapshot();
    let p = snap.products.find(x => x.id === Number(id));
    if (!p) {
      // Pode ter sido criado por uma operação anterior do mesmo plano.
      snap = await getSnapshot({ force: true });
      p = snap.products.find(x => x.id === Number(id));
    }
    if (!p) throw new Error(`Item ${id} não encontrado no catálogo.`);
    return { snap, product: p };
  }

  async function requireSection(id) {
    let snap = await getSnapshot();
    let s = snap.sections.find(x => x.id === Number(id));
    if (!s) {
      snap = await getSnapshot({ force: true });
      s = snap.sections.find(x => x.id === Number(id));
    }
    if (!s) throw new Error(`Pasta ${id} não encontrada no catálogo.`);
    return { snap, section: s };
  }

  function defaultIblock(snap) {
    const c = snap.catalogs.find(x => !x.productIblockId) ?? snap.catalogs[0];
    if (!c) throw new Error('Nenhum catálogo de produtos encontrado no portal.');
    return c.iblockId;
  }

  async function setPrice(snap, productId, price, currency) {
    const value = Number(price);
    if (!Number.isFinite(value) || value < 0) throw new Error(`Preço inválido: ${price}`);
    const product = snap.products.find(x => x.id === Number(productId));
    const cur = currency || product?.currency || snap.baseCurrency || 'BRL';
    if (product?.priceId) {
      await client.call('catalog.price.update', { id: product.priceId, fields: { price: value, currency: cur } });
      return { priceId: product.priceId };
    }
    if (!snap.basePriceTypeId) throw new Error('O portal não tem tipo de preço base configurado.');
    const res = await client.call('catalog.price.add', {
      fields: { productId: Number(productId), catalogGroupId: snap.basePriceTypeId, price: value, currency: cur },
    });
    return { priceId: res.result?.price?.id ?? null };
  }

  function productFields(f) {
    const out = {};
    if (f.name !== undefined) out.name = String(f.name).trim();
    if (f.active !== undefined) out.active = f.active === true || f.active === 'Y' ? 'Y' : 'N';
    if (f.sectionId !== undefined) out.iblockSectionId = f.sectionId ? Number(f.sectionId) : 0;
    if (f.description !== undefined) {
      out.previewText = String(f.description);
      out.previewTextType = 'text';
    }
    if (f.detailText !== undefined) {
      out.detailText = String(f.detailText);
      out.detailTextType = 'text';
    }
    if (f.sort !== undefined) out.sort = Number(f.sort);
    if (f.code !== undefined) out.code = f.code;
    if (f.measure !== undefined) out.measure = Number(f.measure);
    return out;
  }

  // Executa uma operação do plano. Os IDs temporários (tempId) permitem criar uma pasta e já mover
  // itens para ela no mesmo plano: refs = { tempId -> id real }.
  async function applyOperation(op, refs = {}) {
    const resolveSection = (id, tempId) => (tempId && refs[tempId] ? refs[tempId] : id);
    const snap = await getSnapshot();

    switch (op.action) {
      case 'update_product': {
        const { product } = await requireProduct(op.productId);
        const fields = productFields({ ...op.fields, ...(op.fields?.sectionTempId ? { sectionId: refs[op.fields.sectionTempId] } : {}) });
        delete fields.sectionTempId;
        if (Object.keys(fields).length === 0) throw new Error('Nenhum campo para alterar.');
        await client.call(productMethods(product.type).update, { id: product.id, fields });
        return { ok: true };
      }
      case 'move_product': {
        const { product } = await requireProduct(op.productId);
        const sectionId = resolveSection(op.sectionId, op.sectionTempId);
        await client.call(productMethods(product.type).update, { id: product.id, fields: { iblockSectionId: sectionId ? Number(sectionId) : 0 } });
        return { ok: true };
      }
      case 'set_price': {
        await requireProduct(op.productId);
        return { ok: true, ...(await setPrice(snap, op.productId, op.price, op.currency)) };
      }
      case 'create_section': {
        const parentId = resolveSection(op.parentId, op.parentTempId);
        const fields = { iblockId: op.iblockId ?? defaultIblock(snap), name: String(op.name).trim(), iblockSectionId: parentId ? Number(parentId) : null };
        if (op.sort !== undefined) fields.sort = Number(op.sort);
        if (op.description) fields.description = op.description;
        const res = await client.call('catalog.section.add', { fields });
        const id = Number(res.result?.section?.id);
        if (op.tempId) refs[op.tempId] = id;
        return { ok: true, sectionId: id };
      }
      case 'update_section': {
        await requireSection(op.sectionId);
        const fields = {};
        if (op.name !== undefined) fields.name = String(op.name).trim();
        if (op.parentId !== undefined || op.parentTempId) {
          const parentId = resolveSection(op.parentId, op.parentTempId);
          if (Number(parentId) === Number(op.sectionId)) throw new Error('Uma pasta não pode ficar dentro dela mesma.');
          fields.iblockSectionId = parentId ? Number(parentId) : null;
        }
        if (op.sort !== undefined) fields.sort = Number(op.sort);
        if (op.description !== undefined) fields.description = op.description;
        if (Object.keys(fields).length === 0) throw new Error('Nenhum campo para alterar.');
        await client.call('catalog.section.update', { id: Number(op.sectionId), fields });
        return { ok: true };
      }
      case 'delete_section': {
        // Releitura forçada: a pasta pode ter acabado de ser esvaziada por operações anteriores do plano.
        const fresh = await getSnapshot({ force: true });
        const s = fresh.sections.find(x => x.id === Number(op.sectionId));
        if (!s) throw new Error(`Pasta ${op.sectionId} não encontrada.`);
        if (s.totalCount > 0 || s.children.length > 0) {
          throw new Error(`A pasta "${s.name}" ainda tem ${s.totalCount} item(ns) e ${s.children.length} subpasta(s). No Bitrix24, excluir a pasta apaga tudo que está dentro — mova o conteúdo antes.`);
        }
        await client.call('catalog.section.delete', { id: s.id });
        return { ok: true };
      }
      case 'create_product': {
        const iblockId = op.iblockId ?? defaultIblock(snap);
        const sectionId = resolveSection(op.sectionId, op.sectionTempId);
        const fields = { iblockId, ...productFields({ name: op.name, description: op.description, active: op.active ?? true, sort: op.sort, measure: op.measure }) };
        if (sectionId) fields.iblockSectionId = Number(sectionId);
        const isService = op.kind === 'service';
        const res = await client.call(isService ? 'catalog.product.service.add' : 'catalog.product.add', { fields });
        const created = isService ? res.result?.service : res.result?.element;
        const id = Number(created?.id ?? res.result?.id);
        if (op.price !== undefined && op.price !== null && op.price !== '') {
          invalidate();
          await setPrice(await getSnapshot({ force: true }), id, op.price, op.currency);
        }
        return { ok: true, productId: id };
      }
      case 'delete_product': {
        const { product } = await requireProduct(op.productId);
        await client.call(productMethods(product.type).delete, { id: product.id });
        return { ok: true };
      }
      default:
        throw new Error(`Ação desconhecida: ${op.action}`);
    }
  }

  // Aplica uma lista de operações em ordem. Uma falha não interrompe as demais: o resultado de cada
  // uma (com o erro, se houver) volta para a interface. O cache é descartado ao final.
  async function applyOperations(operations) {
    const refs = {};
    const results = [];
    for (const op of operations) {
      try {
        results.push({ op, ...(await applyOperation(op, refs)) });
      } catch (err) {
        results.push({ op, ok: false, error: err.response?.data?.error_description || err.message });
      }
    }
    invalidate();
    return results;
  }

  return { getSnapshot, invalidate, applyOperation, applyOperations };
}
