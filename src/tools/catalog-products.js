// Herramientas de catálogo (métodos catalog.*, REST 2).
//
// Según la documentación oficial (github.com/bitrix24/b24restdocs, api-reference/catalog):
// - catalog.product.list / catalog.section.list exigen `select` y `filter.iblockId`.
// - Los nombres de campo son camelCase (id, iblockId, name, iblockSectionId, active, previewText...).
//   Campos desconocidos o en MAYÚSCULAS (estilo crm.product.*) se ignoran sin error.
// - Las listas devuelven result.<plural> (result.products, result.sections), 50 por página.
// - El precio NO es un campo del producto: vive en catalog.price.* (uno por tipo de precio); el tipo
//   marcado como base es el precio de venta.

import { z } from 'zod';
import { Bitrix24Client } from '../bitrix24/client.js';
import { resolveWebhook } from '../utils/resolve-webhook.js';
import { listAll, buildSnapshot } from '../catalog/catalog-service.js';

export const DEFAULT_PRODUCT_SELECT = [
  'id', 'iblockId', 'name', 'active', 'iblockSectionId', 'type', 'code', 'sort',
  'previewText', 'detailText', 'measure', 'vatId', 'vatIncluded', 'dateCreate', 'timestampX',
];

const SECTION_SELECT = ['id', 'iblockId', 'iblockSectionId', 'name', 'code', 'sort', 'active', 'description'];

// Nombres antiguos (crm.product.*) -> campos de catalog.product.*. PRICE/CURRENCY_ID se tratan aparte.
const LEGACY_FIELDS = {
  ID: 'id',
  NAME: 'name',
  ACTIVE: 'active',
  SECTION_ID: 'iblockSectionId',
  CATALOG_ID: 'iblockId',
  IBLOCK_ID: 'iblockId',
  DESCRIPTION: 'previewText',
  PREVIEW_TEXT: 'previewText',
  DETAIL_TEXT: 'detailText',
  SORT: 'sort',
  CODE: 'code',
  XML_ID: 'xmlId',
  MEASURE: 'measure',
  VAT_ID: 'vatId',
  VAT_INCLUDED: 'vatIncluded',
  PREVIEW_PICTURE: 'previewPicture',
  DETAIL_PICTURE: 'detailPicture',
};

// Métodos de escritura según el tipo de ítem (1 simple, 2 kit, 3 con variaciones, 4-6 variación, 7 servicio).
function updateMethodFor(type) {
  const t = Number(type);
  if (t === 7) return 'catalog.product.service.update';
  if (t === 3) return 'catalog.product.sku.update';
  if (t === 4 || t === 5 || t === 6) return 'catalog.product.offer.update';
  return 'catalog.product.update';
}

function makeClient(webhook_url) {
  return new Bitrix24Client(resolveWebhook(webhook_url));
}

// Traduce una clave antigua (con prefijo de operador de filtro, p. ej. ">=SORT") a camelCase.
function normalizeKey(key) {
  const m = /^([!<>=%@]*)(.*)$/.exec(key);
  const [, op, name] = m;
  return op + (LEGACY_FIELDS[name] ?? name);
}

function normalizeKeys(obj = {}) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[normalizeKey(k)] = v;
  return out;
}

// Separa precio/moneda (que van a catalog.price.*) del resto de campos del producto.
function splitPrice(fields = {}) {
  const { PRICE, CURRENCY_ID, price, currency, ...rest } = fields;
  const normalized = normalizeKeys(rest);
  if (normalized.active === true) normalized.active = 'Y';
  if (normalized.active === false) normalized.active = 'N';
  return { fields: normalized, price: price ?? PRICE, currency: currency ?? CURRENCY_ID };
}

function hasValue(v) {
  return v !== undefined && v !== null && v !== '';
}

// iblock del catálogo de productos: el catálogo sin productIblockId (el de ofertas apunta a él).
export async function resolveProductIblockId(client) {
  const catalogs = await listAll(client, 'catalog.catalog.list', { select: ['id', 'iblockId', 'name', 'productIblockId'] }, 'catalogs');
  const c = catalogs.find(x => !x.productIblockId) ?? catalogs[0];
  if (!c) throw new Error('No se encontró ningún catálogo de productos en el portal (catalog.catalog.list vacío).');
  return Number(c.iblockId);
}

