import { mask, onlyDigits, UFS, validateValue, isValidCNPJ, isValidCPF } from '/formulario/shared/validators.js';
import { calcularPedido, tiposVoxDisponiveis, resolverPlanoVox, brl, contarNumerosPortabilidade } from '/formulario/shared/pricing.js';
import { validarPedido, ARQ_MAX_BYTES } from '/formulario/shared/validate-order.js';
import { montarResumo } from '/formulario/shared/summary.js';

const RASCUNHO = 'formulario-pedidos-rascunho-v1';
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

let catalogo = null;
const avisos = {}; // mensagens contextuais por chave (ex.: busca de CNPJ)

function pessoaVazia() { return { nome: '', celular: '', email: '' }; }
function enderecoVazio() { return { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '' }; }
function novoPedido() {
  return {
    origem: { tipo: '', id: '', cnpj: '', nome: '', email: '', celular: '' },
    cliente: {
      tipo: '',
      pf: { nome: '', cpf: '', nascimento: '', celular: '', email: '', endereco: enderecoVazio() },
      pj: { cnpj: '', razaoSocial: '', nomeFantasia: '', dataFundacao: '', indicadorIE: '', inscricaoEstadual: '', inscricaoMunicipal: '', simples: '', retencaoISS: '',
        socios: [{ nome: '', cpf: '', nascimento: '', celular: '', email: '' }], endereco: enderecoVazio() },
      contatos: { gestor: pessoaVazia(), financeiro: pessoaVazia(), tecnico: pessoaVazia(), testemunha: { nome: '', email: '' } },
    },
    produtos: '',
    fidelidade: '',
    vox: { tipoId: '', linhas: '', planoPreId: '', ddd: '', adicionais: { quer: null, quantidade: '' } },
    querPortabilidade: null,
    portabilidades: [],
    phone: { licencas: {}, gravacao: { id: '90d', pacotes: '' }, discador: false, grupoCallCenter: false },
    conclusao: { vencimento: '', instalacao: '', observacoes: '', endereco: enderecoVazio() },
    arquivos: { documentos: [] },
  };
}
function novoBlocoPortabilidade() {
  return { cidade: '', uf: '', operadora: '', operadoraOutra: '', modo: 'lista', numeros: [''], faixa: { inicio: '', fim: '' },
    titular: { mesmoCliente: true, tipo: '', pf: { nome: '', cpf: '', celular: '', email: '' }, pj: { cnpj: '', razaoSocial: '', dataFundacao: '', indicadorIE: '', inscricaoEstadual: '', inscricaoMunicipal: '' } },
    tecnico: pessoaVazia(), fatura: [] };
}

const state = { pedido: novoPedido(), etapa: 0, erros: {}, envioId: uid(), enviando: false, resultado: null };

// ------------------------------------------------------------------ utilidades de caminho
function get(obj, p) { return p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); }
function set(obj, p, v) {
  const ks = p.split('.');
  let o = obj;
  ks.slice(0, -1).forEach((k, i) => { if (o[k] == null) o[k] = /^\d+$/.test(ks[i + 1]) ? [] : {}; o = o[k]; });
  o[ks[ks.length - 1]] = v;
}

// ------------------------------------------------------------------ rascunho (sem anexos)
function salvarRascunho() {
  try {
    const copia = JSON.parse(JSON.stringify(state.pedido));
    copia.arquivos = { documentos: [] };
    copia.portabilidades.forEach((b) => { b.fatura = []; });
    localStorage.setItem(RASCUNHO, JSON.stringify({ pedido: copia, etapa: state.etapa }));
  } catch { /* armazenamento indisponível */ }
}
function carregarRascunho() {
  try {
    const r = JSON.parse(localStorage.getItem(RASCUNHO) || 'null');
    if (r?.pedido) { state.pedido = { ...novoPedido(), ...r.pedido }; state.etapa = Number(r.etapa) || 0; return true; }
  } catch { /* ignora */ }
  return false;
}
function limparRascunho() { try { localStorage.removeItem(RASCUNHO); } catch { /* ignora */ } }

// ------------------------------------------------------------------ componentes
const TIPO_MASCARA = { cpf: mask.cpf, cnpj: mask.cnpj, phone: mask.phone, cep: mask.cep, date: mask.date, birth: mask.date };
const PLACEHOLDER = { cpf: '000.000.000-00', cnpj: '00.000.000/0000-00', phone: '+55 (61) 9 9999-9999', cep: '00000-000', date: 'DD/MM/AAAA', birth: 'DD/MM/AAAA', ddd: '61', email: 'nome@empresa.com.br' };

function erroDe(path) { return state.erros[path]; }

function campo({ path, label, tipo = 'text', opcional = false, ajuda = '', readonly = false, extra = '', inputmode = '' }) {
  const v = get(state.pedido, path) ?? '';
  const err = erroDe(path);
  const im = inputmode || ({ cpf: 'numeric', cnpj: 'numeric', phone: 'tel', cep: 'numeric', date: 'numeric', birth: 'numeric', ddd: 'numeric', int: 'numeric', email: 'email' }[tipo] || 'text');
  const id = 'f_' + path.replace(/\./g, '_');
  const tag = tipo === 'textarea'
    ? `<textarea id="${id}" data-path="${path}" data-tipo="${tipo}" ${opcional ? 'data-opcional="1"' : ''}>${esc(v)}</textarea>`
    : `<input id="${id}" data-path="${path}" data-tipo="${tipo}" ${opcional ? 'data-opcional="1"' : ''} value="${esc(v)}" inputmode="${im}" placeholder="${esc(PLACEHOLDER[tipo] || '')}" ${readonly ? 'readonly' : ''} ${extra}>`;
  return `<div class="campo${err ? ' erro' : ''}">
    <label for="${id}">${esc(label)}${opcional ? ' <span class="opc">(opcional)</span>' : ''}</label>
    ${tag}
    ${err ? `<span class="msg-erro" role="alert">${esc(err)}</span>` : ajuda ? `<span class="ajuda">${ajuda}</span>` : ''}
  </div>`;
}

function opcoes({ path, label, itens, rerender = true, tipoValor = 'texto' }) {
  const atual = get(state.pedido, path);
  const err = erroDe(path);
  const name = 'r_' + path.replace(/\./g, '_');
  return `<fieldset class="grupo${err ? ' erro' : ''}">
    <legend>${esc(label)}</legend>
    <div class="opcoes">${itens.map((it) => {
      const val = typeof it === 'object' ? it.valor : it;
      const txt = typeof it === 'object' ? it.texto : it;
      return `<label><input type="radio" name="${name}" data-path="${path}" data-valor-tipo="${tipoValor}" value="${esc(String(val))}" ${String(atual) === String(val) ? 'checked' : ''} ${rerender ? 'data-rerender="1"' : ''}> ${esc(txt)}</label>`;
    }).join('')}</div>
    ${err ? `<span class="msg-erro" role="alert">${esc(err)}</span>` : ''}
  </fieldset>`;
}

