import express from 'express';
import crypto from 'crypto';
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validarPedido } from './shared/validate-order.js';
import { montarResumo, resumoEmTexto, resumoEmHtml } from './shared/summary.js';
import { enviarPedidoAoBitrix, buscarCliente } from './bitrix-order.js';
import { onlyDigits } from './shared/validators.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(here, 'public');
const SHARED_DIR = path.join(here, 'shared');
const KEY_COOKIE = 'fp_key';
const ADMIN_COOKIE = 'fp_admin';
const ADMIN_TTL_MS = 8 * 60 * 60 * 1000;

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

function novoPedidoId(now) {
  const d = now();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `PED-${ymd}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

// Formulário de pedidos (/formulario) + painel do catálogo (/formulario/admin).
export function createPedidosRouter({ catalogStore, bitrixClient, mailer, userStore, logFile, now = () => new Date(), enviar = enviarPedidoAoBitrix }) {
  const router = express.Router();
  const envios = new Map(); // envioId -> Promise do resultado (evita card duplicado em clique duplo / reenvio)
  const adminSessions = new Map();
  const tentativas = new Map(); // ip -> { count, since }

  const secureFlag = (req) => (req.secure || req.get('x-forwarded-proto') === 'https' ? '; Secure' : '');

  // Proteção CSRF: POST/PUT só da mesma origem.
  router.use((req, res, next) => {
    if (!['POST', 'PUT', 'DELETE'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (origin) {
      let host = null;
      try { host = new URL(origin).host; } catch { /* inválido */ }
      if (host !== req.get('host')) return res.status(403).json({ erro: 'Origem não permitida.' });
    }
    next();
  });

  // ---------------------------------------------------------- chave de acesso do formulário
  function chaveOk(req) {
    const chave = catalogStore.get().regras.chaveAcesso;
    if (!chave) return true;
    return safeEqual(parseCookies(req.get('cookie'))[KEY_COOKIE], chave) || safeEqual(req.get('x-form-key'), chave);
  }

  router.get(['/', '/index.html'], (req, res) => {
    const chave = catalogStore.get().regras.chaveAcesso;
    if (chave && req.query.k) {
      if (!safeEqual(req.query.k, chave)) return res.status(403).send('Link inválido. Peça o link atualizado do formulário.');
      res.append('Set-Cookie', `${KEY_COOKIE}=${encodeURIComponent(chave)}; Path=/formulario; HttpOnly; SameSite=Lax; Max-Age=${180 * 24 * 3600}${secureFlag(req)}`);
      return res.redirect('/formulario/');
    }
    if (!chaveOk(req)) return res.status(403).send('Acesso restrito. Abra o formulário pelo link que você recebeu.');
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });

  router.use('/assets', express.static(path.join(PUBLIC_DIR, 'assets'), { maxAge: '5m' }));
  router.use('/shared', express.static(SHARED_DIR, { maxAge: '5m' }));

  const api = express.Router();
  api.use((req, res, next) => (chaveOk(req) ? next() : res.status(403).json({ erro: 'Acesso restrito.' })));

  api.get('/catalogo', (req, res) => res.json(catalogStore.getPublic()));

  // Cliente já cadastrado no Bitrix? Responde só se existe e o nome — nada além disso.
  api.get('/cliente', async (req, res) => {
    const tipo = req.query.tipo === 'PJ' ? 'PJ' : 'PF';
    const doc = onlyDigits(req.query.doc);
    if ((tipo === 'PJ' && doc.length !== 14) || (tipo === 'PF' && doc.length !== 11)) return res.status(400).json({ erro: 'Documento inválido.' });
    try {
      const achado = await buscarCliente(bitrixClient, { tipo, doc });
      res.json({ encontrado: !!(achado.contactId || achado.companyId || achado.leadId), lead: !!achado.leadId, cadastro: !!(achado.contactId || achado.companyId) });
    } catch (err) {
      console.error('formulario: busca de cliente falhou', err.message);
      res.json({ encontrado: false, indisponivel: true });
    }
  });

  api.post('/pedidos', express.json({ limit: '80mb' }), async (req, res) => {
    const ip = req.ip;
    const t = tentativas.get(ip);
    const agora = Date.now();
    if (t && agora - t.since < 60_000 && t.count >= 10) return res.status(429).json({ erro: 'Muitos envios seguidos. Aguarde um minuto.' });
    tentativas.set(ip, !t || agora - t.since >= 60_000 ? { count: 1, since: agora } : { ...t, count: t.count + 1 });

    const pedido = req.body?.pedido;
    const envioId = String(req.body?.envioId || '');
    if (!pedido || !/^[\w-]{8,64}$/.test(envioId)) return res.status(400).json({ erro: 'Pedido inválido.' });
    const catalogo = catalogStore.get();
    const { erros, calculo } = validarPedido(catalogo, pedido);
    if (erros.length) return res.status(422).json({ erro: 'Há campos com problema.', erros });

    if (!envios.has(envioId)) {
      envios.set(envioId, (async () => {
        const pedidoId = novoPedidoId(now);
        const secoes = montarResumo(pedido, calculo);
        const texto = resumoEmTexto(secoes);
        const resultado = await enviar({ client: bitrixClient, catalogo, pedido, calculo, pedidoId, resumoTexto: texto, portalHost: bitrixClient.portal });
        registrar({ quando: now().toISOString(), pedidoId, envioId, origem: pedido.origem?.nome, cliente: pedido.cliente?.tipo === 'PF' ? pedido.cliente.pf?.nome : pedido.cliente?.pj?.razaoSocial, cards: resultado.cards.map((c) => c.id), valores: { mensal: calculo.mensal, adesao: calculo.adesao, total: calculo.totalContrato } });
        let email = { enviado: false };
        try {
          const r = await mailer.send({
            to: pedido.origem.email,
            subject: `Pedido ${pedidoId} recebido – ${pedido.cliente?.tipo === 'PF' ? pedido.cliente.pf?.nome : pedido.cliente?.pj?.razaoSocial}`,
            text: `Pedido ${pedidoId}\n\n${texto}`,
            html: `<p style="font:14px Arial,sans-serif">Pedido <b>${pedidoId}</b> recebido. Resumo:</p>${resumoEmHtml(secoes)}`,
          });
          email = { enviado: !r?.skipped };
          // Rastreio no log do serviço: id da mensagem e resposta do servidor SMTP (sem endereços).
          if (!r?.skipped) {
            console.log(`formulario: e-mail do pedido ${pedidoId} aceito pelo SMTP (aceitos ${r.accepted?.length ?? 0}, recusados ${r.rejected?.length ?? 0}) id=${r.messageId} resposta="${r.response}"`);
          }
        } catch (err) {
          console.error('formulario: e-mail do resumo falhou', err.message);
          email = { enviado: false, erro: true };
        }
        return { ...resultado, email };
      })());
    }
    try {
      const resultado = await envios.get(envioId);
      res.json({ ok: true, pedidoId: resultado.pedidoId, cards: resultado.cards, email: resultado.email });
    } catch (err) {
      envios.delete(envioId); // falhou: permite tentar de novo com o mesmo envioId
      console.error('formulario: envio ao Bitrix falhou', err);
      res.status(502).json({ erro: 'Não foi possível gravar o pedido no Bitrix24 agora. Seus dados continuam na tela; tente enviar de novo em instantes.' });
    }
  });

  function registrar(entrada) {
    if (!logFile) return;
    const dir = path.dirname(logFile);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(logFile, JSON.stringify(entrada) + '\n', 'utf-8');
  }

  router.use('/api', api);

  // ---------------------------------------------------------- painel do catálogo
  const admin = express.Router();

  function adminUser(req) {
    const token = parseCookies(req.get('cookie'))[ADMIN_COOKIE];
    const s = token && adminSessions.get(token);
    if (!s || s.expires < Date.now()) { if (token) adminSessions.delete(token); return null; }
    const u = userStore.get(s.username);
    return u && u.role === 'admin' ? u : null;
  }

  admin.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));

  admin.post('/login', express.json(), (req, res) => {
    const u = userStore.authenticate(req.body?.usuario, req.body?.senha);
    if (!u) return res.status(401).json({ erro: 'Usuário ou senha incorretos.' });
    if (u.role !== 'admin') return res.status(403).json({ erro: 'Só administradores podem alterar o catálogo.' });
    if (u.mustChangePassword) return res.status(403).json({ erro: 'Troque sua senha primeiro no painel /reports e depois volte aqui.' });
    const token = crypto.randomBytes(32).toString('hex');
    adminSessions.set(token, { username: u.username, expires: Date.now() + ADMIN_TTL_MS });
    res.append('Set-Cookie', `${ADMIN_COOKIE}=${token}; Path=/formulario/admin; HttpOnly; SameSite=Strict; Max-Age=${ADMIN_TTL_MS / 1000}${secureFlag(req)}`);
    res.json({ ok: true, usuario: u.username });
  });

  admin.post('/sair', (req, res) => {
    adminSessions.delete(parseCookies(req.get('cookie'))[ADMIN_COOKIE]);
    res.append('Set-Cookie', `${ADMIN_COOKIE}=; Path=/formulario/admin; Max-Age=0`);
    res.json({ ok: true });
  });

  admin.use('/api', (req, res, next) => {
    const u = adminUser(req);
    if (!u) return res.status(401).json({ erro: 'Entre novamente.' });
    req.adminUser = u;
    next();
  });
  // Produtos ativos do catálogo do Bitrix24, para associar aos planos/serviços (cache de 10 min).
  let cacheProdutos = null;
  admin.get('/api/produtos-bitrix', async (req, res) => {
    try {
      if (!cacheProdutos || Date.now() - cacheProdutos.em > 10 * 60 * 1000 || req.query.atualizar) {
        const lista = [];
        let start = 0;
        for (let pagina = 0; pagina < 40; pagina++) {
          const r = await bitrixClient.call('crm.product.list', { filter: { ACTIVE: 'Y' }, select: ['ID', 'NAME', 'PRICE'], order: { NAME: 'ASC' }, start });
          lista.push(...r.result.map((p) => ({ id: Number(p.ID), nome: p.NAME, preco: Number(p.PRICE) })));
          if (r.next == null) break;
          start = r.next;
        }
        cacheProdutos = { em: Date.now(), lista };
      }
      res.json({ produtos: cacheProdutos.lista });
    } catch (err) {
      console.error('formulario: listar produtos do Bitrix falhou', err.message);
      res.status(502).json({ erro: 'Não foi possível listar os produtos do Bitrix24 agora.' });
    }
  });

  admin.get('/api/catalogo', (req, res) => res.json({ usuario: req.adminUser.username, catalogo: catalogStore.get(), historico: catalogStore.history() }));
  admin.put('/api/catalogo', express.json({ limit: '2mb' }), (req, res) => {
    try {
      const salvo = catalogStore.save(req.body?.catalogo, { usuario: req.adminUser.username });
      res.json({ ok: true, catalogo: salvo, historico: catalogStore.history() });
    } catch (err) {
      res.status(400).json({ erro: err.message });
    }
  });

  router.use('/admin', admin);
  return router;
}
