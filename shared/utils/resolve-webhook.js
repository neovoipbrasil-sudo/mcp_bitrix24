export function resolveWebhook(webhookParam) {
  const url = webhookParam || process.env.B24_DEFAULT_WEBHOOK;
  if (!url) {
    throw new Error(
      'No se especificó webhook_url y no hay B24_DEFAULT_WEBHOOK configurado. ' +
      'Indicá el webhook en el parámetro webhook_url o configuralo en el servidor MCP.'
    );
  }
  return url;
}
