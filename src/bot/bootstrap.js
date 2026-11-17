import Anthropic from '@anthropic-ai/sdk';
import { Bitrix24Client } from '../bitrix24/client.js';
import { resolveWebhook } from '../utils/resolve-webhook.js';
import { createApp } from './server.js';
import { createAgentLoop } from './agent-loop.js';
import { createClaudeCodeAdapter } from './claude-code-adapter.js';
import { createReplyer } from './reply.js';
import { createRateLimiter } from './message-rate-limiter.js';
import { createPendingActionsStore } from './pending-actions.js';
import { createMemoryStore } from './memory.js';
import { createConversationHistory } from './conversation-history.js';
import { createAuditLog } from './audit-log.js';
import { loadBotConfig } from './bot-config.js';
import { createThreadStore } from '../msntalk/thread-store.js';
import { createPendingStore } from '../msntalk/pending-store.js';
import { createAdditionalContactsIndex } from '../msntalk/additional-contacts-index.js';
import { startMsnTalkBackgroundJobs } from '../msntalk/background-jobs.js';
import { createReportUserStore } from '../reports/report-users.js';
import { createReportsPanel } from '../reports/reports-panel.js';

const PORT = process.env.BOT_PORT || 3300;

const botConfig = loadBotConfig({ filePath: new URL('./bot-config.json', import.meta.url) });

const bitrixClient = new Bitrix24Client(resolveWebhook());
const anthropic = process.env.BOT_MODEL_BACKEND === 'claude-code'
  ? createClaudeCodeAdapter()
  : new Anthropic();

const replyer = createReplyer({ client: bitrixClient, botId: botConfig.botId, botToken: botConfig.botToken });
const { reply, notifyAction, replyWithFile } = replyer;
const rateLimiter = createRateLimiter();
const pendingActions = createPendingActionsStore({ filePath: new URL('./data/pending-actions.json', import.meta.url).pathname });
const memory = createMemoryStore({ dataDir: new URL('./data', import.meta.url).pathname });
const conversationHistory = createConversationHistory({ dataDir: new URL('./data', import.meta.url).pathname });
const auditLog = createAuditLog(new URL('./data/audit.jsonl', import.meta.url).pathname);
const agentLoop = createAgentLoop({ anthropic, pendingActions, memory, auditLog, conversationHistory });

const msntalkWebhookSecret = process.env.MSNTALK_WEBHOOK_SECRET;
if (!msntalkWebhookSecret) {
  throw new Error(
    'Defina MSNTALK_WEBHOOK_SECRET (segredo usado no path do webhook do MSN Talk, ' +
    'ex.: https://<host>/msntalk-events/<MSNTALK_WEBHOOK_SECRET>) antes de subir o bot.'
  );
}
const msntalkTicketUrlTemplate = process.env.MSNTALK_TICKET_URL_TEMPLATE;
const msntalkThreadStore = createThreadStore({ filePath: new URL('./data/msntalk-threads.json', import.meta.url).pathname });
const msntalkPendingStore = createPendingStore({ filePath: new URL('./data/msntalk-pending.json', import.meta.url).pathname });

const msntalkAdditionalContactsIndex = createAdditionalContactsIndex({
  filePath: new URL('./data/msntalk-additional-contacts.json', import.meta.url).pathname,
});
startMsnTalkBackgroundJobs({
  webhookUrl: resolveWebhook(),
  pendingStore: msntalkPendingStore,
  threadStore: msntalkThreadStore,
  additionalContactsIndex: msntalkAdditionalContactsIndex,
  ticketUrlTemplate: msntalkTicketUrlTemplate,
  auditLog,
});

const app = createApp({
  botConfig,
  agentLoop,
  reply,
  notifyAction,
  replyWithFile,
  rateLimiter,
  bitrixClient,
  auditLog,
  msntalkWebhookSecret,
  msntalkTicketUrlTemplate,
  msntalkThreadStore,
  msntalkPendingStore,
  msntalkAdditionalContactsIndex,
});

// Painel de relatórios com login (usuários em data/report-users.json; o primeiro acesso é
// admin/admin com troca de senha obrigatória). Os relatórios são os .html gerados em REPORTS_DIR.
const reportUserStore = createReportUserStore({ filePath: new URL('./data/report-users.json', import.meta.url).pathname });
const reportsDir = process.env.REPORTS_DIR || new URL('./data/reports', import.meta.url).pathname;
app.use('/reports', createReportsPanel({ userStore: reportUserStore, reportsDir }));

app.listen(PORT, () => {
  console.log(`Bot Server escutando na porta ${PORT}`);
});
