import { z } from 'zod';
import { Bitrix24Client } from '../bitrix24/client.js';
import { Bitrix24Reader } from '../bitrix24/reader.js';
import { resolveWebhook } from '../utils/resolve-webhook.js';

export const readEntityTypesSchema = z.object({
  webhook_url: z.string().url().optional().describe('URL del webhook (opcional si está configurado por defecto)'),
});

export async function readEntityTypes({ webhook_url }) {
  const client = new Bitrix24Client(resolveWebhook(webhook_url));
  const reader = new Bitrix24Reader(client);
  const data = await reader.readEntityTypes();

  return {
    portal: client.portal,
    standard_types: data.standard,
    spa_count: data.spa.length,
    spa_types: data.spa,
    statuses_count: data.statuses.length,
    currencies: data.currencies,
    summary: `${data.standard.length} tipos estándar, ${data.spa.length} SPA personalizados, ${data.currencies.length} monedas`,
  };
}
