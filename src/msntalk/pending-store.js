import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';

// Guarda, por telefone, as linhas de mensagens que chegaram enquanto
// findCrmEntity não encontrava nenhum lead/negócio aberto para elas
// ("no-match"), junto com o ticketId mais recente em que isso aconteceu.
// Quando o telefone finalmente casar com um lead/negócio — seja porque
// chegou uma mensagem nova (syncTimeline) ou porque reconcile-pending.js
// encontrou o match num ciclo periódico, sem esperar mensagem nova — essas
// linhas são recuperadas e inseridas na timeline, em vez de perdidas.
export function createPendingStore({ filePath }) {
  function ensureDir() {
    const dir = path.dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  function load() {
    if (!existsSync(filePath)) return {};
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  }

  function persist(data) {
    ensureDir();
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  // Registros antigos guardavam um array de linhas direto (sem ticketId).
  // Normaliza pra sempre trabalhar com { ticketId, lines }.
  // `form` (opcional) marca que a conversa começou com a mensagem de
  // formulário preenchido do anúncio — ver markFormSubmission.
  function normalize(entry) {
    if (!entry) return { ticketId: null, lines: [] };
    if (Array.isArray(entry)) return { ticketId: null, lines: entry };
    const normalized = { ticketId: entry.ticketId ?? null, lines: entry.lines ?? [] };
    if (entry.form) normalized.form = entry.form;
    return normalized;
  }

  return {
    appendPending(phone, line, ticketId) {
      const data = load();
      const entry = normalize(data[phone]);
      entry.lines.push(line);
      data[phone] = { ...entry, ticketId: ticketId ?? null };
      persist(data);
    },

    // Guarda os dados da mensagem de formulário preenchido (texto, nome,
    // telefone, ticket e quando chegou) de um telefone ainda sem card no
    // CRM. O card normalmente é criado pela integração do tráfego pago logo
    // depois; reconcile-pending.js só cria um lead por conta própria se ele
    // não aparecer dentro do prazo. Só a primeira mensagem de formulário
    // conta — uma repetição não reinicia o prazo.
    markFormSubmission(phone, form) {
      const data = load();
      const entry = normalize(data[phone]);
      if (entry.form) return;
      data[phone] = { ...entry, form };
      persist(data);
    },

    // Mesmo retorno de takePending, mas sem remover nada.
    getPending(phone) {
      return normalize(load()[phone]);
    },

    // Retorna { ticketId, lines } com o que está pendente do telefone e
    // remove do armazenamento — cada lote de mensagens perdidas só deve ser
    // recuperado uma única vez.
    takePending(phone) {
      const data = load();
      const pending = normalize(data[phone]);
      if (pending.lines.length > 0) {
        delete data[phone];
        persist(data);
      }
      return pending;
    },

    // Todos os telefones com algo pendente agora — usado por
    // reconcile-pending.js para saber quais telefones reconsultar.
    listPhones() {
      return Object.keys(load());
    },
  };
}
