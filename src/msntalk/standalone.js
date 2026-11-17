// Servidor só da integração MSN Talk → Bitrix24.
// Não usa o servidor MCP, o chatbot nem a API da Anthropic: só precisa de
//   B24_DEFAULT_WEBHOOK          webhook de entrada do Bitrix24 (escopos crm e user)
//   MSNTALK_WEBHOOK_SECRET       segredo no path: https://<host>/msntalk-events/<segredo>
//   MSNTALK_TICKET_URL_TEMPLATE  (opcional) link do ticket, com {ticketId}
//   PORT                         (opcional, padrão 3300)
//   DATA_DIR                     (opcional) pasta dos arquivos de estado; padrão src/bot/data,
//                                a mesma do bot completo — dá para trocar de modo sem perder nada.
import express from 'express';
import path from 'path';
import { Bitrix24Client } from '../bitrix24/client.js';
import { resolveWebhook } from '../utils/resolve-webhook.js';
import { createAuditLog } from '../bot/audit-log.js';
import { createThreadStore } from './thread-store.js';
import { createPendingStore } from './pending-store.js';
import { createAdditionalContactsIndex } from './additional-contacts-index.js';
import { registerMsnTalkRoutes } from './routes.js';
import { startMsnTalkBackgroundJobs } from './background-jobs.js';

const PORT = process.env.PORT || 3300;
const dataDir = process.env.DATA_DIR || new URL('../bot/data', import.meta.url).pathname;
const dataFile = (name) => path.join(dataDir, name);

const msntalkWebhookSecret = process.env.MSNTALK_WEBHOOK_SECRET;
if (!msntalkWebhookSecret) {
  throw new Error(
    'Defina MSNTALK_WEBHOOK_SECRET (segredo usado no path do webhook do MSN Talk, ' +
    'ex.: https://<host>/msntalk-events/<MSNTALK_WEBHOOK_SECRET>) antes de subir o servidor.'
  );
}
const webhookUrl = resolveWebhook();
const msntalkTicketUrlTemplate = process.env.MSNTALK_TICKET_URL_TEMPLATE;

const bitrixClient = new Bitrix24Client(webhookUrl);
const auditLog = createAuditLog(dataFile('audit.jsonl'));
const msntalkThreadStore = createThreadStore({ filePath: dataFile('msntalk-threads.json') });
const msntalkPendingStore = createPendingStore({ filePath: dataFile('msntalk-pending.json') });
const msntalkAdditionalContactsIndex = createAdditionalContactsIndex({ filePath: dataFile('msntalk-additional-contacts.json') });

startMsnTalkBackgroundJobs({
  webhookUrl,
  pendingStore: msntalkPendingStore,
  threadStore: msntalkThreadStore,
  additionalContactsIndex: msntalkAdditionalContactsIndex,
  ticketUrlTemplate: msntalkTicketUrlTemplate,
  auditLog,
});

const app = express();
app.use(express.json({ limit: '5mb' }));
app.get('/health', (req, res) => res.json({ status: 'ok' }));
registerMsnTalkRoutes(app, {
  bitrixClient,
  auditLog,
  msntalkWebhookSecret,
  msntalkTicketUrlTemplate,
  msntalkThreadStore,
  msntalkPendingStore,
  msntalkAdditionalContactsIndex,
});

app.listen(PORT, () => {
  console.log(`MSN Talk → Bitrix24 escutando na porta ${PORT} (dados em ${dataDir})`);
});
