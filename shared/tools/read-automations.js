import { z } from 'zod';
import { Bitrix24Client } from '../bitrix24/client.js';
import { Bitrix24Reader } from '../bitrix24/reader.js';
import { resolveWebhook } from '../utils/resolve-webhook.js';

export const readAutomationsSchema = z.object({
  webhook_url: z.string().url().optional().describe('URL del webhook (opcional si está configurado por defecto)'),
  entity_type_id: z.number().int().optional().describe('ID del tipo de entidad (opcional)'),
});

export async function readAutomations({ webhook_url, entity_type_id }) {
  const client = new Bitrix24Client(resolveWebhook(webhook_url));
  const reader = new Bitrix24Reader(client);
  const automations = await reader.readAutomations(entity_type_id);

  const totalRules = Object.values(automations).reduce((acc, rules) => acc + rules.length, 0);

  return {
    portal: client.portal,
    automations,
    stages_with_automations: Object.keys(automations).length,
    total_rules: totalRules,
    summary: `${totalRules} reglas de automatización en ${Object.keys(automations).length} etapas`,
    note: 'Las automatizaciones referencian usuarios por ID. Usar b24_read_users y b24_save_user_mapping antes de aplicar en otra instancia.',
  };
}
