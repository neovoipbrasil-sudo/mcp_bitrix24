// Servidor próprio do formulário de pedidos (serviço separado do bot no Easypanel).
// Precisa só de B24_DEFAULT_WEBHOOK; e-mail opcional (SMTP_*). Dados em DATA_DIR (volume persistente).
//   /formulario/        formulário para vendedores e revendas
//   /formulario/admin   catálogo (planos, preços, vendedores, revendas) — login de admin
//   /reports            login, troca de senha e gestão de usuários (1º acesso: admin / admin)
import express from 'express';
import path from 'path';
import { Bitrix24Client } from '../bitrix24/client.js';
import { resolveWebhook } from '../utils/resolve-webhook.js';
import { createReportUserStore } from '../reports/report-users.js';
import { createReportsPanel } from '../reports/reports-panel.js';
import { createPedidosRouter } from './router.js';
import { createCatalogStore } from './catalog-store.js';
import { createMailer } from './mailer.js';

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.resolve('data');

const bitrixClient = new Bitrix24Client(resolveWebhook());
const userStore = createReportUserStore({ filePath: path.join(DATA_DIR, 'report-users.json') });

const app = express();
app.set('trust proxy', 1); // atrás do proxy do Easypanel: IP real e HTTPS corretos
app.get('/', (req, res) => res.redirect('/formulario/'));
app.get('/saude', (req, res) => res.json({ ok: true }));
app.use('/reports', createReportsPanel({ userStore, reportsDir: path.join(DATA_DIR, 'reports') }));
app.use('/formulario', createPedidosRouter({
  catalogStore: createCatalogStore({ filePath: path.join(DATA_DIR, 'pedidos-catalogo.json') }),
  bitrixClient,
  mailer: createMailer(),
  userStore,
  logFile: path.join(DATA_DIR, 'pedidos-enviados.jsonl'),
}));

app.listen(PORT, () => {
  console.log(`Formulário de pedidos escutando na porta ${PORT} (portal ${bitrixClient.portal}, dados em ${DATA_DIR})`);
});
