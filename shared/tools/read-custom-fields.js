import { z } from 'zod';
import { Bitrix24Client } from '../bitrix24/client.js';
import { Bitrix24Reader } from '../bitrix24/reader.js';
import { resolveWebhook } from '../utils/resolve-webhook.js';

export const readCustomFieldsSchema = z.object({
  webhook_url: z.string().url().optional().describe('URL del webhook (opcional si está configurado por defecto)'),
  entity_type_id: z.string().optional().describe('Tipo de entidad (deal, contact, company, lead) — opcional'),
});

export async function readCustomFields({ webhook_url, entity_type_id }) {
  const client = new Bitrix24Client(resolveWebhook(webhook_url));
  const reader = new Bitrix24Reader(client);
  const fields = await reader.readCustomFields(entity_type_id);

  const totalCount = Object.values(fields).reduce((acc, f) => acc + f.length, 0);
  const byEntity = Object.fromEntries(
    Object.entries(fields).map(([e, f]) => [e, f.length])
  );

  return {
    portal: client.portal,
    custom_fields: fields,
    counts_by_entity: byEntity,
    total_fields: totalCount,
    summary: `${totalCount} campos personalizados: ${Object.entries(byEntity).map(([e, n]) => `${n} en ${e}`).join(', ')}`,
  };
}
