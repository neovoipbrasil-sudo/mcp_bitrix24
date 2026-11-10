import { z } from 'zod';
import { Bitrix24Client } from '../bitrix24/client.js';
import { fetchAllPages } from '../utils/pagination.js';
import { resolveWebhook } from '../utils/resolve-webhook.js';

// ─── USERS ────────────────────────────────────────────────────────────────────

export const usersListSchema = z.object({
  filter: z.record(z.any()).optional().default({ ACTIVE: true }).describe(
    'Filtros. Default: { ACTIVE: true }. Otros: { "UF_DEPARTMENT": 5, "NAME": "Brian" }'
  ),
  select: z.array(z.string()).optional().describe(
    'Campos a retornar. Default: ID, NAME, LAST_NAME, EMAIL, WORK_POSITION, UF_DEPARTMENT, IS_ONLINE'
  ),
  all_pages: z.boolean().optional().default(true),
  webhook_url: z.string().url().optional(),
});

export async function usersList({ filter = { ACTIVE: true }, select, all_pages = true, webhook_url }) {
  const client = new Bitrix24Client(resolveWebhook(webhook_url));
  const params = {
    filter,
    select: select ?? ['ID', 'NAME', 'LAST_NAME', 'EMAIL', 'WORK_POSITION', 'UF_DEPARTMENT', 'IS_ONLINE', 'LAST_ACTIVITY_DATE'],
  };
  const users = all_pages
    ? await fetchAllPages(client, 'user.get', params)
    : (await client.call('user.get', params)).result ?? [];
  return { portal: client.portal, total: users.length, users };
}

// ─── DEPARTMENTS ─────────────────────────────────────────────────────────────

export const departmentsListSchema = z.object({
  filter: z.record(z.any()).optional().default({}).describe(
    'Filtros. Ejemplo: { "PARENT": 5 } para subdepartamentos. { "NAME": "Ventas" } para buscar por nombre'
  ),
  webhook_url: z.string().url().optional(),
});

export async function departmentsList({ filter = {}, webhook_url }) {
  const client = new Bitrix24Client(resolveWebhook(webhook_url));
  const departments = await fetchAllPages(client, 'department.get', filter);
  return { portal: client.portal, total: departments.length, departments };
}
