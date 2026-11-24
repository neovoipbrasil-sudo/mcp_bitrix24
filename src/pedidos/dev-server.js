// Servidor local só para testar o formulário: NÃO grava nada no Bitrix24 (envio simulado)
// e usa dados temporários. Uso: node src/pedidos/dev-server.js  →  http://localhost:3410/formulario/
import express from 'express';
import os from 'os';
import path from 'path';
import { mkdtempSync } from 'fs';
import { createPedidosRouter } from './router.js';
import { createCatalogStore } from './catalog-store.js';
import { createReportUserStore } from '../reports/report-users.js';
import { createPedidosStore } from './pedidos-store.js';

const dir = mkdtempSync(path.join(os.tmpdir(), 'formulario-dev-'));
const PORT = Number(process.env.PORT || 3410);
const produtosExemplo = [{ ID: '704', NAME: 'Neo Vox Full Nuvem Ilimitado 5 — 24 meses', PRICE: '141.8' }, { ID: '130', NAME: 'Portabilidade de Números', PRICE: '9.5' }];
// No teste, o CNPJ 11.222.333/0001-81 conta como cliente já cadastrado (para testar o aditivo).
const fakeClient = { portal: 'exemplo.bitrix24.com.br', call: async (m, p) => {
  if (m === 'crm.product.list') return { result: produtosExemplo };
  if (m === 'crm.requisite.list' && String(p?.filter?.RQ_CNPJ || '').replace(/\D/g, '') === '11222333000181') return { result: [{ ID: 1, ENTITY_ID: 1 }] };
  return { result: [] };
} };

// Usuário de teste do painel do catálogo: admin / teste1234 (só neste servidor local).
const userStore = createReportUserStore({ filePath: path.join(dir, 'report-users.json') });
userStore.changePassword('admin', 'admin', 'teste1234');
// Operador de teste: operador / teste1234 (vê só os pedidos).
userStore.create({ username: 'operador', password: 'temporaria1', role: 'operador' });
userStore.changePassword('operador', 'temporaria1', 'teste1234');

// Vendedor fictício para o formulário funcionar localmente (o catálogo padrão não traz pessoas).
const catalogStore = createCatalogStore({ filePath: path.join(dir, 'pedidos-catalogo.json') });
catalogStore.save({ ...catalogStore.get(), vendedores: [{ id: 'v1', nome: 'Vendedor Teste', email: 'vendedor@exemplo.com.br', celular: '5561900000001', bitrixUserId: 1, ativo: true }] }, { usuario: 'dev' });

// DEV_FALHAR_BITRIX=1 simula o Bitrix24 recusando o envio (para testar o reenvio pelo painel).
let falhar = process.env.DEV_FALHAR_BITRIX === '1';

const app = express();
app.use('/formulario', createPedidosRouter({
  catalogStore,
  bitrixClient: fakeClient,
  mailer: { enabled: false, send: async () => ({ skipped: true }) },
  userStore,
  pedidosStore: createPedidosStore({ dir: path.join(dir, 'pedidos') }),
  enviar: async ({ pedidoId, calculo }) => {
    if (falhar) { falhar = false; throw new Error('Bitrix24 error [QUERY_LIMIT_EXCEEDED]: simulado'); }
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