function selecao({ path, label, itens, rerender = false, vazio = 'Selecione…' }) {
  const atual = String(get(state.pedido, path) ?? '');
  const err = erroDe(path);
  const id = 'f_' + path.replace(/\./g, '_');
  return `<div class="campo${err ? ' erro' : ''}">
    <label for="${id}">${esc(label)}</label>
    <select id="${id}" data-path="${path}" ${rerender ? 'data-rerender="1"' : ''}>
      <option value="">${esc(vazio)}</option>
      ${itens.map((it) => `<option value="${esc(String(it.valor))}" ${atual === String(it.valor) ? 'selected' : ''}>${esc(it.texto)}</option>`).join('')}
    </select>
    ${err ? `<span class="msg-erro" role="alert">${esc(err)}</span>` : ''}
  </div>`;
}

function pessoa(prefix, { email = true, copiar = null } = {}) {
  return `<div class="linha">
    ${campo({ path: `${prefix}.nome`, label: 'Nome completo' })}
    ${campo({ path: `${prefix}.celular`, label: 'Celular', tipo: 'phone' })}
    ${email ? campo({ path: `${prefix}.email`, label: 'E-mail', tipo: 'email' }) : ''}
  </div>`;
}

function endereco(prefix, { copiar = '' } = {}) {
  const ufs = UFS.map((u) => ({ valor: u, texto: u }));
  return `${copiar}
  <div class="linha">
    ${campo({ path: `${prefix}.cep`, label: 'CEP', tipo: 'cep', ajuda: 'Digite o CEP: rua, bairro, cidade e UF são preenchidos sozinhos.', extra: `data-cep="${prefix}"` })}
    ${campo({ path: `${prefix}.logradouro`, label: 'Endereço (rua, avenida…)' })}
  </div>
  <div class="linha">
    ${campo({ path: `${prefix}.numero`, label: 'Número' })}
    ${campo({ path: `${prefix}.complemento`, label: 'Complemento', opcional: true })}
    ${campo({ path: `${prefix}.bairro`, label: 'Bairro' })}
  </div>
  <div class="linha">
    ${campo({ path: `${prefix}.cidade`, label: 'Cidade' })}
    ${selecao({ path: `${prefix}.uf`, label: 'UF', itens: ufs })}
  </div>`;
}

function arquivos(path, label, ajuda) {
  const lista = get(state.pedido, path) || [];
  const err = erroDe(path);
  const id = 'f_' + path.replace(/\./g, '_');
  return `<div class="campo${err ? ' erro' : ''}">
    <label for="${id}">${esc(label)}</label>
    <input id="${id}" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" data-arquivo="${path}">
    ${lista.length ? `<ul class="arquivos">${lista.map((a) => `<li>${esc(a.nome)} (${(a.tamanho / 1024 / 1024).toFixed(1)} MB)</li>`).join('')}</ul>` : ''}
    ${err ? `<span class="msg-erro" role="alert">${esc(err)}</span>` : `<span class="ajuda">${esc(ajuda || 'PDF, JPG ou PNG, até 10 MB por arquivo.')}</span>`}
  </div>`;
}

const aviso = (tipo, html) => `<div class="aviso ${tipo}">${html}</div>`;
const botaoCopiar = (acao, texto) => `<button type="button" class="mini" data-acao="${acao}">${esc(texto)}</button>`;

// ------------------------------------------------------------------ etapas
const temVox = () => ['vox', 'ambos'].includes(state.pedido.produtos);
const temPhone = () => ['phone', 'ambos'].includes(state.pedido.produtos);

const ETAPAS = [
  { id: 'origem', titulo: 'Quem preenche', prefixos: ['origem'], render: etapaOrigem },
  { id: 'cliente', titulo: 'Cliente', prefixos: ['cliente', 'arquivos'], render: etapaCliente },
  { id: 'produtos', titulo: 'Produtos', prefixos: ['produtos', 'fidelidade'], render: etapaProdutos },
  { id: 'vox', titulo: 'Neo Vox', prefixos: ['vox'], mostrar: temVox, render: etapaVox },
  { id: 'port', titulo: 'Portabilidade', prefixos: ['portabilidades', 'portabilidade', 'querPortabilidade'], mostrar: temVox, render: etapaPortabilidade },
  { id: 'phone', titulo: 'Neo Phone', prefixos: ['phone', 'gravacao'], mostrar: temPhone, render: etapaPhone },
  { id: 'conclusao', titulo: 'Conclusão', prefixos: ['conclusao'], render: etapaConclusao },
  { id: 'resumo', titulo: 'Revisão e envio', prefixos: [], render: etapaResumo },
];
const etapasVisiveis = () => ETAPAS.filter((e) => !e.mostrar || e.mostrar());

function etapaOrigem() {
  const o = state.pedido.origem;
  const lista = (o.tipo === 'revenda' ? catalogo.revendas : catalogo.vendedores).filter((x) => x.ativo);
  return `<h2 class="titulo">Quem está preenchendo</h2>
  <p class="sub">Escolha seu nome na lista. Seus dados são preenchidos sozinhos e podem ser corrigidos se estiverem desatualizados.</p>
  ${opcoes({ path: 'origem.tipo', label: 'Você é Vendedor ou Revenda?', itens: [{ valor: 'vendedor', texto: 'Vendedor (Connect)' }, { valor: 'revenda', texto: 'Revenda' }] })}
  ${o.tipo && !lista.length ? aviso('alerta', 'Nenhum nome cadastrado ainda. Peça ao administrador para cadastrar no painel do catálogo.') : ''}
  ${o.tipo ? selecao({ path: 'origem.id', label: o.tipo === 'revenda' ? 'Revenda' : 'Vendedor', itens: lista.map((x) => ({ valor: x.id, texto: x.nome })), rerender: true }) : ''}
  ${o.id ? `<div class="linha">
      ${o.tipo === 'revenda' ? campo({ path: 'origem.cnpj', label: 'CNPJ da revenda', tipo: 'cnpj' }) : ''}
      ${campo({ path: 'origem.nome', label: o.tipo === 'revenda' ? 'Nome da revenda' : 'Nome' })}
    </div>
    <div class="linha">
      ${campo({ path: 'origem.email', label: 'E-mail', tipo: 'email', ajuda: 'O resumo do pedido é enviado para este e-mail.' })}
      ${campo({ path: 'origem.celular', label: 'Celular', tipo: 'phone' })}
    </div>` : ''}`;
}

