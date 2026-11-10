import { z } from 'zod';
import { Bitrix24Client } from '../bitrix24/client.js';
import { fetchAllPages } from '../utils/pagination.js';
import { resolveWebhook } from '../utils/resolve-webhook.js';

// ─── LIST PRODUCTS ────────────────────────────────────────────────────────────

export const productsListSchema = z.object({
  filter: z.record(z.any()).optional().default({}).describe(
    'Filtros. Ejemplo: { "SECTION_ID": 5, "ACTIVE": "Y" } ' +
    'o { ">=PRICE": 100, "<=PRICE": 500 } para rango de precios'
  ),
  select: z.array(z.string()).optional().describe(
    'Campos a retornar. Default: ID, NAME, ACTIVE, PRICE, CURRENCY_ID, SECTION_ID'
  ),
  all_pages: z.boolean().optional().default(false),
  webhook_url: z.string().url().optional(),
});

export async function productsList({ filter = {}, select, all_pages = false, webhook_url }) {
  const client = new Bitrix24Client(resolveWebhook(webhook_url));
  const params = {
    filter,
    select: select ?? ['ID', 'NAME', 'ACTIVE', 'PRICE', 'CURRENCY_ID', 'SECTION_ID', 'DESCRIPTION'],
  };
  const items = all_pages
    ? await fetchAllPages(client, 'catalog.product.list', params)
    : (await client.call('catalog.product.list', params)).result ?? [];
  return { portal: client.portal, count: items.length, products: items };
}

// ─── GET PRODUCT ──────────────────────────────────────────────────────────────

export const productsGetSchema = z.object({
  id: z.union([z.string(), z.number()]).describe('ID del producto'),
  webhook_url: z.string().url().optional(),
});

export async function productsGet({ id, webhook_url }) {
  const client = new Bitrix24Client(resolveWebhook(webhook_url));
  const res = await client.call('catalog.product.get', { id });
  return { portal: client.portal, product: res.result };
}

// ─── CREATE PRODUCT ───────────────────────────────────────────────────────────

export const productsCreateSchema = z.object({
  fields: z.record(z.any()).describe(
    'Campos del producto. Requeridos: NAME. ' +
    'Opcionales: ACTIVE, PRICE, CURRENCY_ID, DESCRIPTION, SECTION_ID, PREVIEW_PICTURE'
  ),
  webhook_url: z.string().url().optional(),
});

export async function productsCreate({ fields, webhook_url }) {
  const client = new Bitrix24Client(resolveWebhook(webhook_url));
  const res = await client.call('catalog.product.add', { fields });
  return { portal: client.portal, created_id: res.result, success: true };
}

// ─── UPDATE PRODUCT ───────────────────────────────────────────────────────────

export const productsUpdateSchema = z.object({
  id: z.union([z.string(), z.number()]),
  fields: z.record(z.any()).describe('Campos a actualizar'),
  webhook_url: z.string().url().optional(),
});

export async function productsUpdate({ id, fields, webhook_url }) {
  const client = new Bitrix24Client(resolveWebhook(webhook_url));
  await client.call('catalog.product.update', { id, fields });
  return { portal: client.portal, updated_id: id, success: true };
}

// ─── LIST SECTIONS ────────────────────────────────────────────────────────────

export const productsSectionsSchema = z.object({
  catalog_id: z.union([z.string(), z.number()]).optional().describe('ID del catálogo (opcional)'),
  webhook_url: z.string().url().optional(),
});

export async function productsSections({ catalog_id, webhook_url }) {
  const client = new Bitrix24Client(resolveWebhook(webhook_url));
  const params = catalog_id ? { filter: { CATALOG_ID: catalog_id } } : {};
  const sections = await fetchAllPages(client, 'catalog.section.list', params);
  return { portal: client.portal, total: sections.length, sections };
}
