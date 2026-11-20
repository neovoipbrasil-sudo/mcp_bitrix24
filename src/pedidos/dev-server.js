// Servidor local só para testar o formulário: NÃO grava nada no Bitrix24 (envio simulado)
// e usa dados temporários. Uso: node src/pedidos/dev-server.js  →  http://localhost:3410/formulario/
import express from 'express';
import os from 'os';
import path from 'path';
import { mkdtempSync } from 'fs';
import { createPedidosRouter } from './router.js';
import { createCatalogStore } from './catalog-store.js';
import { createReportUserStore } from '../reports/report-users.js';

const dir = mkdtempSync(path.join(os.tmpdir(), 'formulario-dev-'));
const PORT = Number(process.env.PORT || 3410);
const produtosExemplo = [{ ID: '704', NAME: 'Neo Vox Full Nuvem Ilimitado 5 — 24 meses', PRICE: '141.8' }, { ID: '130', NAME: 'Portabilidade de Números', PRICE: '9.5' }];
const fakeClient = { portal: 'exemplo.bitrix24.com.br', call: async (m) => ({ result: m === 'crm.product.list' ? produtosExemplo : [] }) };

// Usuário de teste do painel do catálogo: admin / teste1234 (só neste servidor local).
const userStore = createReportUserStore({ filePath: path.join(dir, 'report-users.json') });
userStore.changePassword('admin', 'admin', 'teste1234');

const app = express();
app.use('/formulario', createPedidosRouter({
  catalogStore: createCatalogStore({ filePath: path.join(dir, 'pedidos-catalogo.json') }),
  bitrixClient: fakeClient,
  mailer: { enabled: false, send: async () => ({ skipped: true }) },
  userStore,
  logFile: path.join(dir, 'pedidos-enviados.jsonl'),
  enviar: async ({ pedidoId, calculo }) => {
    const cards = [];
    let id = 90000;
    if (calculo.vox) cards.push({ id: ++id, tipo: 'vox', titulo: 'Neo Vox (simulado)' });
    if (calculo.phone) cards.push({ id: ++id, tipo: 'phone', titulo: 'Neo Phone (simulado)' });
    (calculo.portabilidade?.porBloco || []).forEach((_, i) => cards.push({ id: ++id, tipo: 'portabilidade', titulo: `Portabilidade ${i + 1} (simulado)` }));
    return { pedidoId, cards };
  },
}));
app.get('/', (req, res) => res.redirect('/formulario/'));
app.listen(PORT, () => console.log(`Formulário (teste, sem Bitrix) em http://localhost:${PORT}/formulario/  ·  dados em ${dir}`));