function contatosHtml() {
  const c = state.pedido.cliente;
  const fonte = c.tipo === 'PF' ? 'Mesmo que o cliente' : 'Mesmo que o sócio principal';
  return ['gestor', 'financeiro', 'tecnico'].map((papel) => {
    const nome = { gestor: 'Gestor do contrato', financeiro: 'Responsável financeiro', tecnico: 'Responsável técnico' }[papel];
    return `<h3>${nome} ${botaoCopiar(`copiar-contato:${papel}`, fonte)}</h3>${pessoa(`cliente.contatos.${papel}`)}`;
  }).join('') + `<h3>Testemunha</h3>
  <div class="linha">${campo({ path: 'cliente.contatos.testemunha.nome', label: 'Nome completo' })}${campo({ path: 'cliente.contatos.testemunha.email', label: 'E-mail', tipo: 'email' })}</div>`;
}

function etapaCliente() {
  const c = state.pedido.cliente;
  let corpo = '';
  if (c.tipo === 'PF') {
    corpo = `<h3>Dados do cliente</h3>
    ${avisos.cliente || ''}
    <div class="linha">${campo({ path: 'cliente.pf.nome', label: 'Nome completo' })}${campo({ path: 'cliente.pf.cpf', label: 'CPF', tipo: 'cpf', extra: 'data-busca="PF"' })}</div>
    <div class="linha">${campo({ path: 'cliente.pf.nascimento', label: 'Data de nascimento', tipo: 'birth' })}${campo({ path: 'cliente.pf.celular', label: 'Celular', tipo: 'phone' })}${campo({ path: 'cliente.pf.email', label: 'E-mail', tipo: 'email' })}</div>
    <h3>Endereço de cobrança</h3>${endereco('cliente.pf.endereco')}
    ${contatosHtml()}
    <h3>Documentos</h3>${arquivos('arquivos.documentos', 'Cópia do RG ou CNH')}`;
  } else if (c.tipo === 'PJ') {
    const j = c.pj;
    corpo = `<h3>Dados da empresa</h3>
    ${avisos.cnpj || ''}${avisos.cliente || ''}
    <div class="linha">${campo({ path: 'cliente.pj.cnpj', label: 'CNPJ', tipo: 'cnpj', ajuda: 'Ao sair do campo, buscamos os dados na Receita (BrasilAPI).', extra: 'data-busca="PJ"' })}${campo({ path: 'cliente.pj.razaoSocial', label: 'Razão social' })}</div>
    <div class="linha">${campo({ path: 'cliente.pj.nomeFantasia', label: 'Nome fantasia' })}${campo({ path: 'cliente.pj.dataFundacao', label: 'Data de fundação', tipo: 'date' })}</div>
    ${opcoes({ path: 'cliente.pj.indicadorIE', label: 'Indicador de Inscrição Estadual', itens: ['Contribuinte', 'Contribuinte Isento', 'Não Contribuinte'] })}
    <div class="linha">
      ${j.indicadorIE === 'Contribuinte' ? campo({ path: 'cliente.pj.inscricaoEstadual', label: 'Inscrição estadual' }) : ''}
      ${campo({ path: 'cliente.pj.inscricaoMunicipal', label: 'Inscrição municipal', opcional: true })}
    </div>
    <div class="linha">
      ${opcoes({ path: 'cliente.pj.simples', label: 'Optante do Simples Nacional?', itens: ['Sim', 'Não'], rerender: false })}
      ${opcoes({ path: 'cliente.pj.retencaoISS', label: 'Realiza retenção de ISS?', itens: ['Sim', 'Não'], rerender: false })}
    </div>
    <h3>Sócios que assinam <span class="acao">${botaoCopiar('add-socio', '+ Adicionar sócio')}</span></h3>
    ${erroDe('cliente.pj.socios') ? aviso('erro', esc(erroDe('cliente.pj.socios'))) : ''}
    ${j.socios.map((s, i) => `<div class="bloco"><h4>${i === 0 ? 'Sócio principal' : `Sócio ${i + 1}`}${i > 0 ? `<button type="button" class="mini perigo" data-acao="rem-socio:${i}">Remover</button>` : ''}</h4>
      <div class="linha">${campo({ path: `cliente.pj.socios.${i}.nome`, label: 'Nome completo' })}${campo({ path: `cliente.pj.socios.${i}.cpf`, label: 'CPF', tipo: 'cpf' })}</div>
      <div class="linha">${campo({ path: `cliente.pj.socios.${i}.nascimento`, label: 'Data de nascimento', tipo: 'birth' })}${campo({ path: `cliente.pj.socios.${i}.celular`, label: 'Celular', tipo: 'phone' })}${campo({ path: `cliente.pj.socios.${i}.email`, label: 'E-mail', tipo: 'email' })}</div>
    </div>`).join('')}
    <h3>Endereço de cobrança</h3>${endereco('cliente.pj.endereco')}
    ${contatosHtml()}
    <h3>Documentos</h3>${arquivos('arquivos.documentos', 'Última alteração contratual + CNH/CPF dos sócios')}`;
  }
  return `<h2 class="titulo">Cliente</h2>
  <p class="sub">Dados para o contrato e o cadastro no Bitrix24.</p>
  ${opcoes({ path: 'cliente.tipo', label: 'O cliente é Pessoa Física (CPF) ou Pessoa Jurídica (CNPJ)?', itens: [{ valor: 'PF', texto: 'Pessoa Física (CPF)' }, { valor: 'PJ', texto: 'Pessoa Jurídica (CNPJ)' }] })}
  ${corpo}`;
}

function etapaProdutos() {
  const p = state.pedido;
  const fids = catalogo.regras.fidelidades.map((f) => ({ valor: String(f), texto: `${f} meses` }));
  if (p.produtos === 'vox') fids.push({ valor: 'sem', texto: 'Sem fidelidade (somente planos Pré)' });
  return `<h2 class="titulo">Produtos</h2>
  <p class="sub">Só aparecem as etapas dos produtos escolhidos.</p>
  ${opcoes({ path: 'produtos', label: 'Quais produtos o cliente deseja?', itens: [
    { valor: 'ambos', texto: 'Linhas + Ramais (Neo Vox + Neo Phone)' }, { valor: 'vox', texto: 'Somente Linhas (Neo Vox)' }, { valor: 'phone', texto: 'Somente Ramais (Neo Phone)' }] })}
  ${p.produtos ? opcoes({ path: 'fidelidade', label: 'Fidelidade do contrato', itens: fids }) : ''}
  ${p.produtos === 'ambos' ? aviso('info', 'A fidelidade vale para o contrato inteiro. Exceção: se as linhas forem do plano <b>Pré</b>, elas ficam sem fidelidade e a fidelidade vale só para os ramais.') : ''}`;
}

