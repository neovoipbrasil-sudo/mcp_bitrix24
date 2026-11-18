import { parseMsnTalkEvent } from './webhook-handler.js';
import { syncTimeline } from './sync-timeline.js';
import { describeError, maskPhone } from '../utils/describe-error.js';

// Rota do webhook do MSN Talk. Usada tanto pelo bot completo (src/bot/server.js)
// quanto pelo servidor só-MSN-Talk (src/msntalk/standalone.js).
export function registerMsnTalkRoutes(app, {
  bitrixClient,
  auditLog,
  msntalkWebhookSecret,
  msntalkTicketUrlTemplate,
  msntalkThreadStore,
  msntalkPendingStore,
  msntalkAdditionalContactsIndex,
}) {
  app.post('/msntalk-events/:secret', (req, res) => {
    if (req.params.secret !== msntalkWebhookSecret) {
      return res.status(404).send('not found');
    }

    // Ack immediately — same "fast ack, process after" pattern as /bitrix-events.
    res.status(200).send('ok');

    // parseMsnTalkEvent já quebrou em produção com um payload inesperado
    // (timestamp inválido) e derrubou a mensagem sem deixar rastro — esse
    // try/catch garante que qualquer falha futura de parsing pelo menos vira
    // um registro no audit log em vez de sumir em silêncio.
    let event;
    try {
      event = parseMsnTalkEvent(req.body);
    } catch (err) {
      console.error(`msntalk-events: payload inválido (ticket ${req.body?.ticket?.id ?? '?'}): ${describeError(err)}`);
      auditLog.logAction({
        tool: 'msntalk-sync',
        params: { rawTicketId: req.body?.ticket?.id },
        result: 'error',
      });
      return;
    }
    if (!event) {
      // Eventos que não são mensagem (ou sem telefone/texto) são ignorados de
      // propósito — mas registramos, para dar para ver se o MSN Talk está
      // mandando algo que a integração não reconhece.
      console.log(`msntalk-events: ignorado (method=${req.body?.method ?? '?'}, ticket ${req.body?.ticket?.id ?? '?'})`);
      return;
    }

    const who = `ticket ${event.ticketId}, tel ${maskPhone(event.phone)}, ${event.direction === 'outbound' ? 'enviada' : 'recebida'}`;
    console.log(`msntalk-events: mensagem ${who}`);

    syncTimeline({
      event,
      client: bitrixClient,
      auditLog,
      ticketUrlTemplate: msntalkTicketUrlTemplate,
      threadStore: msntalkThreadStore,
      pendingStore: msntalkPendingStore,
      additionalContactsIndex: msntalkAdditionalContactsIndex,
    }).then((result) => {
      if (result?.matched) {
        const where = result.groups.map((g) => `${g.entity} ${g.entity_ids.join(', ')}`).join(' + ');
        console.log(`msntalk-events: ✔ ${who} → timeline de ${where}`);
      } else {
        console.log(`msntalk-events: ✖ ${who} → nenhum lead/negócio ABERTO com esse telefone; guardada como pendente (nova tentativa a cada 15 min)`);
      }
    }).catch((err) => {
      // MSN Talk has no retry mechanism we can hook into, so we can't propagate
      // this error back to the sender — we can only make it observable on our
      // side: log it and record an audit-log entry (syncTimeline's own
      // no-match audit entry is written on its clean success path, never here).
      console.error(`msntalk-events: ✖ ${who} → falha ao gravar no Bitrix24: ${describeError(err)}`);
      auditLog.logAction({
        tool: 'msntalk-sync',
        params: { phone: event.phone, ticketId: event.ticketId },
        result: 'error',
      });
    });
  });
}
