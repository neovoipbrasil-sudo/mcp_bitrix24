import { z } from 'zod';
import { Bitrix24Client } from '../bitrix24/client.js';
import { fetchAllPages } from '../utils/pagination.js';
import { resolveWebhook } from '../utils/resolve-webhook.js';

// ─── FEED POST ────────────────────────────────────────────────────────────────

export const feedPostSchema = z.object({
  message: z.string().describe('Texto del mensaje. Soporta BB-code: [B]negrita[/B], [I]italica[/I], [URL=http://...]texto[/URL]'),
  title: z.string().optional().describe('Título del post (opcional)'),
  destination: z.array(z.union([z.string(), z.number()])).optional().describe(
    'IDs de usuarios o grupos destino. Si está vacío, se publica para todos. ' +
    'Formato: ["U5", "U10"] para usuarios, ["SG12"] para grupos'
  ),
  files: z.array(z.string()).optional().describe('Adjuntos en formato Base64'),
  important: z.boolean().optional().default(false).describe('Si true, marca el post como importante'),
  webhook_url: z.string().url().optional(),
});

export async function feedPost({ message, title, destination, files, important = false, webhook_url }) {
  const client = new Bitrix24Client(resolveWebhook(webhook_url));
  const res = await client.call('log.blogpost.add', {
    POST_MESSAGE: message,
    ...(title ? { POST_TITLE: title } : {}),
    ...(destination ? { DESTINATION: destination } : {}),
    ...(files ? { FILES: files } : {}),
    IMPORTANT: important ? 'Y' : 'N',
  });
  return { portal: client.portal, post_id: res.result, success: true };
}

// ─── NOTIFY SEND ──────────────────────────────────────────────────────────────

export const notifySendSchema = z.object({
  to: z.union([z.string(), z.number()]).describe('ID del usuario destinatario'),
  message: z.string().describe('Texto de la notificación'),
  type: z.enum(['SYSTEM', 'CONFIRM', 'LINES']).optional().default('SYSTEM').describe(
    'Tipo: SYSTEM (notificación simple), CONFIRM (con botones confirmar/rechazar), LINES (Open Lines)'
  ),
  tag: z.string().optional().describe('Tag para agrupar o reemplazar notificaciones previas del mismo tag'),
  webhook_url: z.string().url().optional(),
});

export async function notifySend({ to, message, type = 'SYSTEM', tag, webhook_url }) {
  const client = new Bitrix24Client(resolveWebhook(webhook_url));
  const res = await client.call('im.notify.personal.add', {
    USER_ID: to,
    MESSAGE: message,
    TYPE: type,
    ...(tag ? { TAG: tag } : {}),
  });
  return { portal: client.portal, notify_id: res.result, success: true };
}

// ─── WORKGROUPS ───────────────────────────────────────────────────────────────

export const groupsListSchema = z.object({
  filter: z.record(z.any()).optional().default({}).describe(
    'Filtros. Ejemplo: { "ACTIVE": "Y", "VISIBLE": "Y" }. ' +
    'Campos: NAME, ACTIVE, VISIBLE, OPENED, PROJECT'
  ),
  select: z.array(z.string()).optional(),
  webhook_url: z.string().url().optional(),
});

export async function groupsList({ filter = {}, select, webhook_url }) {
  const client = new Bitrix24Client(resolveWebhook(webhook_url));
  const groups = await fetchAllPages(client, 'sonet_group.get', {
    filter,
    ...(select ? { select } : {}),
  });
  return { portal: client.portal, total: groups.length, groups };
}

// ─── CHAT MESSAGES ────────────────────────────────────────────────────────────

export const chatSendSchema = z.object({
  dialog_id: z.union([z.string(), z.number()]).describe(
    'ID del chat. Para mensaje privado: "userId_NUMERO" o ID numérico del usuario. ' +
    'Para chat grupal: ID del chat'
  ),
  message: z.string().describe('Texto del mensaje'),
  webhook_url: z.string().url().optional(),
});

export async function chatSend({ dialog_id, message, webhook_url }) {
  const client = new Bitrix24Client(resolveWebhook(webhook_url));
  const res = await client.call('im.message.add', {
    DIALOG_ID: dialog_id,
    MESSAGE: message,
  });
  return { portal: client.portal, message_id: res.result, success: true };
}

// ─── BIZPROC ──────────────────────────────────────────────────────────────────

export const bizprocListSchema = z.object({
  entity: z.string().optional().describe('Entidad CRM: CRM_DEAL, CRM_CONTACT, CRM_COMPANY, CRM_LEAD'),
  entity_id: z.union([z.string(), z.number()]).optional().describe('ID del registro CRM'),
  webhook_url: z.string().url().optional(),
});

export async function bizprocList({ entity, entity_id, webhook_url }) {
  const client = new Bitrix24Client(resolveWebhook(webhook_url));
  const params = {};
  if (entity) params.ENTITY = entity;
  if (entity_id) params.DOCUMENT_ID = entity_id;
  const res = await client.call('bizproc.workflow.instances', params);
  return { portal: client.portal, workflows: res.result ?? [] };
}

export const bizprocStartSchema = z.object({
  template_id: z.union([z.string(), z.number()]).describe('ID de la plantilla de proceso de negocio'),
  document_id: z.array(z.string()).describe(
    'Array con 3 elementos identificando el documento: ' +
    '["crm", "CCrmDocumentDeal", "DEAL_123"] para un deal con ID 123'
  ),
  parameters: z.record(z.any()).optional().default({}).describe('Parámetros del proceso'),
  webhook_url: z.string().url().optional(),
});

export async function bizprocStart({ template_id, document_id, parameters = {}, webhook_url }) {
  const client = new Bitrix24Client(resolveWebhook(webhook_url));
  const res = await client.call('bizproc.workflow.start', {
    TEMPLATE_ID: template_id,
    DOCUMENT_ID: document_id,
    PARAMETERS: parameters,
  });
  return { portal: client.portal, workflow_id: res.result, success: true };
}

// ─── TELEPHONY ────────────────────────────────────────────────────────────────

export const telephonyCallsSchema = z.object({
  filter: z.record(z.any()).optional().default({}).describe(
    'Filtros. Ejemplo: { "CRM_ENTITY_TYPE": "DEAL", "CRM_ENTITY_ID": 123 } ' +
    'o { "CALL_DURATION": ">60" } para llamadas de más de 60 segundos'
  ),
  select: z.array(z.string()).optional(),
  webhook_url: z.string().url().optional(),
});

export async function telephonyCalls({ filter = {}, select, webhook_url }) {
  const client = new Bitrix24Client(resolveWebhook(webhook_url));
  const res = await client.call('voximplant.statistic.get', {
    filter,
    ...(select ? { select } : {}),
  });
  return { portal: client.portal, calls: res.result ?? [] };
}