function etapaVox() {
  const p = state.pedido;
  const v = p.vox;
  const semFid = p.fidelidade === 'sem';
  const tipos = tiposVoxDisponiveis(catalogo, { origemTipo: p.origem.tipo }).filter((t) => !semFid || t.categoria === 'pre');
  const tipo = tipos.find((t) => t.id === v.tipoId);
  const fidelidade = semFid ? null : Number(p.fidelidade);
  const res = tipo ? resolverPlanoVox(catalogo, { ...v, fidelidade }) : null;
  const pres = catalogo.planosVox.filter((x) => x.tipo === v.tipoId && x.ativo);
  const calc = calcularPedido(catalogo, pedidoParaEnvio()).vox;
  let detalhes = '';
  if (res?.plano && calc) {
    const t = calc.tarifas;
    detalhes = aviso('ok', `Plano: <b>${esc(calc.plano)}</b> — ${brl(calc.precoUnit)} por linha${calc.descontoPercent ? ` (cheio ${brl(calc.precoCheio)}, ${calc.descontoPercent}% de desconto)` : ''}.`);
    if (t) {
      const linhas = calc.categoria === 'pre'
        ? [['Local', t.local], ['Longa distância (LDN)', t.ldn], ['Móvel (VC1, VC2, VC3)', t.vc]]
        : [['Fixo local', t.fixoLocal], ['Fixo longa distância (LDN)', t.fixoLDN], ['Móvel local', t.movelLocal], ['Móvel longa distância', t.movelLDN]];
      detalhes += `<table class="tab"><thead><tr><th>Tarifa por minuto (consulta)</th><th class="num">Valor</th></tr></thead><tbody>${linhas.map(([k, x]) => `<tr><td>${k}</td><td class="num">R$ ${Number(x).toLocaleString('pt-BR', { minimumFractionDigits: 3 })}</td></tr>`).join('')}</tbody></table>`;
    }
  } else if (res?.erro && v.linhas) {
    detalhes = aviso('alerta', esc(res.erro));
  }
  const ldi = `<details><summary>Tarifas internacionais (LDI) — consulta</summary><div class="rolavel"><table class="tab"><thead><tr><th>Região</th><th>Países</th><th>Fixo</th><th>Móvel</th></tr></thead><tbody>
    ${(catalogo.ldi || []).map((l) => `<tr><td>${esc(l.grupo)}</td><td>${esc(l.regioes)}</td><td>${esc(l.fixo)}</td><td>${esc(l.movel)}</td></tr>`).join('')}</tbody></table></div></details>`;
  return `<h2 class="titulo">Neo Vox (linhas)</h2>
  <p class="sub">${semFid ? 'Sem fidelidade: só planos Pré.' : `Fidelidade: ${p.fidelidade} meses.`} Escolha o tipo e a quantidade de linhas: o plano certo é escolhido sozinho.</p>
  ${opcoes({ path: 'vox.tipoId', label: 'Tipo de plano', itens: tipos.map((t) => ({ valor: t.id, texto: t.nome })) })}
  ${erroDe('vox') ? aviso('erro', esc(erroDe('vox'))) : ''}
  ${tipo?.categoria === 'pre' ? selecao({ path: 'vox.planoPreId', label: 'Plano Pré (recarga mensal por linha)', itens: pres.map((x) => ({ valor: x.id, texto: `${x.nome} — ${brl(x.precoCheio)}` })), rerender: true }) : ''}
  <div class="linha">
    ${campo({ path: 'vox.linhas', label: 'Quantidade de linhas / SIP Trunk', tipo: 'int', extra: 'data-rerender-blur="1"' })}
    ${campo({ path: 'vox.ddd', label: 'DDD do cliente (CN)', tipo: 'ddd', ajuda: 'Define o CFOP da nota fiscal.' })}
  </div>
  ${detalhes}
  ${aviso('info', 'Cada linha (tronco) tem direito a 1 número (DID/DDR). Para mais números, contrate números adicionais.')}
  ${opcoes({ path: 'vox.adicionais.quer', label: 'Deseja números adicionais?', itens: [{ valor: 'true', texto: 'Sim' }, { valor: 'false', texto: 'Não' }], tipoValor: 'bool' })}
  ${v.adicionais.quer ? campo({ path: 'vox.adicionais.quantidade', label: 'Quantos números adicionais?', tipo: 'int' }) : ''}
  ${ldi}`;
}

