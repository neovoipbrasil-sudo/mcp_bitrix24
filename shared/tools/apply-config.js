import { z } from 'zod';
import { readFileSync } from 'fs';
import { Bitrix24Client } from '../bitrix24/client.js';
import { Bitrix24Writer } from '../bitrix24/writer.js';
import { applyUserMapping } from '../utils/user-mapping.js';
import { resolveWebhook } from '../utils/resolve-webhook.js';

export const applyConfigSchema = z.object({
  config_file: z.string().describe('Ruta al archivo JSON de configuración a aplicar'),
  webhook_url: z.string().url().optional().describe('Webhook de la instancia destino (opcional si está configurado por defecto)'),
  user_mapping_file: z.string().optional().describe('Ruta al JSON de mapeo de usuarios (para automatizaciones)'),
});

export async function applyConfig({ config_file, webhook_url, user_mapping_file }) {
  const config = JSON.parse(readFileSync(config_file, 'utf-8'));
  const client = new Bitrix24Client(resolveWebhook(webhook_url));
  const writer = new Bitrix24Writer(client);

  // Orden de aplicación definido en sección 7.4 del documento
  if (config.currencies?.length) {
    await writer.applyCurrencies(config.currencies);
  }

  if (config.entity_types?.spa?.length) {
    await writer.applyEntityTypes(config.entity_types.spa);
  }

  if (config.pipelines && Object.keys(config.pipelines).length) {
    await writer.applyPipelines(config.pipelines);
  }

  if (config.custom_fields) {
    await writer.applyCustomFields(config.custom_fields);
  }

  if (config.product_catalog && !config.product_catalog.error) {
    await writer.applyProductCatalog(config.product_catalog);
  }

  if (config.automations && Object.keys(config.automations).length) {
    const mapped = applyUserMapping(config.automations, user_mapping_file);
    await writer.applyAutomations(config.automations, mapped);
  }

  const report = writer.getReport();

  return {
    source_portal: config.meta?.portal,
    dest_portal: client.portal,
    result: {
      created: report.created.length,
      updated: report.updated.length,
      failed: report.failed.length,
      skipped: report.skipped.length,
    },
    details: report,
    summary: `Aplicación completa: ${report.created.length} creados, ${report.updated.length} actualizados, ${report.failed.length} fallidos, ${report.skipped.length} omitidos`,
  };
}
