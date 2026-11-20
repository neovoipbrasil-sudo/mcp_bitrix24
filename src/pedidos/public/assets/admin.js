import { brl } from '/formulario/shared/pricing.js';
import { criarTelaPedidos, criarTelaUsuarios, criarTelaSenha } from '/formulario/assets/painel.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const get = (o, p) => p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
function set(o, p, v) { const ks = p.split('.'); let x = o; ks.slice(0, -1).forEach((k) => { if (x[k] == null) x[k] = {}; x = x[k]; }); x[ks.at(-1)] = v; }

let cat = null;
let historico = [];
let usuario = '';
let aba = 'pedidos';
let perfil = '';
let telas = {};
let alterado = false;
let status = '';
let produtosBitrix = null; // [{ id, nome, preco }] do catálogo do Bitrix24
const produtoCol = (k, t = 'Produto no Bitrix') => ({ k, t, tipo: 'produto' });

const tiposOpcoes = () => cat.tiposVox.map((t) => ({ valor: t.id, texto: t.nome }));

// Definição das tabelas editáveis: lista (caminho no catálogo) + colunas.
const TABELAS = {
  tipos: { titulo: 'Tipos de plano Neo Vox', lista: 'tiposVox', novo: () => ({ id: '', nome: '', categoria: 'ilimitado', somenteRevenda: false, ativo: true }),
    ajuda: 'Categoria Ilimitado e Pós: o plano é escolhido sozinho pela fidelidade e pela quantidade de linhas. Pré: o vendedor escolhe o plano.',
    colunas: [{ k: 'id', t: 'Código', tipo: 'text' }, { k: 'nome', t: 'Nome', tipo: 'text' },
      { k: 'categoria', t: 'Categoria', tipo: 'select', opcoes: () => [{ valor: 'ilimitado', texto: 'Ilimitado' }, { valor: 'pos', texto: 'Pós (tarifado)' }, { valor: 'pre', texto: 'Pré (recarga)' }] },
      { k: 'somenteRevenda', t: 'Só revendas', tipo: 'bool' }, { k: 'ativo', t: 'Ativo', tipo: 'bool' }] },
  vox: { titulo: 'Planos Neo Vox', lista: 'planosVox', novo: () => ({ id: '', tipo: cat.tiposVox[0]?.id, nome: '', fidelidade: 12, minLinhas: 1, maxLinhas: null, precoCheio: 0, ativo: true }),
    ajuda: 'Informe só o preço cheio por linha: o preço com desconto é calculado pelo desconto das Regras. Planos Pré não têm desconto nem fidelidade. "Máx. linhas" vazio = sem limite.',
    colunas: [{ k: 'id', t: 'Código', tipo: 'text' }, { k: 'tipo', t: 'Tipo', tipo: 'select', opcoes: tiposOpcoes }, { k: 'nome', t: 'Nome', tipo: 'text' },
      { k: 'fidelidade', t: 'Fidelidade (meses)', tipo: 'number', vazioNull: true }, { k: 'minLinhas', t: 'Mín. linhas', tipo: 'number' }, { k: 'maxLinhas', t: 'Máx. linhas', tipo: 'number', vazioNull: true },
      { k: 'precoCheio', t: 'Preço cheio (R$)', tipo: 'number' }, { k: '_desc', t: 'Com desconto', tipo: 'calc', calc: (r) => (cat.tiposVox.find((t) => t.id === r.tipo)?.categoria === 'pre' ? brl(r.precoCheio) : brl(r.precoCheio * (1 - cat.regras.descontoPercent / 100))) },
      { k: 'tarifas.fixoLocal', t: 'Fixo local', tipo: 'number', opcional: true }, { k: 'tarifas.fixoLDN', t: 'Fixo LDN', tipo: 'number', opcional: true },
      { k: 'tarifas.movelLocal', t: 'Móvel local', tipo: 'number', opcional: true }, { k: 'tarifas.movelLDN', t: 'Móvel LDN', tipo: 'number', opcional: true },
      { k: 'tarifas.local', t: 'Pré: local', tipo: 'number', opcional: true }, { k: 'tarifas.ldn', t: 'Pré: LDN', tipo: 'number', opcional: true }, { k: 'tarifas.vc', t: 'Pré: VC', tipo: 'number', opcional: true },
      produtoCol('bitrixProdutoId'), { k: 'ativo', t: 'Ativo', tipo: 'bool' }] },
  phone: { titulo: 'Licenças Neo Phone (preço cheio por ramal)', lista: 'licencasPhone', novo: () => ({ id: '', nome: '', precos: { 12: 0, 24: 0, 36: 0 }, incluiGravacao: false, callCenter: false, ativo: true }),
    colunas: [{ k: 'id', t: 'Código', tipo: 'text' }, { k: 'nome', t: 'Nome', tipo: 'text' }, { k: 'precos.12', t: '12 meses', tipo: 'number' }, { k: 'precos.24', t: '24 meses', tipo: 'number' }, { k: 'precos.36', t: '36 meses', tipo: 'number' },
      { k: 'incluiGravacao', t: 'Inclui gravação 90 dias', tipo: 'bool' }, { k: 'callCenter', t: 'Call center (conta p/ Grupo CC)', tipo: 'bool' },
      produtoCol('bitrixProdutoIds.12', 'Produto Bitrix 12m'), produtoCol('bitrixProdutoIds.24', 'Produto Bitrix 24m'), produtoCol('bitrixProdutoIds.36', 'Produto Bitrix 36m'), { k: 'ativo', t: 'Ativo', tipo: 'bool' }] },
  gravacao: { titulo: 'Pacotes de gravação de chamadas', lista: 'gravacao', novo: () => ({ id: '', nome: '', preco: 0, ativo: true }),
    colunas: [{ k: 'id', t: 'Código', tipo: 'text' }, { k: 'nome', t: 'Nome', tipo: 'text' }, { k: 'preco', t: 'Preço por pacote (R$)', tipo: 'number' }, produtoCol('bitrixProdutoId'), { k: 'ativo', t: 'Ativo', tipo: 'bool' }] },
  especiais: { titulo: 'Preços especiais por revenda', lista: 'precosEspeciais', novo: () => ({ revendaCnpj: '', planoId: '', preco: 0, observacao: '' }),
    ajuda: 'Substitui o preço cheio do plano quando o pedido vem desta revenda.',
    colunas: [{ k: 'revendaCnpj', t: 'Revenda', tipo: 'select', opcoes: () => cat.revendas.map((r) => ({ valor: r.cnpj, texto: r.nome })) },
      { k: 'planoId', t: 'Plano', tipo: 'select', opcoes: () => cat.planosVox.map((p) => ({ valor: p.id, texto: p.nome })) }, { k: 'preco', t: 'Preço (R$)', tipo: 'number' }, { k: 'observacao', t: 'Observação', tipo: 'text' }], removivel: true },
  vendedores: { titulo: 'Vendedores (Connect)', lista: 'vendedores', novo: () => ({ id: `v${Date.now()}`, nome: '', email: '', celular: '', bitrixUserId: '', ativo: true }),
    ajuda: 'O ID do Bitrix é o usuário que fica como responsável do card (pipeline Vendas Diretas).',
    colunas: [{ k: 'nome', t: 'Nome', tipo: 'text' }, { k: 'email', t: 'E-mail', tipo: 'text' }, { k: 'celular', t: 'Celular (55DDD9XXXXXXXX)', tipo: 'text' }, { k: 'bitrixUserId', t: 'ID no Bitrix', tipo: 'number' }, { k: 'ativo', t: 'Ativo', tipo: 'bool' }] },
  revendas: { titulo: 'Revendas', lista: 'revendas', novo: () => ({ id: `r${Date.now()}`, nome: '', cnpj: '', email: '', celular: '', responsavelNome: '', bitrixUserId: '', ativo: true }),
    ajuda: 'O ID do Bitrix é o responsável do card no pipeline Revendas.',
    colunas: [{ k: 'nome', t: 'Nome da revenda', tipo: 'text' }, { k: 'cnpj', t: 'CNPJ (só números)', tipo: 'text' }, { k: 'email', t: 'E-mail', tipo: 'text' }, { k: 'celular', t: 'Celular', tipo: 'text' },
      { k: 'responsavelNome', t: 'Responsável no Bitrix', tipo: 'text' }, { k: 'bitrixUserId', t: 'ID no Bitrix', tipo: 'number' }, { k: 'ativo', t: 'Ativo', tipo: 'bool' }] },
};

