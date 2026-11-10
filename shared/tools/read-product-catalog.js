import { z } from 'zod';
import { Bitrix24Client } from '../bitrix24/client.js';
import { Bitrix24Reader } from '../bitrix24/reader.js';
import { resolveWebhook } from '../utils/resolve-webhook.js';

export const readProductCatalogSchema = z.object({
  webhook_url: z.string().url().optional().describe('URL del webhook (opcional si está configurado por defecto)'),
});

export async function readProductCatalog({ webhook_url }) {
  const client = new Bitrix24Client(resolveWebhook(webhook_url));
  const reader = new Bitrix24Reader(client);
  const catalog = await reader.readProductCatalog();

  if (catalog.error) {
    return { portal: client.portal, error: catalog.error };
  }

  return {
    portal: client.portal,
    product_catalog: catalog,
    summary: [
      `${catalog.catalogs?.length ?? 0} catálogos`,
      `${catalog.sections?.length ?? 0} secciones`,
      `${catalog.properties?.length ?? 0} propiedades`,
      `${catalog.measures?.length ?? 0} unidades de medida`,
      `${catalog.price_types?.length ?? 0} tipos de precio`,
    ].join(', '),
  };
}