async function listPriceTypes(client) {
  return listAll(client, 'catalog.priceType.list', { select: ['id', 'name', 'base', 'sort'] }, 'priceTypes');
}

async function listPrices(client, productIds) {
  const prices = [];
  for (let i = 0; i < productIds.length; i += 50) {
    prices.push(...await listAll(client, 'catalog.price.list', {
      select: ['id', 'productId', 'catalogGroupId', 'price', 'currency'],
      filter: { productId: productIds.slice(i, i + 50) },
    }, 'prices'));
  }
  return prices;
}

// Añade price / currency / priceId (precio base) a cada producto, reutilizando buildSnapshot.
export async function attachPrices(client, products) {
  if (products.length === 0) return products;
  const ids = products.map(p => Number(p.id)).filter(Boolean);
  const [priceTypes, prices] = [await listPriceTypes(client), await listPrices(client, ids)];
  const snap = buildSnapshot({ catalogs: [], sections: [], products, prices, priceTypes });
  return products.map((p, i) => ({
    ...p,
    price: snap.products[i].price,
    currency: snap.products[i].currency,
    priceId: snap.products[i].priceId,
  }));
}

// Crea o actualiza el precio base de un producto.
async function setBasePrice(client, productId, price, currency) {
  const value = Number(price);
  if (!Number.isFinite(value) || value < 0) throw new Error(`Precio inválido: ${price}`);
  const priceTypes = await listPriceTypes(client);
  const base = priceTypes.find(t => t.base === 'Y' || t.base === true) ?? priceTypes[0];
  if (!base) throw new Error('El portal no tiene tipo de precio base configurado (catalog.priceType.list).');
  const existing = (await listPrices(client, [Number(productId)])).find(p => Number(p.catalogGroupId) === Number(base.id));
  const cur = currency || existing?.currency || 'BRL';
  if (existing) {
    await client.call('catalog.price.update', { id: Number(existing.id), fields: { price: value, currency: cur } });
    return { priceId: Number(existing.id), price: value, currency: cur };
  }
  const res = await client.call('catalog.price.add', {
    fields: { productId: Number(productId), catalogGroupId: Number(base.id), price: value, currency: cur },
  });
  return { priceId: Number(res.result?.price?.id) || null, price: value, currency: cur };
}

// ─── LIST PRODUCTS ────────────────────────────────────────────────────────────

export const productsListSchema = z.object({
  filter: z.record(z.any()).optional().default({}).describe(
    'Filtros de catalog.product.list con campos camelCase. Ejemplo: { "iblockSectionId": 5, "active": "Y" } ' +
    'o { "%name": "PABX" } para buscar por nombre. El precio no es filtrable aquí (vive en catalog.price.*). ' +
    'iblockId se completa automáticamente con el catálogo de productos si no se informa.'
  ),
  select: z.array(z.string()).optional().describe(
    'Campos camelCase a retornar. Default: ' + DEFAULT_PRODUCT_SELECT.join(', ') + '. id e iblockId siempre se incluyen.'
  ),
  iblock_id: z.union([z.string(), z.number()]).optional().describe('iblockId del catálogo (opcional; por defecto el catálogo de productos del CRM)'),
  include_prices: z.boolean().optional().default(true).describe('Añade price/currency/priceId (precio base, de catalog.price.list)'),
  all_pages: z.boolean().optional().default(false),
  webhook_url: z.string().url().optional(),
});

export async function listProducts(client, { filter = {}, select, iblock_id, include_prices = true, all_pages = false } = {}) {
  const f = normalizeKeys(filter);
  const iblockId = Number(iblock_id ?? f.iblockId) || await resolveProductIblockId(client);
  const fields = select?.length ? select.map(normalizeKey).filter(k => k !== 'PRICE' && k !== 'CURRENCY_ID') : DEFAULT_PRODUCT_SELECT;
  const params = {
    select: [...new Set(['id', 'iblockId', ...fields])],
    filter: { ...f, iblockId },
    order: { id: 'asc' },
  };
  let products = all_pages
    ? await listAll(client, 'catalog.product.list', params, 'products')
    : (await client.call('catalog.product.list', params)).result?.products ?? [];
  if (include_prices) products = await attachPrices(client, products);
  return { iblockId, count: products.length, products };
}

