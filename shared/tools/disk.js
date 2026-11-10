import { z } from 'zod';
import { Bitrix24Client } from '../bitrix24/client.js';
import { resolveWebhook } from '../utils/resolve-webhook.js';

// ─── LIST STORAGE ─────────────────────────────────────────────────────────────

export const diskStoragesSchema = z.object({
  webhook_url: z.string().url().optional(),
});

export async function diskStorages({ webhook_url }) {
  const client = new Bitrix24Client(resolveWebhook(webhook_url));
  const res = await client.call('disk.storage.getlist');
  return { portal: client.portal, storages: res.result ?? [] };
}

// ─── LIST FOLDER CHILDREN ────────────────────────────────────────────────────

export const diskFolderListSchema = z.object({
  folder_id: z.union([z.string(), z.number()]).optional().describe('ID de la carpeta. Si no se indica, lista el storage raíz del usuario'),
  filter: z.record(z.any()).optional().default({}).describe('Filtros opcionales. Ejemplo: { "NAME": "Contratos" }'),
  webhook_url: z.string().url().optional(),
});

export async function diskFolderList({ folder_id, filter = {}, webhook_url }) {
  const client = new Bitrix24Client(resolveWebhook(webhook_url));

  if (!folder_id) {
    // Get user's personal storage root
    const storageRes = await client.call('disk.storage.getforapp');
    folder_id = storageRes.result?.ROOT_OBJECT?.ID;
  }

  const res = await client.call('disk.folder.getchildren', { id: folder_id, filter });
  const items = res.result ?? [];
  return {
    portal: client.portal,
    folder_id,
    total: items.length,
    items: items.map(i => ({
      id: i.ID, name: i.NAME, type: i.TYPE, size: i.SIZE,
      created: i.CREATE_TIME, modified: i.UPDATE_TIME,
      download_url: i.DOWNLOAD_URL,
    })),
  };
}

// ─── GET FILE ────────────────────────────────────────────────────────────────

export const diskFileGetSchema = z.object({
  file_id: z.union([z.string(), z.number()]).describe('ID del archivo'),
  webhook_url: z.string().url().optional(),
});

export async function diskFileGet({ file_id, webhook_url }) {
  const client = new Bitrix24Client(resolveWebhook(webhook_url));
  const res = await client.call('disk.file.get', { id: file_id });
  return { portal: client.portal, file: res.result };
}

// ─── UPLOAD FILE ─────────────────────────────────────────────────────────────

export const diskFileUploadSchema = z.object({
  folder_id: z.union([z.string(), z.number()]).describe('ID de la carpeta destino'),
  name: z.string().describe('Nombre del archivo incluyendo extensión'),
  content_base64: z.string().describe('Contenido del archivo en Base64'),
  webhook_url: z.string().url().optional(),
});

export async function diskFileUpload({ folder_id, name, content_base64, webhook_url }) {
  const client = new Bitrix24Client(resolveWebhook(webhook_url));
  const res = await client.call('disk.folder.uploadfile', {
    id: folder_id,
    data: { NAME: name },
    fileContent: content_base64,
  });
  return { portal: client.portal, file: res.result, success: true };
}
