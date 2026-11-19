// Editor do catálogo do Bitrix24 com agente de IA.
//   npm run catalogo      →  http://localhost:3400
// Só escuta em 127.0.0.1: usa o webhook do .env, então não deve ficar exposto na rede.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { loadEnv } from './lib/env.js';

loadEnv();
const cat = await import('./lib/catalogo.js');
const agente = await import('./lib/agente.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.CATALOGO_PORT || 3400);
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(here, 'public')));

const rota = fn => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (err) {
    res.status(400).json({ erro: err.message });
  }
};

app.get('/api/catalogo', rota(async req => (req.query.recarregar || !cat.resumo().lidoEm ? cat.recarregar() : cat.resumo())));
app.get('/api/propostas', rota(async () => cat.listarPropostas()));
app.post('/api/propostas', rota(async req => cat.criarProposta({ ...req.body, origem: 'manual' })));
app.post('/api/propostas/planilha-precos', rota(async () => cat.propostaPlanilhaPrecos()));

app.post('/api/propostas/:id/aplicar', rota(async req => {
  const p = await cat.aplicarProposta(req.params.id);
  if (req.body?.conversaId) {
    const erros = p.resultados.filter(r => !r.ok).map(r => `${r.titulo}: ${r.erro}`);
    agente.registrarEvento(req.body.conversaId, `Proposta ${p.id} (${p.resumo}) foi APLICADA: ${p.resultados.filter(r => r.ok).length} ok${erros.length ? `, ${erros.length} com erro — ${erros.join('; ')}` : ''}.`);
  }
  return { proposta: p, catalogo: cat.resumo() };
}));
app.post('/api/propostas/:id/descartar', rota(async req => {
  const p = cat.descartarProposta(req.params.id);
  if (req.body?.conversaId) agente.registrarEvento(req.body.conversaId, `Proposta ${p.id} (${p.resumo}) foi DESCARTADA pela pessoa.`);
  return p;
}));
app.post('/api/propostas/:id/desfazer', rota(async req => cat.propostaDesfazer(req.params.id)));

app.post('/api/chat', rota(async req => {
  const { conversaId, texto } = req.body ?? {};
  if (!conversaId || !String(texto ?? '').trim()) throw new Error('mensagem vazia');
  if (!cat.resumo().lidoEm) await cat.recarregar();
  const r = await agente.conversar(String(conversaId), String(texto));
  return { ...r, propostas: r.propostas.map(id => cat.getProposta(id)) };
}));
app.post('/api/chat/limpar', rota(async req => { agente.limparConversa(String(req.body?.conversaId)); return { ok: true }; }));

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Editor do catálogo em http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) console.log('Aviso: ANTHROPIC_API_KEY vazio no .env — o chat com IA não vai funcionar.');
});
