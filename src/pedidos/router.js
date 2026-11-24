import express from 'express';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { validarPedido } from './shared/validate-order.js';
import { montarResumo, resumoEmTexto, emailHtml } from './shared/summary.js';
import { enviarPedidoAoBitrix, buscarCliente } from './bitrix-order.js';
import { onlyDigits } from './shared/validators.js';
import { STATUS, resumir } from './pedidos-store.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(here, 'public');
const SHARED_DIR = path.join(here, 'shared');
const KEY_COOKIE = 'fp_key';
const ADMIN_COOKIE = 'fp_admin';
const ADMIN_TTL_MS = 8 * 60 * 60 * 1000;
const PERFIS_PAINEL = ['admin', 'operador'];

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

const nomeCliente = (p) => (p.cliente?.tipo === 'PF' ? p.cliente.pf?.nome : p.cliente?.pj?.razaoSocial);

// Formulário de pedidos (/formulario) + painel (/formulario/admin): pedidos, catálogo e usuários.
export function createPedidosRouter({ catalogStore, pedidosStore, bitrixClient, mailer, userStore, now = () => new Date(), enviar = enviarPedidoAoBitrix }) {
  const router = express.Router();
  const envios = new Map(); // envioId -> Promise do resultado (evita pedido duplicado em clique duplo / reenvio)
  const adminSessions = new Map();
  const tentativas = new Map(); // ip -> { count, since }
  const falhasLogin = new Map(); // `${ip}|${usuario}` -> { count, since }

  const secureFlag = (req) => (req.secure || req.get('x-forwarded-proto') === 'https' ? '; Secure' : '');

  // Proteção CSRF: escrita só da mesma origem.
  router.use((req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (origin) {
      let host = null;
      try { host = new URL(origin).host; } catch { /* inválido */ }
      if (host !== req.get('host')) return res.status(403).json({ erro: 'Origem não permitida.' });
    }
    next();
  });

  // ---------------------------------------------------------- envio ao Bitrix24 (usado no envio e no reenvio)
  async function enviarAoBitrix(id, { usuario = null } = {}) {
    const registro = pedidosStore.obter(id);
    const pedido = pedidosStore.pedidoComAnexos(id);
    const texto = resumoEmTexto(montarResumo(pedido, registro.calculo));
    pedidosStore.atualizar(id, (r) => { r.bitrix.tentativas += 1; r.bitrix.situacao = 'enviando'; });
    try {
      const resultado = await enviar({
        client: bitrixClient, catalogo: catalogStore.get(), pedido, calculo: registro.calculo, pedidoId: id,
        resumoTexto: texto, portalHost: bitrixClient.portal,
        aoCriarCard: (card) => pedidosStore.atualizar(id, (r) => { r.bitrix.cards.push(card); }),
      });
      pedidosStore.atualizar(id, (r) => {
        r.bitrix = { ...r.bitrix, situacao: 'enviado', erro: null, cards: resultado.cards, contactId: resultado.contactId, companyId: resultado.companyId, leadId: resultado.leadId };
        r.historico.push({ quando: now().toISOString(), usuario, acao: `Gravado no Bitrix24 (${resultado.cards.length} card(s))` });
      });
      return { ok: true, cards: resultado.cards };
    } catch (err) {
      console.error(`formulario: envio do pedido ${id} ao Bitrix falhou`, err);
      pedidosStore.atualizar(id, (r) => {
        r.bitrix.situacao = 'falhou';
        r.bitrix.erro = String(err.message || err).slice(0, 500);
        r.historico.push({ quando: now().toISOString(), usuario, acao: `Falha ao gravar no Bitrix24: ${r.bitrix.erro}` });
      });
      return { ok: false, erro: err.message };
    }
  }

  async function enviarEmailResumo(id) {
    const r = pedidosStore.obter(id);
    const secoes = montarResumo(r.pedido, r.calculo);
    try {
      const info = await mailer.send({
        to: r.pedido.origem.email,
        subject: `Pedido ${id} recebido – ${nomeCliente(r.pedido)}`,
        text: `Pedido ${id}\n\n${resumoEmTexto(secoes)}`,
        html: emailHtml({ titulo: `Pedido ${id} recebido`, introducao: `Cliente: <b>${nomeCliente(r.pedido).replace(/</g, '&lt;')}</b>. Confira o resumo abaixo.`, secoes }),
      });
      if (info?.skipped) {
        pedidosStore.atualizar(id, (x) => { x.email = { situacao: 'desligado' }; });
        return { enviado: false };
      }
      console.log(`formulario: e-mail do pedido ${id} aceito pelo SMTP (aceitos ${info.accepted?.length ?? 0}, recusados ${info.rejected?.length ?? 0}) id=${info.messageId} resposta="${info.response}"`);
      pedidosStore.atualizar(id, (x) => { x.email = { situacao: 'aceito pelo servidor', resposta: info.response, messageId: info.messageId }; });
      return { enviado: true };
    } catch (err) {
      console.error(`formulario: e-mail do pedido ${id} falhou`, err.message);
      pedidosStore.atualizar(id, (x) => { x.email = { situacao: 'falhou', erro: String(err.response || err.message).slice(0, 300) }; });
      return { enviado: false, erro: true };
    }
  }

  // ---------------------------------------------------------- formulário público
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

  // Cliente já cadastrado no Bitrix? Responde só se existe — nada além disso.
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

  // O pedido é SALVO primeiro (com os anexos) e depois enviado ao Bitrix24. Se o Bitrix falhar,
  // o pedido continua no painel e o administrativo reenvia — o vendedor não precisa refazer.
  api.post('/pedidos', express.json({ limit: '80mb' }), async (req, res) => {
    const ip = req.ip;
    const t = tentativas.get(ip);
    const agora = Date.now();
    if (t && agora - t.since < 60_000 && t.count >= 10) return res.status(429).json({ erro: 'Muitos envios seguidos. Aguarde um minuto.' });
    tentativas.set(ip, !t || agora - t.since >= 60_000 ? { count: 1, since: agora } : { ...t, count: t.count + 1 });

    const pedido = req.body?.pedido;
    const envioId = String(req.body?.envioId || '');
    if (!pedido || !/^[\w-]{8,64}$/.test(envioId)) return res.status(400).json({ erro: 'Pedido inválido.' });
    const { erros, calculo } = validarPedido(catalogStore.get(), pedido);
    if (erros.length) return res.status(422).json({ erro: 'Há campos com problema.', erros });

    // Aditivo só para cliente já cadastrado no Bitrix24. Se o Bitrix estiver fora, o pedido segue e fica salvo.
    if (pedido.tipoPedido === 'aditivo' && !envios.has(envioId)) {
      const c = pedido.cliente;
      try {
        const achado = await buscarCliente(bitrixClient, { tipo: c.tipo, doc: c.tipo === 'PF' ? c.pf.cpf : c.pj.cnpj });
        if (!achado.contactId && !achado.companyId) {
          return res.status(422).json({ erro: 'Cliente do aditivo não encontrado no Bitrix24.', erros: [{ campo: 'clienteBitrix', mensagem: 'Cliente não encontrado no Bitrix24 com esse documento. Confira o CPF/CNPJ ou faça como contrato novo.' }] });
        }
      } catch (err) {
        console.error('formulario: busca do cliente do aditivo falhou', err.message);
      }
    }

    if (!envios.has(envioId)) {
      envios.set(envioId, (async () => {
        const id = novoPedidoId(now);
        pedidosStore.criar({ id, envioId, pedido, calculo });
        const bitrix = await enviarAoBitrix(id);
        const email = await enviarEmailResumo(id);
        return { pedidoId: id, bitrix, email };
      })());
    }
    try {
      const r = await envios.get(envioId);
      res.json({ ok: true, pedidoId: r.pedidoId, cards: r.bitrix.cards || [], bitrixFalhou: !r.bitrix.ok, email: r.email });
    } catch (err) {
      envios.delete(envioId);
      console.error('formulario: falha ao salvar o pedido', err);
      res.status(500).json({ erro: 'Não foi possível salvar o pedido agora. Seus dados continuam na tela; tente enviar de novo em instantes.' });
    }
  });

  router.use('/api', api);

  // ---------------------------------------------------------- painel (login próprio, perfis admin e operador)
  const admin = express.Router();

  function sessaoUsuario(req) {
    const token = parseCookies(req.get('cookie'))[ADMIN_COOKIE];
    const s = token && adminSessions.get(token);
    if (!s || s.expires < Date.now()) { if (token) adminSessions.delete(token); return null; }
    // Relê a cada request: usuário removido, rebaixado ou com senha redefinida perde o acesso na hora.
    const u = userStore.get(s.username);
    return u && PERFIS_PAINEL.includes(u.role) && !u.mustChangePassword ? u : null;
  }

  const exigir = (...perfis) => (req, res, next) => (perfis.includes(req.usuario.role) ? next() : res.status(403).json({ erro: 'Seu perfil não tem acesso a esta área.' }));

  admin.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));

  // Login. Se a senha precisa ser trocada (1º acesso ou redefinida), exige "novaSenha" no mesmo passo.
  admin.post('/login', express.json(), (req, res) => {
    const chave = `${req.ip}|${String(req.body?.usuario || '').toLowerCase()}`;
    const f = falhasLogin.get(chave);
    if (f && Date.now() - f.since < 15 * 60_000 && f.count >= 10) return res.status(429).json({ erro: 'Muitas tentativas. Aguarde 15 minutos.' });
    const u = userStore.authenticate(req.body?.usuario, req.body?.senha);
    if (!u) {
      falhasLogin.set(chave, !f || Date.now() - f.since >= 15 * 60_000 ? { count: 1, since: Date.now() } : { ...f, count: f.count + 1 });
      return res.status(401).json({ erro: 'Usuário ou senha incorretos.' });
    }
    falhasLogin.delete(chave);
    if (!PERFIS_PAINEL.includes(u.role)) return res.status(403).json({ erro: 'Seu usuário não tem acesso a este painel.' });
    if (u.mustChangePassword) {
      if (!req.body?.novaSenha) return res.status(409).json({ trocarSenha: true, erro: 'Defina uma senha nova para continuar.' });
      try { userStore.changePassword(u.username, req.body.senha, req.body.novaSenha); } catch (err) { return res.status(400).json({ trocarSenha: true, erro: err.message }); }
    }
    const token = crypto.randomBytes(32).toString('hex');
    adminSessions.set(token, { username: u.username, expires: Date.now() + ADMIN_TTL_MS });
    res.append('Set-Cookie', `${ADMIN_COOKIE}=${token}; Path=/formulario/admin; HttpOnly; SameSite=Strict; Max-Age=${ADMIN_TTL_MS / 1000}${secureFlag(req)}`);
    res.json({ ok: true, usuario: u.username, perfil: u.role });
  });

  admin.post('/sair', (req, res) => {
    adminSessions.delete(parseCookies(req.get('cookie'))[ADMIN_COOKIE]);
    res.append('Set-Cookie', `${ADMIN_COOKIE}=; Path=/formulario/admin; Max-Age=0`);
    res.json({ ok: true });
  });

  admin.use('/api', (req, res, next) => {
    const u = sessaoUsuario(req);
    if (!u) return res.status(401).json({ erro: 'Entre novamente.' });
    req.usuario = u;
    next();
  });

  admin.get('/api/me', (req, res) => res.json({ usuario: req.usuario.username, perfil: req.usuario.role, status: STATUS }));

  admin.post('/api/senha', express.json(), (req, res) => {
    try {
      userStore.changePassword(req.usuario.username, req.body?.atual, req.body?.nova);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ erro: err.message });
    }
  });

  // ----- pedidos (admin e operador)
  admin.get('/api/pedidos', exigir('admin', 'operador'), (req, res) => res.json({ pedidos: pedidosStore.listar() }));

  admin.get('/api/pedidos/:id', exigir('admin', 'operador'), (req, res) => {
    let r;
    try { r = pedidosStore.obter(req.params.id); } catch { r = null; }
    if (!r) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    res.json({ pedido: r, resumo: montarResumo(r.pedido, r.calculo), status: STATUS });
  });

  admin.get('/api/pedidos/:id/anexos/:arquivo', exigir('admin', 'operador'), (req, res) => {
    let a;
    try { a = pedidosStore.caminhoAnexo(req.params.id, req.params.arquivo); } catch { a = null; }
    if (!a) return res.status(404).send('Anexo não encontrado.');
    res.download(a.caminho, a.nome);
  });

  admin.patch('/api/pedidos/:id', exigir('admin', 'operador'), express.json(), (req, res) => {
    const { status, observacao } = req.body || {};
    if (status && !STATUS.includes(status)) return res.status(400).json({ erro: 'Status inválido.' });
    const texto = String(observacao || '').trim().slice(0, 2000);
    try {
      const r = pedidosStore.atualizar(req.params.id, (x) => {
        const quando = now().toISOString();
        if (status && status !== x.status) {
          x.historico.push({ quando, usuario: req.usuario.username, acao: `Status: ${x.status} → ${status}` });
          x.status = status;
        }
        if (texto) x.observacoes.push({ quando, usuario: req.usuario.username, texto });
      });
      res.json({ ok: true, pedido: r });
    } catch (err) {
      res.status(404).json({ erro: err.message });
    }
  });

  // Reenvia ao Bitrix24 um pedido que falhou. Se já houver cards parciais, exige confirmação
  // (apagá-los antes no Bitrix evita card duplicado).
  admin.post('/api/pedidos/:id/reenviar', exigir('admin', 'operador'), express.json(), async (req, res) => {
    let r;
    try { r = pedidosStore.obter(req.params.id); } catch { r = null; }
    if (!r) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    if (r.bitrix.situacao === 'enviado') return res.status(409).json({ erro: 'Este pedido já está no Bitrix24.' });
    if (r.bitrix.situacao === 'enviando') return res.status(409).json({ erro: 'O envio deste pedido está em andamento.' });
    if (r.bitrix.cards.length && !req.body?.confirmar) {
      return res.status(409).json({ parcial: true, cards: r.bitrix.cards, erro: 'Já existem cards criados por uma tentativa anterior. Apague-os no Bitrix24 antes de reenviar, ou confirme para criar todos de novo.' });
    }
    pedidosStore.atualizar(r.id, (x) => { x.bitrix.cards = []; });
    const resultado = await enviarAoBitrix(r.id, { usuario: req.usuario.username });
    res.status(resultado.ok ? 200 : 502).json(resultado.ok ? { ok: true, cards: resultado.cards } : { erro: `O Bitrix24 recusou de novo: ${resultado.erro}` });
  });

  admin.post('/api/pedidos/:id/reenviar-email', exigir('admin', 'operador'), async (req, res) => {
    let r;
    try { r = pedidosStore.obter(req.params.id); } catch { r = null; }
    if (!r) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    const e = await enviarEmailResumo(r.id);
    pedidosStore.registrar(r.id, req.usuario.username, e.enviado ? 'E-mail do resumo reenviado' : 'Falha ao reenviar o e-mail do resumo');
    res.status(e.enviado ? 200 : 502).json(e.enviado ? { ok: true } : { erro: 'O e-mail não foi aceito pelo servidor. Veja a configuração SMTP.' });
  });

  // ----- catálogo (só admin)
  let cacheProdutos = null;
  admin.get('/api/produtos-bitrix', exigir('admin'), async (req, res) => {
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

  admin.post('/api/testar-email', exigir('admin'), express.json(), async (req, res) => {
    const para = String(req.body?.para || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(para)) return res.status(400).json({ erro: 'Informe um e-mail válido.' });
    if (!mailer.enabled) return res.status(400).json({ erro: 'E-mail desligado: configure SMTP_HOST no Easypanel.' });
    try {
      const r = await mailer.send({
        to: para,
        subject: 'Teste do Formulário de Pedidos',
        text: 'Este é um e-mail de teste do Formulário de Pedidos. Se você recebeu, o envio está funcionando.',
        html: emailHtml({ titulo: 'E-mail de teste', introducao: 'Este é um e-mail de teste do <b>Formulário de Pedidos</b>. Se você recebeu, o envio está funcionando.', secoes: [] }),
      });
      console.log(`formulario: e-mail de teste aceito pelo SMTP id=${r.messageId} resposta="${r.response}"`);
      res.json({ ok: true, aceitos: r.accepted?.length ?? 0, recusados: r.rejected?.length ?? 0, resposta: r.response, id: r.messageId });
    } catch (err) {
      console.error('formulario: e-mail de teste falhou', err.message);
      res.status(502).json({ erro: `O servidor de e-mail recusou: ${err.response || err.message}` });
    }
  });

  admin.get('/api/catalogo', exigir('admin'), (req, res) => res.json({ usuario: req.usuario.username, catalogo: catalogStore.get(), historico: catalogStore.history() }));
  admin.put('/api/catalogo', exigir('admin'), express.json({ limit: '2mb' }), (req, res) => {
    try {
      const salvo = catalogStore.save(req.body?.catalogo, { usuario: req.usuario.username });
      res.json({ ok: true, catalogo: salvo, historico: catalogStore.history() });
    } catch (err) {
      res.status(400).json({ erro: err.message });
    }
  });

  // ----- usuários (só admin)
  admin.get('/api/usuarios', exigir('admin'), (req, res) => res.json({ usuarios: userStore.list() }));
  const acaoUsuario = (fn) => (req, res) => {
    try {
      fn(req);
      res.json({ ok: true, usuarios: userStore.list() });
    } catch (err) {
      res.status(400).json({ erro: err.message });
    }
  };
  admin.post('/api/usuarios', exigir('admin'), express.json(), acaoUsuario((req) => {
    if (!PERFIS_PAINEL.includes(req.body?.perfil)) throw new Error('Escolha o perfil Administrador ou Operador.');
    userStore.create({ username: req.body?.usuario, password: req.body?.senha, role: req.body.perfil });
  }));
  admin.post('/api/usuarios/:u/senha', exigir('admin'), express.json(), acaoUsuario((req) => userStore.resetPassword(req.params.u, req.body?.senha)));
  admin.post('/api/usuarios/:u/perfil', exigir('admin'), express.json(), acaoUsuario((req) => {
    if (!PERFIS_PAINEL.includes(req.body?.perfil)) throw new Error('Perfil inválido.');
    userStore.setRole(req.params.u, req.body.perfil);
  }));
  admin.delete('/api/usuarios/:u', exigir('admin'), acaoUsuario((req) => {
    if (String(req.params.u).toLowerCase() === req.usuario.username) throw new Error('Você não pode remover o próprio usuário.');
    userStore.remove(req.params.u);
  }));

  router.use('/admin', admin);
  return router;
}

export { resumir };
