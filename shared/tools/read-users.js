import { z } from 'zod';
import { Bitrix24Client } from '../bitrix24/client.js';
import { Bitrix24Reader } from '../bitrix24/reader.js';
import { resolveWebhook } from '../utils/resolve-webhook.js';

export const readUsersSchema = z.object({
  webhook_url: z.string().url().optional().describe('URL del webhook (opcional si está configurado por defecto)'),
});

export async function readUsers({ webhook_url }) {
  const client = new Bitrix24Client(resolveWebhook(webhook_url));
  const reader = new Bitrix24Reader(client);
  const users = await reader.readUsers();

  return {
    portal: client.portal,
    users,
    total: users.length,
    summary: `${users.length} usuarios activos en ${client.portal}`,
  };
}
