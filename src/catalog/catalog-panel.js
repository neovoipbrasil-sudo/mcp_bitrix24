import express from 'express';
import fs from 'fs';
import { auditCatalog } from './catalog-audit.js';

const MAX_OPERATIONS = 500;
const UI_HTML = fs.readFileSync(new URL('./catalog-panel.html', import.meta.url), 'utf-8');

// Painel de catálogo. Montado DENTRO do painel de relatórios (createReportsPanel → extraPages), então
// login, sessão e proteção contra CSRF vêm de lá e req.reportUser já está preenchido.
// Leitura e conversa com o assistente: qualquer usuário logado. Aplicar alterações: só administradores.
export function createCatalogPanel({ catalogService, catalogAgent, auditLog }) {
  const router = express.Router();
  router.use(express.json({ limit: '2mb' }));

  const canEdit = req => req.reportUser?.role === 'admin';

  router.get('/', (req, res) => {
    res.type('html').send(UI_HTML);
  });

  router.get('/api/data', async (req, res) => {
    try {
      const snapshot = await catalogService.getSnapshot({ force: req.query.refresh === '1' });
      res.json({ snapshot, audit: auditCatalog(snapshot), user: { username: req.reportUser.username, canEdit: canEdit(req) } });
    } catch (err) {
      res.status(502).json({ error: `Não consegui ler o catálogo do Bitrix24: ${err.response?.data?.error_description || err.message}` });
    }
  });

  router.post('/api/chat', async (req, res) => {
    if (!catalogAgent) return res.status(503).json({ error: 'Assistente de IA não configurado neste servidor.' });
    try {
      const { message, history } = req.body ?? {};
      const out = await catalogAgent.chat({ message, history });
      res.json(out);
    } catch (err) {
      res.status(500).json({ error: `O assistente falhou: ${err.message}` });
    }
  });

  router.post('/api/apply', async (req, res) => {
    if (!canEdit(req)) return res.status(403).json({ error: 'Só administradores aplicam alterações no catálogo.' });
    const operations = req.body?.operations;
    if (!Array.isArray(operations) || operations.length === 0) return res.status(400).json({ error: 'Nenhuma operação enviada.' });
    if (operations.length > MAX_OPERATIONS) return res.status(400).json({ error: `Máximo de ${MAX_OPERATIONS} operações por vez.` });
    const results = await catalogService.applyOperations(operations);
    for (const r of results) {
      auditLog?.logAction({
        userId: `reports:${req.reportUser.username}`,
        dialogId: 'catalog-panel',
        tool: `catalog.${r.op.action}`,
        params: r.op,
        result: r.ok ? 'ok' : 'error',
        error: r.ok ? undefined : r.error,
      });
    }
    res.json({ results });
  });

  return router;
}