function etapaPortabilidade() {
  const p = state.pedido;
  const ops = [...catalogo.regras.operadoras, 'Outra'].map((x) => ({ valor: x, texto: x }));
  const ufs = UFS.map((u) => ({ valor: u, texto: u }));
  const calc = calcularPedido(catalogo, pedidoParaEnvio());
  const blocos = p.portabilidades.map((b, i) => {
    const pre = `portabilidades.${i}`;
    const qtd = contarNumerosPortabilidade(b);
    const t = b.titular;
    let numeros;
    if (b.modo === 'faixa') {
      numeros = `<div class="linha">${campo({ path: `${pre}.faixa.inicio`, label: 'Primeiro número da sequência', tipo: 'phone' })}${campo({ path: `${pre}.faixa.fim`, label: 'Último número da sequência', tipo: 'phone' })}</div>`;
    } else {
      numeros = b.numeros.map((_, j) => `<div class="linha">${campo({ path: `${pre}.numeros.${j}`, label: `Número ${j + 1}`, tipo: 'phone' })}
        ${b.numeros.length > 1 ? `<div class="campo"><label>&nbsp;</label><button type="button" class="mini perigo" data-acao="rem-numero:${i}:${j}">Remover número</button></div>` : ''}</div>`).join('')
        + `<p>${botaoCopiar(`add-numero:${i}`, '+ número')}</p>${erroDe(`${pre}.numeros`) ? aviso('erro', esc(erroDe(`${pre}.numeros`))) : ''}`;
    }
    let titular = '';
    if (!t.mesmoCliente) {
      titular = opcoes({ path: `${pre}.titular.tipo`, label: 'O titular atual é Pessoa Física ou Jurídica?', itens: [{ valor: 'PF', texto: 'Pessoa Física (CPF)' }, { valor: 'PJ', texto: 'Pessoa Jurídica (CNPJ)' }] });
      if (t.tipo === 'PF') titular += `<div class="linha">${campo({ path: `${pre}.titular.pf.nome`, label: 'Nome completo do titular' })}${campo({ path: `${pre}.titular.pf.cpf`, label: 'CPF do titular', tipo: 'cpf' })}</div>
        <div class="linha">${campo({ path: `${pre}.titular.pf.celular`, label: 'Celular do titular', tipo: 'phone' })}${campo({ path: `${pre}.titular.pf.email`, label: 'E-mail do titular', tipo: 'email' })}</div>`;
      if (t.tipo === 'PJ') titular += `<div class="linha">${campo({ path: `${pre}.titular.pj.cnpj`, label: 'CNPJ da empresa titular', tipo: 'cnpj' })}${campo({ path: `${pre}.titular.pj.razaoSocial`, label: 'Razão social' })}${campo({ path: `${pre}.titular.pj.dataFundacao`, label: 'Data de fundação', tipo: 'date' })}</div>
        ${opcoes({ path: `${pre}.titular.pj.indicadorIE`, label: 'Indicador de Inscrição Estadual', itens: ['Contribuinte', 'Contribuinte Isento', 'Não Contribuinte'] })}
        <div class="linha">${t.pj.indicadorIE === 'Contribuinte' ? campo({ path: `${pre}.titular.pj.inscricaoEstadual`, label: 'Inscrição estadual' }) : ''}${campo({ path: `${pre}.titular.pj.inscricaoMunicipal`, label: 'Inscrição municipal', opcional: true })}</div>`;
    }
    return `<div class="bloco">
      <h4>Portabilidade ${i + 1} · ${qtd} número(s) <button type="button" class="mini perigo" data-acao="rem-port:${i}">Remover bloco</button></h4>
      <div class="linha">${campo({ path: `${pre}.cidade`, label: 'Cidade de origem das linhas' })}${selecao({ path: `${pre}.uf`, label: 'UF', itens: ufs })}</div>
      <div class="linha">${selecao({ path: `${pre}.operadora`, label: 'Operadora de origem', itens: ops, rerender: true })}${b.operadora === 'Outra' ? campo({ path: `${pre}.operadoraOutra`, label: 'Qual operadora?' }) : ''}</div>
      ${opcoes({ path: `${pre}.modo`, label: 'Como informar os números?', itens: [{ valor: 'lista', texto: 'Um por um' }, { valor: 'faixa', texto: 'Faixa em sequência (primeiro e último)' }] })}
      ${numeros}
      <h3>Titular atual das linhas</h3>
      ${opcoes({ path: `${pre}.titular.mesmoCliente`, label: 'Os dados do titular da última fatura são os mesmos do cliente?', itens: [{ valor: 'true', texto: 'Sim' }, { valor: 'false', texto: 'Não' }], tipoValor: 'bool' })}
      ${titular}
      ${arquivos(`${pre}.fatura`, 'Cópia da última fatura (legível, em nome do titular atual)')}
      <h3>Contato técnico da portabilidade ${botaoCopiar(`copiar-tecnico:${i}`, 'Mesmo que o responsável técnico')}</h3>
      ${pessoa(`${pre}.tecnico`)}
    </div>`;
  }).join('');
  return `<h2 class="titulo">Portabilidade</h2>
  ${aviso('info', `<b>Atenção</b><ol>
    <li>A portabilidade só pode ser feita com os mesmos dados do titular atual da fatura.</li>
    <li>Troca de titularidade só depois da portabilidade (aí precisamos dos dados do titular atual e do novo).</li>
    <li>É obrigatório enviar a última fatura, legível, em nome do titular atual.</li>
    <li>Informe corretamente os dados do titular e os números.</li>
    <li>Apenas números fixos podem ser portados.</li></ol>`)}
  ${opcoes({ path: 'querPortabilidade', label: 'Deseja fazer portabilidade de algum número?', itens: [{ valor: 'true', texto: 'Sim' }, { valor: 'false', texto: 'Não' }], tipoValor: 'bool' })}
  ${p.querPortabilidade ? `${aviso('info', 'Cada bloco (cidade/operadora) vira um card separado no Bitrix24.')}${blocos}
    <p>${botaoCopiar('add-port', '+ Adicionar portabilidade')}</p>
    ${erroDe('portabilidade') ? aviso('erro', esc(erroDe('portabilidade'))) : calc.portabilidade ? aviso('ok', `Total: ${calc.portabilidade.numeros} número(s) a portar de ${calc.vox?.totalNumeros ?? 0} contratados (linhas + adicionais).`) : ''}` : ''}`;
}

function etapaPhone() {
  const p = state.pedido;
  const calc = calcularPedido(catalogo, pedidoParaEnvio()).phone;
  const fid = Number(p.fidelidade);
  const linhasLic = catalogo.licencasPhone.filter((l) => l.ativo).map((l) => {
    const cheio = l.precos[String(fid)];
    const item = calc?.itens.find((i) => i.id === l.id);
    return `<div class="linha">${campo({ path: `phone.licencas.${l.id}`, label: `${l.nome} — ${brl(item?.precoUnit ?? 0)} por ramal (cheio ${brl(cheio)})`, tipo: 'int', opcional: true })}</div>`;
  }).join('');
  const gravs = catalogo.gravacao.filter((g) => g.ativo).map((g) => ({ valor: g.id, texto: g.preco ? `${g.nome} = ${brl(g.preco)} por pacote` : g.nome }));
  const grav = catalogo.gravacao.find((g) => g.id === p.phone.gravacao.id);
  const gcObrig = calc?.grupoCallCenterObrigatorio;
  return `<h2 class="titulo">Neo Phone (ramais)</h2>
  <p class="sub">Fidelidade: ${fid} meses. Preços já com ${catalogo.regras.descontoPercent}% de desconto.</p>
  ${aviso('alerta', `O mínimo é de <b>${catalogo.regras.minRamais} ramais</b> por contrato.`)}
  ${erroDe('phone') ? aviso('erro', esc(erroDe('phone'))) : ''}
  ${linhasLic}
  ${calc ? aviso('ok', `Total: ${calc.totalRamais} ramal(is) · ${brl(calc.totalLicencas)} por mês em licenças.`) : ''}
  <h3>Gravação de chamadas adicional</h3>
  <p class="ajuda">Basic e Standard já incluem 90 dias. Pacotes extras: até ${calc?.licencasComGravacao ?? 0} (soma das licenças Basic + Standard).</p>
  ${opcoes({ path: 'phone.gravacao.id', label: 'Pacote de gravação', itens: gravs })}
  ${grav?.preco ? campo({ path: 'phone.gravacao.pacotes', label: 'Quantos pacotes?', tipo: 'int' }) : ''}
  ${erroDe('gravacao') ? aviso('erro', esc(erroDe('gravacao'))) : ''}
  <h3>Adicionais</h3>
  <div class="opcoes">
    <label><input type="checkbox" data-path="phone.discador" ${p.phone.discador ? 'checked' : ''}> Discador automático mensal — ${brl(catalogo.discador.preco)}</label>
    <label><input type="checkbox" data-path="phone.grupoCallCenter" ${p.phone.grupoCallCenter || gcObrig ? 'checked' : ''} ${gcObrig ? 'disabled' : ''}> Módulo "Grupo Call Center" — ${brl(catalogo.grupoCallCenter.preco)}</label>
  </div>
  ${gcObrig ? aviso('info', `Com mais de ${catalogo.regras.limiteStandardSemGrupoCallCenter} licenças Standard, o Grupo Call Center é obrigatório e já foi incluído.`) : ''}`;
}