export async function productsList({ webhook_url, ...args }) {
  const client = makeClient(webhook_url);
  return { portal: client.portal, ...(await listProducts(client, args)) };
}

// ─── GET PRODUCT ──────────────────────────────────────────────────────────────

export const productsGetSchema = z.object({
  id: z.union([z.string(), z.number()]).describe('ID del producto'),
  webhook_url: z.string().url().optional(),
});

export async function getProduct(client, { id }) {
  const res = await client.call('catalog.product.get', { id: Number(id) });
  const product = res.result?.product ?? null;
  if (!product) return { product: null };
  const [withPrice] = await attachPrices(client, [product]);
  return { product: withPrice };
}

export async function productsGet({ webhook_url, ...args }) {
  const client = makeClient(webhook_url);
  return { portal: client.portal, ...(await getProduct(client, args)) };
}

// ─── CREATE PRODUCT ───────────────────────────────────────────────────────────

export const productsCreateSchema = z.object({
  fields: z.record(z.any()).describe(
    'Campos camelCase de catalog.product.add. Requerido: name. ' +
    'Opcionales: active ("Y"/"N"), iblockSectionId (sección), previewText (descripción), detailText, code, sort, measure, vatId, vatIncluded, iblockId ' +
    '(por defecto el catálogo de productos). price y currency se graban como precio base vía catalog.price.add.'
  ),
  webhook_url: z.string().url().optional(),
});

export async function createProduct(client, { fields: input = {} }) {
  const { fields, price, currency } = splitPrice(input);
  if (!hasValue(fields.name)) throw new Error('El campo "name" es obligatorio.');
  if (!fields.iblockId) fields.iblockId = await resolveProductIblockId(client);
  const res = await client.call('catalog.product.add', { fields });
  const id = Number(res.result?.element?.id ?? res.result?.id);
  const out = { created_id: id, success: true };
  if (hasValue(price)) out.price = await setBasePrice(client, id, price, currency);
  return out;
}

export async function productsCreate({ webhook_url, ...args }) {
  const client = makeClient(webhook_url);
  return { portal: client.portal, ...(await createProduct(client, args)) };
}

// ─── UPDATE PRODUCT ───────────────────────────────────────────────────────────

export const productsUpdateSchema = z.object({
  id: z.union([z.string(), z.number()]),
  fields: z.record(z.any()).describe(
    'Campos camelCase a actualizar: name, active ("Y"/"N"), iblockSectionId, previewText, detailText, code, sort, measure, vatId, vatIncluded. ' +
    'price y currency actualizan el precio base vía catalog.price.*.'
  ),
  webhook_url: z.string().url().optional(),
});

export async function updateProduct(client, { id, fields: input = {} }) {
  const { fields, price, currency } = splitPrice(input);
  delete fields.id;
  delete fields.iblockId;
  if (Object.keys(fields).length === 0 && !hasValue(price)) throw new Error('Ningún campo para actualizar.');
  const out = { updated_id: id, success: true };
  if (Object.keys(fields).length > 0) {
    const current = (await client.call('catalog.product.get', { id: Number(id) })).result?.product;
    if (!current) throw new Error(`Producto ${id} no encontrado.`);
    await client.call(updateMethodFor(current.type), { id: Number(id), fields });
  }
  if (hasValue(price)) out.price = await setBasePrice(client, id, price, currency);
  return out;
}

export async function productsUpdate({ webhook_url, ...args }) {
  const client = makeClient(webhook_url);
  return { portal: client.portal, ...(await updateProduct(client, args)) };
}

// ─── LIST SECTIONS ────────────────────────────────────────────────────────────

export const productsSectionsSchema = z.object({
  catalog_id: z.union([z.string(), z.number()]).optional().describe(
    'iblockId del catálogo (opcional; por defecto el catálogo de productos del CRM)'
  ),
  webhook_url: z.string().url().optional(),
});

export async function listSections(client, { catalog_id } = {}) {
  const iblockId = Number(catalog_id) || await resolveProductIblockId(client);
  const sections = await listAll(client, 'catalog.section.list', {
    select: SECTION_SELECT,
    filter: { iblockId },
    order: { sort: 'asc' },
  }, 'sections');
  return { iblockId, total: sections.length, sections };
}

export async function productsSections({ webhook_url, ...args }) {
  const client = makeClient(webhook_url);
  return { portal: client.portal, ...(await listSections(client, args)) };
}