const ABAS_CATALOGO = [['vox', 'Planos Neo Vox'], ['tipos', 'Tipos de plano'], ['phone', 'Neo Phone'], ['gravacao', 'Gravação'], ['adicionais', 'Adicionais e regras'], ['especiais', 'Preços especiais'], ['vendedores', 'Vendedores'], ['revendas', 'Revendas'], ['historico', 'Histórico do catálogo']];
const MODULOS = ['pedidos', 'usuarios', 'senha'];
const abas = () => [['pedidos', 'Pedidos'], ...(perfil === 'admin' ? [...ABAS_CATALOGO, ['usuarios', 'Usuários']] : []), ['senha', 'Minha senha']];

function seletorProduto(attr, v) {
  const lista = produtosBitrix || [];
  const atual = Number(v) || '';
  const conhecido = !atual || lista.some((p) => p.id === atual);
  return `<select ${attr} data-produto="1"><option value="">— sem produto (só nome e preço) —</option>
    ${conhecido ? '' : `<option value="${atual}" selected>#${atual} (não encontrado/inativo)</option>`}
    ${lista.map((p) => `<option value="${p.id}" ${p.id === atual ? 'selected' : ''}>${esc(p.nome)} (#${p.id})</option>`).join('')}</select>`;
}

function celula(c, row, i) {
  const v = get(row, c.k);
  const attr = `data-i="${i}" data-k="${c.k}" data-tipo="${c.tipo}" ${c.vazioNull || c.opcional ? 'data-null="1"' : ''}`;
  if (c.tipo === 'bool') return `<input type="checkbox" ${attr} ${v ? 'checked' : ''}>`;
  if (c.tipo === 'select') return `<select ${attr}>${c.opcoes().map((o) => `<option value="${esc(o.valor)}" ${String(o.valor) === String(v) ? 'selected' : ''}>${esc(o.texto)}</option>`).join('')}</select>`;
  if (c.tipo === 'produto') return seletorProduto(attr, v);
  if (c.tipo === 'calc') return `<span>${esc(c.calc(row))}</span>`;
  return `<input ${attr} type="${c.tipo === 'number' ? 'number' : 'text'}" step="any" value="${esc(v ?? '')}">`;
}

function tabela(id) {
  const d = TABELAS[id];
  const linhas = get(cat, d.lista);
  return `<h2 class="titulo">${esc(d.titulo)}</h2>${d.ajuda ? `<p class="sub">${esc(d.ajuda)}</p>` : ''}
  <div class="rolavel"><table class="ed" data-lista="${d.lista}"><thead><tr>${d.colunas.map((c) => `<th>${esc(c.t)}</th>`).join('')}${d.removivel ? '<th></th>' : ''}</tr></thead>
  <tbody>${linhas.map((r, i) => `<tr class="${r.ativo === false ? 'inativo' : ''}">${d.colunas.map((c) => `<td>${celula(c, r, i)}</td>`).join('')}${d.removivel ? `<td><button class="mini perigo" data-rem="${i}">Remover</button></td>` : ''}</tr>`).join('')}</tbody></table></div>
  <p><button class="mini" data-novo="${id}">+ Adicionar</button> ${d.removivel ? '' : '<span class="ajuda">Itens não são apagados: desmarque "Ativo" para tirar do formulário.</span>'}</p>
  ${id === 'vendedores' || id === 'revendas' ? `<h3>Importar planilha (CSV)</h3>
  <p class="ajuda">${id === 'vendedores' ? 'Colunas: NOME;E-MAIL;CELULAR;ID' : 'Colunas: NOME;CNPJ;ID DO RESPONSÁVEL;NOME DO RESPONSÁVEL;E-MAIL;CELULAR'} (separadas por ponto e vírgula, com cabeçalho). Quem já existe (mesmo e-mail ou CNPJ) é atualizado; os novos são adicionados. Depois clique em "Salvar alterações".</p>
  <input type="file" accept=".csv,text/csv" data-importar="${id}">` : ''}`;
}

// Lê o CSV exportado do Excel (";" e cabeçalho) e junta com a lista atual.
function importarCsv(id, texto) {
  const linhas = texto.replace(/^﻿/, '').split(/\r?\n/).map((l) => l.split(';').map((x) => x.trim()));
  const cab = (linhas.shift() || []).map((h) => h.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase());
  const col = (nome) => cab.indexOf(nome);
  const lista = get(cat, TABELAS[id].lista);
  let novos = 0;
  let atualizados = 0;
  for (const l of linhas) {
    const v = (nome) => (col(nome) >= 0 ? l[col(nome)] || '' : '');
    if (!v('NOME')) continue;
    const item = id === 'vendedores'
      ? { nome: v('NOME'), email: v('E-MAIL'), celular: v('CELULAR').replace(/\D/g, ''), bitrixUserId: Number(v('ID')) || '' }
      : { nome: v('NOME'), cnpj: v('CNPJ').replace(/\D/g, ''), email: v('E-MAIL'), celular: v('CELULAR').replace(/\D/g, ''),
          responsavelNome: v('NOME DO RESPONSAVEL'), bitrixUserId: Number(v('ID DO RESPONSAVEL')) || '' };
    const chave = id === 'vendedores' ? 'email' : 'cnpj';
    const existente = lista.find((x) => item[chave] && String(x[chave]).toLowerCase() === String(item[chave]).toLowerCase());
    if (existente) { Object.assign(existente, item, { ativo: true }); atualizados++; } else {
      lista.push({ id: `${id[0]}${Date.now().toString(36)}${novos}`, ...item, ativo: true }); novos++;
    }
  }
  status = `${novos} adicionado(s), ${atualizados} atualizado(s). Confira e clique em Salvar.`;
  alterado = true;
  render();
}

function regras() {
  const r = cat.regras;
  const n = (path, label, ajuda = '') => `<div class="campo"><label>${esc(label)}</label><input type="number" step="any" data-cfg="${path}" value="${esc(get(cat, path) ?? '')}">${ajuda ? `<span class="ajuda">${esc(ajuda)}</span>` : ''}</div>`;
  const t = (path, label, ajuda = '') => `<div class="campo"><label>${esc(label)}</label><input data-cfg="${path}" data-cfg-tipo="text" value="${esc(get(cat, path) ?? '')}">${ajuda ? `<span class="ajuda">${esc(ajuda)}</span>` : ''}</div>`;
  const lista = (path, label, ajuda = '') => `<div class="campo"><label>${esc(label)}</label><input data-cfg="${path}" data-cfg-tipo="lista" value="${esc((get(cat, path) || []).join(', '))}">${ajuda ? `<span class="ajuda">${esc(ajuda)}</span>` : ''}</div>`;
  const link = r.chaveAcesso ? `${location.origin}/formulario/?k=${encodeURIComponent(r.chaveAcesso)}` : `${location.origin}/formulario/`;
  return `<h2 class="titulo">Adicionais e regras gerais</h2>
  <h3>Regras</h3><div class="regras">
    ${n('regras.descontoPercent', 'Desconto fixo (%)', 'Aplicado nas mensalidades de Neo Vox (Ilimitado e Pós) e Neo Phone.')}
    ${n('regras.minRamais', 'Mínimo de ramais (Neo Phone)')}
    ${n('regras.limiteStandardSemGrupoCallCenter', 'Grupo Call Center obrigatório acima de (licenças Standard)')}
    ${n('regras.instalacao.remota', 'Instalação remota (R$)')}
    ${n('regras.instalacao.presencial', 'Instalação presencial (R$)')}
    ${n('regras.cfop.ddd', 'DDD da sede (CFOP interno)')}
    ${t('regras.cfop.noDdd', 'CFOP no mesmo DDD')}
    ${t('regras.cfop.outros', 'CFOP outros DDDs')}
    ${lista('regras.vencimentos', 'Dias de vencimento', 'Separados por vírgula.')}
    ${lista('regras.operadoras', 'Operadoras (portabilidade)', 'Separadas por vírgula. "Outra" é sempre incluída.')}
  </div>
  <h3>Serviços adicionais</h3><div class="regras">
    ${n('ativacao.pre', 'Ativação por linha – planos Pré (R$)')}
    ${n('ativacao.pos', 'Ativação por linha – planos Pós/tarifados (R$)')}
    ${n('ativacao.ilimitado', 'Ativação por linha – planos Ilimitados (R$)')}
    ${n('numeroAdicional.12', 'Número adicional – 12 meses (R$)')}
    ${n('numeroAdicional.24', 'Número adicional – 24 meses (R$)')}
    ${n('numeroAdicional.36', 'Número adicional – 36 meses (R$)')}
    ${n('numeroAdicional.semFidelidade', 'Número adicional – Pré (R$)')}
    ${n('portabilidade.precoPorNumero', 'Portabilidade por número (R$)')}
    ${n('discador.preco', 'Discador automático mensal (R$)')}
    ${n('grupoCallCenter.preco', 'Grupo Call Center mensal (R$)')}
  </div>
  <div class="campo"><label>Portabilidade é cobrada</label><select data-cfg="portabilidade.cobranca" data-cfg-tipo="text">
    <option value="unica" ${cat.portabilidade.cobranca === 'unica' ? 'selected' : ''}>Uma vez (na adesão)</option>
    <option value="mensal" ${cat.portabilidade.cobranca === 'mensal' ? 'selected' : ''}>Todo mês</option></select></div>
  <h3>Produtos do Bitrix para os serviços</h3>
  <p class="ajuda">Cada card recebe linhas na aba "Produtos" ligadas a estes itens do catálogo do Bitrix. O preço usado é sempre o do formulário.</p>
  <div class="regras">${[['numeroAdicional', 'Número adicional (DID/DDR)'], ['ativacao', 'Ativação de linhas'], ['portabilidade', 'Portabilidade'], ['discador', 'Discador automático'], ['grupoCallCenter', 'Grupo Call Center'], ['instalacaoRemota', 'Instalação remota'], ['instalacaoPresencial', 'Instalação presencial']]
    .map(([k, t]) => `<div class="campo"><label>${esc(t)}</label>${seletorProduto(`data-cfg="produtosBitrix.${k}" data-cfg-tipo="produto"`, get(cat, `produtosBitrix.${k}`))}</div>`).join('')}</div>
  <p><button class="mini" id="atualizar-produtos">Recarregar produtos do Bitrix</button> <span class="ajuda">${produtosBitrix ? `${produtosBitrix.length} produtos ativos carregados.` : 'Carregando produtos…'}</span></p>
  <h3>Testar o envio de e-mail</h3>
  <p class="ajuda">Envia um e-mail de teste pela caixa configurada no servidor e mostra a resposta do servidor de e-mail.</p>
  <div class="linha"><div class="campo"><label>Enviar para</label><input id="email-teste" type="email" placeholder="nome@empresa.com.br"></div>
  <div class="campo"><label>&nbsp;</label><button class="mini" id="enviar-teste">Enviar e-mail de teste</button></div></div>
  <p class="ajuda" id="resultado-teste"></p>
  <h3>Acesso ao formulário</h3>
  ${t('regras.chaveAcesso', 'Chave de acesso', 'Se preenchida, o formulário só abre pelo link com a chave. Trocar a chave invalida o link antigo.')}
  <p class="ajuda">Link para enviar aos vendedores e revendas: <b>${esc(link)}</b></p>`;
}

function historicoHtml() {
  return `<h2 class="titulo">Histórico de alterações</h2>
  ${historico.length ? `<table class="tab"><thead><tr><th>Quando</th><th>Quem</th><th>Versão anterior</th></tr></thead><tbody>${historico.map((h) => `<tr><td>${esc(new Date(h.quando).toLocaleString('pt-BR'))}</td><td>${esc(h.usuario)}</td><td>${esc(h.versao)}</td></tr>`).join('')}</tbody></table>` : '<p class="sub">Nenhuma alteração ainda.</p>'}
  <p class="ajuda">Cada versão anterior completa fica guardada no servidor (pedidos-catalogo.historico.jsonl).</p>`;
}

function render() {
  if (!perfil) return;
  const modulo = MODULOS.includes(aba);
  if (!modulo && !cat) return;
  const corpo = modulo ? '' : aba === 'adicionais' ? regras() : aba === 'historico' ? historicoHtml() : tabela(aba);
  const catalogoAberto = !modulo;
  $('#app').innerHTML = `<div class="barra"><div class="abas">${abas().map(([id, t]) => `<button class="${aba === id ? 'ativa' : ''}" data-aba="${id}">${t}</button>`).join('')}</div>
    <div><span class="status">${esc(catalogoAberto ? status : '')}</span> ${catalogoAberto ? `<button class="pri" id="salvar" ${alterado ? '' : 'disabled'}>Salvar alterações</button>` : ''} <button class="sec" id="sair">Sair (${esc(usuario)} · ${perfil === 'admin' ? 'administrador' : 'operador'})</button></div></div>
  <div class="caixa" id="modulo">${corpo}</div>`;
  if (modulo) telas[aba].montar($('#modulo'));
}

function marcar() { alterado = true; status = 'Alterações não salvas.'; const b = $('#salvar'); if (b) b.disabled = false; const st = $('.status'); if (st) st.textContent = status; }

function lerValor(el) {
  const tipo = el.dataset.tipo || el.dataset.cfgTipo;
  if (el.type === 'checkbox') return el.checked;
  if (tipo === 'lista') return el.value.split(',').map((x) => x.trim()).filter(Boolean).map((x) => (/^\d+$/.test(x) && el.dataset.cfg === 'regras.vencimentos' ? Number(x) : x));
  if (tipo === 'produto') return el.value ? Number(el.value) : null;
  if (tipo === 'text' || tipo === 'select') return el.value;
  if (el.value === '' && el.dataset.null) return null;
  return el.value === '' ? 0 : Number(el.value);
}

function onChange(ev) {
  const el = ev.target;
  if (el.dataset.importar) {
    const f = el.files?.[0];
    if (!f) return;
    const r = new FileReader();
    // Excel no Brasil costuma salvar CSV em Windows-1252; se vier UTF-8 com BOM, também funciona.
    r.onload = () => {
      const buf = new Uint8Array(r.result);
      let texto = new TextDecoder('utf-8').decode(buf);
      if (texto.includes('�')) texto = new TextDecoder('windows-1252').decode(buf);
      importarCsv(el.dataset.importar, texto);
    };
    r.readAsArrayBuffer(f);
    return;
  }
  if (el.dataset.cfg) { set(cat, el.dataset.cfg, lerValor(el)); marcar(); return; }
  const tabelaEl = el.closest('table.ed');
  if (!tabelaEl || el.dataset.i == null) return;
  const row = get(cat, tabelaEl.dataset.lista)[Number(el.dataset.i)];
  const v = lerValor(el);
  if (v === null && el.dataset.k.startsWith('tarifas.')) {
    const k = el.dataset.k.split('.')[1];
    if (row.tarifas) delete row.tarifas[k];
  } else set(row, el.dataset.k, v);
  marcar();
  if (el.type === 'checkbox' || el.tagName === 'SELECT' || el.dataset.k === 'precoCheio') render();
}

async function salvar() {
  status = 'Salvando…';
  render();
  const r = await fetch('/formulario/admin/api/catalogo', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ catalogo: cat }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { status = `Não salvou: ${d.erro || r.status}`; render(); return; }
  cat = d.catalogo; historico = d.historico; alterado = false; status = 'Salvo. O formulário já usa os novos valores.';
  render();
}

function login(erro = '', trocar = null) {
  perfil = '';
  $('#app').innerHTML = `<div class="login caixa"><h2 class="titulo">${trocar ? 'Defina sua senha' : 'Entrar'}</h2>
  <p class="sub">${trocar ? 'Primeiro acesso ou senha redefinida: escolha uma senha nova (mínimo 8 caracteres).' : 'Painel de pedidos do formulário.'}</p>
  ${erro ? `<div class="aviso ${trocar ? 'alerta' : 'erro'}">${esc(erro)}</div>` : ''}
  <form id="login"><div class="campo"><label>Usuário</label><input name="usuario" autocomplete="username" required value="${esc(trocar?.usuario || '')}"></div>
  <div class="campo"><label>Senha${trocar ? ' atual' : ''}</label><input name="senha" type="password" autocomplete="current-password" required></div>
  ${trocar ? '<div class="campo"><label>Nova senha</label><input name="novaSenha" type="password" autocomplete="new-password" required minlength="8"></div><div class="campo"><label>Repita a nova senha</label><input name="novaSenha2" type="password" autocomplete="new-password" required></div>' : ''}
  <button class="pri">${trocar ? 'Salvar senha e entrar' : 'Entrar'}</button></form></div>`;
  $('#login').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    if (trocar && f.get('novaSenha') !== f.get('novaSenha2')) return login('As duas senhas novas não são iguais.', { usuario: f.get('usuario') });
    const corpo = { usuario: f.get('usuario'), senha: f.get('senha'), ...(trocar ? { novaSenha: f.get('novaSenha') } : {}) };
    const r = await fetch('/formulario/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
    const d = await r.json().catch(() => ({}));
    if (r.status === 409 && d.trocarSenha) return login(d.erro, { usuario: f.get('usuario') });
    if (!r.ok) return login(d.erro || 'Não foi possível entrar.', trocar);
    carregar();
  });
}

async function carregarProdutos(atualizar = false) {
  try {
    const r = await fetch('/formulario/admin/api/produtos-bitrix' + (atualizar ? '?atualizar=1' : ''));
    const d = await r.json();
    if (!r.ok) throw new Error(d.erro);
    produtosBitrix = d.produtos;
  } catch (err) {
    status = `Produtos do Bitrix indisponíveis: ${err.message || 'erro'}`;
  }
  render();
}

async function carregar() {
  const me = await fetch('/formulario/admin/api/me');
  if (me.status === 401) return login();
  const m = await me.json();
  usuario = m.usuario;
  perfil = m.perfil;
  const sair = () => login('Sua sessão terminou. Entre de novo.');
  telas = { pedidos: criarTelaPedidos({ perfil, aoSair: sair }), usuarios: criarTelaUsuarios({ usuarioAtual: usuario, aoSair: sair }), senha: criarTelaSenha() };
  if (!abas().some(([id]) => id === aba)) aba = 'pedidos';
  render();
  if (perfil === 'admin') {
    const r = await fetch('/formulario/admin/api/catalogo');
    const d = await r.json();
    cat = d.catalogo; historico = d.historico;
    render();
    carregarProdutos();
  }
}

document.addEventListener('change', onChange);
document.addEventListener('click', async (ev) => {
  const t = ev.target;
  if (t.dataset.aba) {
    if (alterado && MODULOS.includes(t.dataset.aba) && !confirm('Há alterações do catálogo não salvas. Sair da aba mesmo assim? (elas continuam até você recarregar a página)')) return;
    aba = t.dataset.aba; render();
  }
  if (t.dataset.novo) { const d = TABELAS[t.dataset.novo]; get(cat, d.lista).push(d.novo()); marcar(); render(); }
  if (t.dataset.rem != null) { const d = TABELAS[aba]; get(cat, d.lista).splice(Number(t.dataset.rem), 1); marcar(); render(); }
  if (t.id === 'salvar') salvar();
  if (t.id === 'enviar-teste') {
    const out = $('#resultado-teste');
    out.textContent = 'Enviando…';
    const r = await fetch('/formulario/admin/api/testar-email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ para: $('#email-teste').value }) });
    const d = await r.json().catch(() => ({}));
    out.textContent = r.ok ? `Aceito pelo servidor de e-mail (${d.aceitos} aceito, ${d.recusados} recusado). Resposta: ${d.resposta}. Se não chegar em alguns minutos, olhe o spam e a caixa de saída/devoluções da conta de envio.` : `Falhou: ${d.erro || r.status}`;
  }
  if (t.id === 'atualizar-produtos') { produtosBitrix = null; render(); carregarProdutos(true); }
  if (t.id === 'sair') { await fetch('/formulario/admin/sair', { method: 'POST' }); cat = null; alterado = false; login(); }
});
window.addEventListener('beforeunload', (ev) => { if (alterado) { ev.preventDefault(); ev.returnValue = ''; } });

carregar();