function etapaConclusao() {
  const p = state.pedido;
  const fonte = p.cliente.tipo === 'PF' ? 'cliente.pf.endereco' : 'cliente.pj.endereco';
  const inst = catalogo.regras.instalacao;
  return `<h2 class="titulo">Conclusão do pedido</h2>
  <div class="linha">${selecao({ path: 'conclusao.vencimento', label: 'Dia de vencimento da fatura', itens: catalogo.regras.vencimentos.map((d) => ({ valor: d, texto: `Dia ${d}` })) })}</div>
  ${opcoes({ path: 'conclusao.instalacao', label: 'Instalação do serviço', itens: [{ valor: 'remota', texto: `Remota (todo o Brasil) — ${brl(inst.remota)}` }, { valor: 'presencial', texto: `Presencial (consultar disponibilidade) — ${brl(inst.presencial)}` }] })}
  ${campo({ path: 'conclusao.observacoes', label: 'Observações importantes do projeto', tipo: 'textarea' })}
  <h3>Endereço de instalação <span class="acao">${botaoCopiar(`copiar-endereco:${fonte}`, 'Mesmo endereço de cobrança')}</span></h3>
  ${endereco('conclusao.endereco')}`;
}

function etapaResumo() {
  if (state.resultado) {
    const r = state.resultado;
    return `<h2 class="titulo">Pedido enviado</h2>
    ${aviso('ok', `Pedido <b>${esc(r.pedidoId)}</b> gravado no Bitrix24.`)}
    <h3>Cards criados</h3>
    <ul class="cards-criados">${r.cards.map((c) => `<li>${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.titulo)} (#${c.id})</a>` : `${esc(c.titulo)} (#${c.id})`}</li>`).join('')}</ul>
    <p class="ajuda">${r.email?.enviado ? `O resumo foi enviado para ${esc(state.pedido.origem.email)}.` : 'O resumo por e-mail não foi enviado (e-mail ainda não configurado no servidor). O resumo está na linha do tempo de cada card.'}</p>
    <p><button type="button" class="pri" data-acao="novo">Fazer outro pedido</button></p>`;
  }
  const pedido = pedidoParaEnvio();
  const calc = calcularPedido(catalogo, pedido);
  const secoes = montarResumo(pedido, calc);
  const anexos = [...state.pedido.arquivos.documentos, ...state.pedido.portabilidades.flatMap((b) => b.fatura)];
  return `<h2 class="titulo">Revise antes de enviar</h2>
  <p class="sub">Confira tudo. Para corrigir, use “Voltar” ou clique na etapa no topo.</p>
  ${state.erroEnvio ? aviso('erro', state.erroEnvio) : ''}
  <div class="resumo">${secoes.map((s) => `<section><h4>${esc(s.titulo)}</h4><dl>${s.linhas.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></section>`).join('')}
  <section><h4>Anexos</h4><ul class="arquivos">${anexos.map((a) => `<li>${esc(a.nome)}</li>`).join('') || '<li>Nenhum</li>'}</ul></section></div>`;
}

// ------------------------------------------------------------------ pedido "limpo" para cálculo/envio
function pedidoParaEnvio() {
  const p = JSON.parse(JSON.stringify(state.pedido));
  p.fidelidade = p.fidelidade === 'sem' || p.fidelidade === '' ? null : Number(p.fidelidade);
  if (!['vox', 'ambos'].includes(p.produtos)) { delete p.vox; p.portabilidades = []; }
  if (!p.querPortabilidade) p.portabilidades = [];
  if (!['phone', 'ambos'].includes(p.produtos)) delete p.phone;
  if (p.vox) p.vox.linhas = onlyDigits(p.vox.linhas) ? Number(onlyDigits(p.vox.linhas)) : '';
  if (p.cliente.tipo === 'PF') delete p.cliente.pj; else if (p.cliente.tipo === 'PJ') delete p.cliente.pf;
  (p.portabilidades || []).forEach((b) => {
    if (b.modo === 'faixa') b.numeros = []; else b.faixa = { inicio: '', fim: '' };
    if (b.operadora !== 'Outra') b.operadoraOutra = '';
  });
  delete p.querPortabilidade;
  return p;
}

// ------------------------------------------------------------------ render
function renderPassos() {
  const vis = etapasVisiveis();
  $('#passos').innerHTML = vis.map((e, i) => `<li class="${i === state.etapa ? 'atual' : i < state.etapa ? 'feito' : ''}">${i < state.etapa ? `<a href="#" data-ir="${i}" style="color:inherit;text-decoration:none">${i + 1}. ${esc(e.titulo)}</a>` : `${i + 1}. ${esc(e.titulo)}`}</li>`).join('');
}

function renderPainel() {
  if (!catalogo) return;
  const c = calcularPedido(catalogo, pedidoParaEnvio());
  const linhas = [];
  if (c.vox) linhas.push(['Neo Vox / mês', brl(c.vox.mensal)]);
  if (c.phone) linhas.push(['Neo Phone / mês', brl(c.phone.mensal)]);
  if (c.portabilidade) linhas.push([`Portabilidade (${c.portabilidade.numeros})`, brl(c.portabilidade.total)]);
  if (c.vox?.ativacao) linhas.push(['Ativação', brl(c.vox.ativacao)]);
  if (c.instalacao != null) linhas.push(['Instalação', brl(c.instalacao)]);
  $('#painel').innerHTML = `<h2>Valores do pedido</h2>${linhas.length ? `<dl>${linhas.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}
    <dt class="total">Valor mensal</dt><dd class="total">${brl(c.mensal)}</dd>
    <dt>Adesão (única)</dt><dd>${brl(c.adesao)}</dd>
    <dt class="total">Total do contrato${c.meses ? ` (${c.meses} meses)` : ''}</dt><dd class="total">${brl(c.totalContrato)}</dd></dl>` : '<p class="vazio">Os valores aparecem aqui conforme você escolhe os produtos.</p>'}`;
}

function render({ foco } = {}) {
  const vis = etapasVisiveis();
  if (state.etapa >= vis.length) state.etapa = vis.length - 1;
  const etapa = vis[state.etapa];
  $('#etapa').innerHTML = etapa.render();
  renderPassos();
  renderPainel();
  $('#voltar').style.visibility = state.etapa === 0 || state.resultado ? 'hidden' : 'visible';
  const ultimo = etapa.id === 'resumo';
  $('#avancar').style.display = state.resultado ? 'none' : '';
  $('#avancar').textContent = ultimo ? (state.enviando ? 'Enviando…' : 'Confirmar e enviar') : 'Próximo';
  $('#avancar').disabled = state.enviando;
  if (foco) $(`[data-path="${foco}"]`)?.focus();
  salvarRascunho();
}

// ------------------------------------------------------------------ validação por etapa
function errosDaEtapa(etapa) {
  if (!etapa.prefixos.length) return {};
  const { erros } = validarPedido(catalogo, pedidoParaEnvio());
  const out = {};
  for (const e of erros) {
    if (etapa.prefixos.some((p) => e.campo === p || e.campo.startsWith(p + '.'))) out[e.campo] = out[e.campo] || e.mensagem;
  }
  const p = state.pedido;
  if (etapa.id === 'produtos' && p.produtos && !p.fidelidade) out.fidelidade = 'Escolha a fidelidade.';
  if (etapa.id === 'vox' && p.vox.adicionais.quer == null) out['vox.adicionais.quer'] = 'Responda se deseja números adicionais.';
  if (etapa.id === 'port') {
    if (p.querPortabilidade == null) out.querPortabilidade = 'Responda se deseja portabilidade.';
    if (p.querPortabilidade && !p.portabilidades.length) out.portabilidade = 'Adicione ao menos um bloco de portabilidade.';
  }
  return out;
}

function avancar() {
  const vis = etapasVisiveis();
  const etapa = vis[state.etapa];
  if (etapa.id === 'resumo') return enviar();
  state.erros = errosDaEtapa(etapa);
  if (Object.keys(state.erros).length) {
    render();
    const primeiro = $('.campo.erro input, .campo.erro select, .campo.erro textarea, .grupo.erro input, .aviso.erro');
    primeiro?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (primeiro?.focus) primeiro.focus({ preventScroll: true });
    return;
  }
  state.etapa++;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function enviar() {
  // Revalida tudo antes de enviar (todas as etapas).
  const todos = {};
  for (const e of etapasVisiveis()) Object.assign(todos, errosDaEtapa(e));
  if (Object.keys(todos).length) {
    state.erros = todos;
    const idx = etapasVisiveis().findIndex((e) => e.prefixos.some((p) => Object.keys(todos).some((k) => k === p || k.startsWith(p + '.'))));
    state.etapa = Math.max(0, idx);
    render();
    return;
  }
  state.enviando = true;
  state.erroEnvio = null;
  render();
  try {
    const res = await fetch('/formulario/api/pedidos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ envioId: state.envioId, pedido: pedidoParaEnvio() }) });
    const data = await res.json().catch(() => ({}));
    if (res.status === 422 && data.erros) {
      state.erros = Object.fromEntries(data.erros.map((e) => [e.campo, e.mensagem]));
      state.erroEnvio = `O servidor encontrou problemas: ${data.erros.slice(0, 5).map((e) => esc(e.mensagem)).join(' · ')}`;
    } else if (!res.ok) {
      state.erroEnvio = esc(data.erro || 'Falha ao enviar. Tente de novo.');
    } else {
      state.resultado = data;
      limparRascunho();
    }
  } catch {
    state.erroEnvio = 'Sem conexão com o servidor. Seus dados continuam aqui; tente enviar de novo.';
  } finally {
    state.enviando = false;
    render();
  }
}

// ------------------------------------------------------------------ buscas externas
async function buscarCEP(prefix) {
  const cep = onlyDigits(get(state.pedido, `${prefix}.cep`));
  if (cep.length !== 8) return;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const d = await r.json();
    if (d.erro) { state.erros[`${prefix}.cep`] = 'CEP não encontrado.'; render(); return; }
    set(state.pedido, `${prefix}.logradouro`, d.logradouro || get(state.pedido, `${prefix}.logradouro`));
    set(state.pedido, `${prefix}.bairro`, d.bairro || get(state.pedido, `${prefix}.bairro`));
    set(state.pedido, `${prefix}.cidade`, d.localidade || '');
    set(state.pedido, `${prefix}.uf`, d.uf || '');
    delete state.erros[`${prefix}.cep`];
    render({ foco: `${prefix}.numero` });
  } catch { /* sem internet: segue manual */ }
}

const isoParaBr = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split('-').reverse().join('/') : '');

async function buscarCNPJ() {
  const cnpj = onlyDigits(state.pedido.cliente.pj.cnpj);
  if (!isValidCNPJ(cnpj)) return;
  avisos.cnpj = aviso('info', 'Consultando o CNPJ na Receita…');
  render();
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
    if (!r.ok) throw new Error(String(r.status));
    const d = await r.json();
    const j = state.pedido.cliente.pj;
    j.razaoSocial = d.razao_social || j.razaoSocial;
    j.nomeFantasia = d.nome_fantasia || j.nomeFantasia || d.razao_social || '';
    j.dataFundacao = isoParaBr(d.data_inicio_atividade) || j.dataFundacao;
    if (d.opcao_pelo_simples === true) j.simples = 'Sim';
    else if (d.opcao_pelo_simples === false) j.simples = 'Não';
    if (d.cep) {
      const e = j.endereco;
      e.cep = mask.cep(String(d.cep));
      e.logradouro = [d.descricao_tipo_de_logradouro, d.logradouro].filter(Boolean).join(' ');
      e.numero = d.numero || e.numero;
      e.complemento = d.complemento || e.complemento;
      e.bairro = d.bairro || e.bairro;
      e.cidade = d.municipio ? d.municipio.toLowerCase().replace(/(^|\s)\S/g, (s) => s.toUpperCase()) : e.cidade;
      e.uf = d.uf || e.uf;
    }
    avisos.cnpj = aviso('ok', `Dados da Receita preenchidos (${esc(d.descricao_situacao_cadastral || 'situação não informada')}). Confira e corrija se precisar.`);
  } catch {
    avisos.cnpj = aviso('alerta', 'Não foi possível consultar a Receita agora. Preencha os dados manualmente.');
  }
  render({ foco: 'cliente.pj.nomeFantasia' });
}

async function buscarNoBitrix(tipo) {
  const doc = onlyDigits(tipo === 'PJ' ? state.pedido.cliente.pj.cnpj : state.pedido.cliente.pf.cpf);
  if (tipo === 'PJ' ? !isValidCNPJ(doc) : !isValidCPF(doc)) return;
  try {
    const r = await fetch(`/formulario/api/cliente?tipo=${tipo}&doc=${doc}`);
    const d = await r.json();
    avisos.cliente = d.encontrado
      ? aviso('info', `Este cliente já está no Bitrix24${d.lead ? ' (lead encontrado: será convertido)' : ''}. O pedido será ligado ao cadastro existente.`)
      : '';
    render();
  } catch { /* opcional */ }
}

// ------------------------------------------------------------------ ações
function copiarPessoa(destino, fonte) {
  for (const k of ['nome', 'celular', 'email']) set(state.pedido, `${destino}.${k}`, get(state.pedido, `${fonte}.${k}`) || '');
}

function acao(nome) {
  const p = state.pedido;
  const [cmd, a, b] = nome.split(':');
  if (cmd === 'copiar-contato') copiarPessoa(`cliente.contatos.${a}`, p.cliente.tipo === 'PF' ? 'cliente.pf' : 'cliente.pj.socios.0');
  if (cmd === 'add-socio') p.cliente.pj.socios.push({ nome: '', cpf: '', nascimento: '', celular: '', email: '' });
  if (cmd === 'rem-socio') p.cliente.pj.socios.splice(Number(a), 1);
  if (cmd === 'add-port') p.portabilidades.push(novoBlocoPortabilidade());
  if (cmd === 'rem-port') p.portabilidades.splice(Number(a), 1);
  if (cmd === 'add-numero') p.portabilidades[Number(a)].numeros.push('');
  if (cmd === 'rem-numero') p.portabilidades[Number(a)].numeros.splice(Number(b), 1);
  if (cmd === 'copiar-tecnico') copiarPessoa(`portabilidades.${a}.tecnico`, 'cliente.contatos.tecnico');
  if (cmd === 'copiar-endereco') set(p, 'conclusao.endereco', { ...get(p, a) });
  if (cmd === 'novo') {
    state.pedido = novoPedido(); state.etapa = 0; state.erros = {}; state.resultado = null; state.envioId = uid();
    Object.keys(avisos).forEach((k) => delete avisos[k]);
  }
  render();
}

function aoEscolherOrigem() {
  const o = state.pedido.origem;
  const x = (o.tipo === 'revenda' ? catalogo.revendas : catalogo.vendedores).find((v) => v.id === o.id);
  if (!x) return;
  o.nome = x.nome;
  o.email = x.email;
  o.celular = mask.phone(x.celular);
  o.cnpj = o.tipo === 'revenda' ? mask.cnpj(x.cnpj) : '';
}

function lerArquivos(input) {
  const path = input.dataset.arquivo;
  const files = [...input.files];
  const ruins = files.filter((f) => !['application/pdf', 'image/jpeg', 'image/png'].includes(f.type) || f.size > ARQ_MAX_BYTES);
  if (ruins.length) {
    state.erros[path] = `${ruins.map((f) => f.name).join(', ')}: envie PDF, JPG ou PNG de até 10 MB.`;
    render();
    return;
  }
  Promise.all(files.map((f) => new Promise((ok, erro) => {
    const r = new FileReader();
    r.onload = () => ok({ nome: f.name, tipo: f.type, tamanho: f.size, base64: String(r.result).split(',')[1] });
    r.onerror = erro;
    r.readAsDataURL(f);
  }))).then((lista) => {
    set(state.pedido, path, lista);
    delete state.erros[path];
    render();
  });
}

// ------------------------------------------------------------------ eventos
function bind() {
  const etapaEl = $('#etapa');
  etapaEl.addEventListener('input', (ev) => {
    const el = ev.target;
    if (!el.dataset.path || el.type === 'radio' || el.type === 'checkbox' || el.tagName === 'SELECT') return;
    const tipo = el.dataset.tipo;
    let v = el.value;
    if (TIPO_MASCARA[tipo]) v = TIPO_MASCARA[tipo](v);
    if (tipo === 'int') v = onlyDigits(v).slice(0, 5);
    if (tipo === 'ddd') v = onlyDigits(v).slice(0, 2);
    if (v !== el.value) el.value = v;
    set(state.pedido, el.dataset.path, v);
    renderPainel();
    salvarRascunho();
  });

  etapaEl.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.dataset.arquivo) return lerArquivos(el);
    if (!el.dataset.path) return;
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.dataset.valorTipo === 'bool') v = v === 'true';
    set(state.pedido, el.dataset.path, v);
    delete state.erros[el.dataset.path];
    if (el.dataset.path === 'origem.tipo') { state.pedido.origem.id = ''; state.pedido.vox.tipoId = ''; }
    if (el.dataset.path === 'origem.id') aoEscolherOrigem();
    if (el.dataset.path === 'produtos' && state.pedido.produtos !== 'vox' && state.pedido.fidelidade === 'sem') state.pedido.fidelidade = '';
    if (el.dataset.path === 'fidelidade' || el.dataset.path === 'vox.tipoId') state.pedido.vox.planoPreId = el.dataset.path === 'vox.tipoId' ? '' : state.pedido.vox.planoPreId;
    if (el.dataset.rerender || el.type === 'checkbox' || el.tagName === 'SELECT') render();
    else { renderPainel(); salvarRascunho(); }
  });

  etapaEl.addEventListener('focusout', (ev) => {
    const el = ev.target;
    const path = el.dataset?.path;
    if (!path || !el.dataset.tipo || el.type === 'radio') return;
    const msg = validateValue(el.dataset.tipo === 'int' || el.dataset.tipo === 'textarea' ? 'text' : el.dataset.tipo, el.value, { required: false });
    const atual = state.erros[path];
    if (msg) state.erros[path] = msg; else delete state.erros[path];
    if (el.dataset.cep && !msg) return void buscarCEP(el.dataset.cep);
    if (el.dataset.busca === 'PJ' && !msg) { buscarCNPJ(); buscarNoBitrix('PJ'); return; }
    if (el.dataset.busca === 'PF' && !msg) { buscarNoBitrix('PF'); return; }
    if (el.dataset.rerenderBlur) return render();
    if (msg !== atual) {
      const box = el.closest('.campo');
      box.classList.toggle('erro', !!msg);
      box.querySelector('.msg-erro')?.remove();
      box.querySelector('.ajuda')?.classList.toggle('oculto', !!msg);
      if (msg) box.insertAdjacentHTML('beforeend', `<span class="msg-erro" role="alert">${esc(msg)}</span>`);
    }
  });

  etapaEl.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-acao]');
    if (b) { ev.preventDefault(); acao(b.dataset.acao); }
  });

  $('#passos').addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-ir]');
    if (!a) return;
    ev.preventDefault();
    state.etapa = Number(a.dataset.ir);
    state.erros = {};
    render();
  });

  $('#voltar').addEventListener('click', () => { state.etapa = Math.max(0, state.etapa - 1); state.erros = {}; render(); window.scrollTo({ top: 0 }); });
  $('#avancar').addEventListener('click', avancar);
  $('#form').addEventListener('submit', (ev) => ev.preventDefault());
}

async function iniciar() {
  const res = await fetch('/formulario/api/catalogo');
  if (!res.ok) {
    $('#etapa').innerHTML = aviso('erro', 'Não foi possível carregar o formulário. Abra pelo link que você recebeu ou atualize a página.');
    return;
  }
  catalogo = await res.json();
  if (carregarRascunho()) {
    $('#etapa').insertAdjacentHTML('beforebegin', '');
  }
  bind();
  render();
}

iniciar();
