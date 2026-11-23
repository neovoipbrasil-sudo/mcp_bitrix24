import { findCrmEntity } from './find-crm-entity.js';
import { postConversationToGroups, createLeadFromFormSubmission } from './sync-timeline.js';

// Prazo para o card do tráfego pago aparecer depois da mensagem de
// formulário. Entre 19 e 22/11/2026 ele chegou em até 34 min; 2 h dá folga
// antes de o plano B criar um lead por conta própria.
export const FORM_FALLBACK_MS = 2 * 60 * 60 * 1000;

// Varre todo telefone com mensagem pendente (pendingStore) e reconsulta o
// Bitrix pra ver se agora bate com um lead/negócio aberto — sem esperar o
// cliente mandar outra mensagem. Cobre o caso de alguém corrigir/cadastrar
// o número num contato (ou reabrir um lead) depois que a conversa já tinha
// ficado pendente: antes dessa reconciliação, isso só subia pra timeline se
// o cliente escrevesse de novo (ou manualmente, como fizemos com o lead
// 4400). Roda bem menos chamadas que refresh-additional-contacts.js — só
// os telefones realmente pendentes, não todo lead/negócio aberto do portal.
export async function reconcilePending({ client, pendingStore, threadStore, additionalContactsIndex, ticketUrlTemplate, auditLog, now = Date.now() }) {
  let reconciled = 0;
  for (const phone of pendingStore.listPhones()) {
    let groups = await findCrmEntity(client, phone, additionalContactsIndex);
    if (!groups) {
      const form = pendingStore.getPending?.(phone).form;
      if (!form || now - form.receivedAt < FORM_FALLBACK_MS) continue;
      // Plano B: a conversa começou com a mensagem de formulário, mas o card
      // do tráfego pago não apareceu dentro do prazo.
      const created = await createLeadFromFormSubmission(form, client);
      groups = [created];
      auditLog.logAction({
        tool: 'msntalk-sync',
        params: { phone, ticketId: form.ticketId, entity_id: created.entity_ids[0] },
        result: 'lead-created-fallback',
      });
    }

    const pending = pendingStore.takePending(phone);
    if (pending.lines.length === 0) continue;

    // Registros antigos (de antes do pendingStore guardar o ticketId) não
    // têm um número de ticket real pra usar como chave — usamos um rótulo
    // fixo não numérico em vez de perder o texto; nunca colide com um
    // ticketId de verdade do MSN Talk (que é sempre numérico).
    const ticketId = pending.ticketId ?? 'legado';
    const rawThread = threadStore.getThread(ticketId);
    const lines = [...pending.lines, ...(rawThread?.lines ?? [])];

    await postConversationToGroups({ groups, ticketId, lines, ticketUrlTemplate, threadStore });

    auditLog.logAction({
      tool: 'msntalk-sync',
      params: { phone, ticketId, entity_id: groups[0].entity_ids[0], recovered: pending.lines.length },
      result: 'backfill',
    });
    reconciled += 1;
  }
  return { reconciled };
}
