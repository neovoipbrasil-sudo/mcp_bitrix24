import { Bitrix24Client } from '../bitrix24/client.js';
import { refreshAdditionalContacts } from './refresh-additional-contacts.js';
import { reconcilePending } from './reconcile-pending.js';
import { describeError } from '../utils/describe-error.js';

// Rotinas periódicas da integração MSN Talk (refresh do índice de contatos
// adicionais e reconciliação das conversas pendentes). Usadas pelo bot
// completo e pelo servidor só-MSN-Talk.
export function startMsnTalkBackgroundJobs({
  webhookUrl,
  pendingStore,
  threadStore,
  additionalContactsIndex,
  ticketUrlTemplate,
  auditLog,
}) {
  // Cliente Bitrix dedicado a essa varredura em segundo plano — evita que
  // milhares de chamadas do refresh fiquem na frente das sincronizações em
  // tempo real do MSN Talk na fila do rate-limiter (cada client tem a sua).
  // Só que a cota de chamadas por minuto do Bitrix é por WEBHOOK, não por
  // client — em produção, rodar esse client no ritmo padrão (2 chamadas/s)
  // ao mesmo tempo que o tráfego real do webhook estourou a cota e travou o
  // refresh inteiro com QUERY_LIMIT_EXCEEDED (HTTP 503) logo na primeira
  // tentativa. Por isso esse client roda bem mais devagar (1 chamada a cada
  // 1.5s) — o refresh não é sensível a tempo, mas o tráfego em tempo real é.
  const additionalContactsRefreshClient = new Bitrix24Client(webhookUrl, { minDelay: 1500 });
  const ADDITIONAL_CONTACTS_REFRESH_INTERVAL_MS = 30 * 60 * 1000;
  // Em produção, um ciclo completo passou a levar horas (cota do Bitrix
  // disputada com o tráfego real do webhook) — bem mais que os 30min do
  // intervalo. Sem essa guarda, cada novo "tick" do setInterval disparava
  // outra varredura por cima da anterior ainda em andamento, as duas
  // competindo pela mesma cota e falhando mais (seguidas de vários 502/503).
  let additionalContactsRefreshInFlight = false;
  async function runAdditionalContactsRefresh() {
    if (additionalContactsRefreshInFlight) return;
    additionalContactsRefreshInFlight = true;
    try {
      await refreshAdditionalContacts({ client: additionalContactsRefreshClient, index: additionalContactsIndex });
    } catch (err) {
      console.error(`msntalk: refreshAdditionalContacts falhou (tenta de novo no próximo ciclo): ${describeError(err)}`);
    } finally {
      additionalContactsRefreshInFlight = false;
    }
  }
  runAdditionalContactsRefresh();
  setInterval(runAdditionalContactsRefresh, ADDITIONAL_CONTACTS_REFRESH_INTERVAL_MS);

  // Reconsulta periodicamente os telefones com conversa pendente (sem match
  // ainda) — cobre, por exemplo, alguém corrigir/cadastrar o número no
  // contato depois que a conversa já tinha ficado pendente, sem precisar
  // esperar o cliente escrever de novo. Bem mais leve que o refresh de
  // contatos adicionais (só os telefones realmente pendentes, não todo
  // lead/negócio aberto do portal), então pode rodar bem mais seguido.
  const reconcilePendingClient = new Bitrix24Client(webhookUrl, { minDelay: 1000 });
  const RECONCILE_PENDING_INTERVAL_MS = 15 * 60 * 1000;
  let reconcilePendingInFlight = false;
  async function runReconcilePending() {
    if (reconcilePendingInFlight) return;
    reconcilePendingInFlight = true;
    try {
      await reconcilePending({
        client: reconcilePendingClient,
        pendingStore,
        threadStore,
        additionalContactsIndex,
        ticketUrlTemplate,
        auditLog,
      });
    } catch (err) {
      console.error(`msntalk: reconcilePending falhou (tenta de novo no próximo ciclo): ${describeError(err)}`);
    } finally {
      reconcilePendingInFlight = false;
    }
  }
  runReconcilePending();
  setInterval(runReconcilePending, RECONCILE_PENDING_INTERVAL_MS);
}
