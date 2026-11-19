// Modelo do catálogo + propostas de alteração (validar → revisar → aplicar → desfazer).
// Nada é gravado no Bitrix24 sem passar por uma proposta aprovada na interface.
import fs from 'node:fs';
import path from 'node:path';
import { Bitrix24Client } from '../../../src/bitrix24/client.js';
import { DATA_DIR } from './env.js';

const IBLOCK = 14;          // Catálogo de produtos do CRM
const IBLOCK_VARIACOES = 16;
const HIST_DIR = path.join(DATA_DIR, 'historico');

let client;
function b24() {
  if (!client) {
    if (!process.env.B24_DEFAULT_WEBHOOK) throw new Error('B24_DEFAULT_WEBHOOK não configurado no .env');
    client = new Bitrix24Client(process.env.B24_DEFAULT_WEBHOOK, { minDelay: 400 });
  }
  return client;
}

async function call(method, params) {
  try {
    return await b24().call(method, params);
  } catch (err) {
    const d = err.response?.data;
    throw new Error(d?.error_description || d?.error || err.message);
  }
}

// Métodos catalog.* devolvem result = { <coleção>: [...] }, 50 por página.
async function listAll(method, params = {}) {
  const out = [];
  for (let start = 0; ; start += 50) {
    const res = await call(method, { ...params, start });
    const r = res.result;
    const items = Array.isArray(r) ? r : (Object.values(r ?? {}).find(Array.isArray) ?? []);
    out.push(...items);
    if (!res.total || start + 50 >= res.total || items.length < 50) break;
  }
  return out;
}

// ─── Leitura ───────────────────────────────────────────────────────────────────

const state = { pastas: [], itens: [], unidades: [], baseGroupId: null, lidoEm: null };

export async function recarregar() {
  const [secoes, produtos, variacoes, precos, unidades, tiposPreco] = await Promise.all([
    listAll('catalog.section.list', { select: ['id', 'iblockId', 'iblockSectionId', 'name', 'sort', 'active'], filter: { iblockId: IBLOCK } }),
    listAll('catalog.product.list', {
      select: ['id', 'iblockId', 'name', 'type', 'iblockSectionId', 'active', 'sort', 'measure', 'previewText', 'detailText', 'detailTextType'],
      filter: { iblockId: IBLOCK },
    }),
    listAll('catalog.product.list', { select: ['id', 'iblockId', 'parentId'], filter: { iblockId: IBLOCK_VARIACOES } }),
    listAll('catalog.price.list', { select: ['id', 'productId', 'catalogGroupId', 'price', 'currency'] }),
    listAll('catalog.measure.list', {}),
    listAll('catalog.priceType.list', {}),
  ]);
  state.baseGroupId = Number((tiposPreco.find(t => t.base === 'Y') ?? tiposPreco[0])?.id ?? 2);
  state.unidades = unidades.map(u => ({ id: Number(u.id), nome: u.measureTitle || u.symbol || `#${u.code}`, simbolo: u.symbol || '' }))
    .filter(u => u.nome && !u.nome.startsWith('#'));
  const varsPorPai = new Map();
  for (const v of variacoes) {
    const pai = Number(v.parentId?.value ?? v.parentId);
    if (!pai) continue;
    if (!varsPorPai.has(pai)) varsPorPai.set(pai, []);
    varsPorPai.get(pai).push(Number(v.id));
  }
  const precoPorProduto = new Map();
  for (const p of precos) {
    if (Number(p.catalogGroupId) !== state.baseGroupId) continue;
    precoPorProduto.set(Number(p.productId), { priceId: Number(p.id), preco: Number(p.price), moeda: p.currency });
  }
  state.pastas = secoes.map(s => ({
    id: Number(s.id), nome: s.name, paiId: s.iblockSectionId ? Number(s.iblockSectionId) : null,
    ativo: s.active !== 'N', ordem: Number(s.sort ?? 500),
  }));
  state.itens = produtos.map(p => {
    const id = Number(p.id);
    const variacoes = varsPorPai.get(id) ?? [];
    const pr = precoPorProduto.get(id) ?? variacoes.map(v => precoPorProduto.get(v)).find(Boolean) ?? null;
    return {
      id, nome: p.name, tipo: Number(p.type), servico: Number(p.type) === 7,
      pastaId: p.iblockSectionId ? Number(p.iblockSectionId) : null,
      ativo: p.active !== 'N', ordem: Number(p.sort ?? 500),
      unidade: p.measure ? Number(p.measure) : null,
      preco: pr ? pr.preco : null, moeda: pr?.moeda ?? 'BRL',
      resumo: p.previewText ?? '', descricao: p.detailText ?? '', descricaoTipo: p.detailTextType ?? 'text',
      variacoes,
      precoAlvos: [id, ...variacoes].map(pid => ({ productId: pid, priceId: precoPorProduto.get(pid)?.priceId ?? null })),
    };
  });
  state.lidoEm = new Date().toISOString();
  return resumo();
}

export function resumo() {
  return {
    lidoEm: state.lidoEm,
    pastas: state.pastas,
    unidades: state.unidades,
    itens: state.itens.map(({ precoAlvos, variacoes, ...i }) => ({ ...i, caminho: caminho(i.pastaId) })),
  };
}

export function caminho(pastaId) {
  const partes = [];
  let p = state.pastas.find(x => x.id === pastaId);
  while (p) { partes.unshift(p.nome); p = state.pastas.find(x => x.id === p.paiId); }
  return partes.join(' › ') || '(sem pasta)';
}

export const getItem = id => state.itens.find(i => i.id === Number(id));
export const getPasta = id => state.pastas.find(p => p.id === Number(id));
export const nomeUnidade = id => state.unidades.find(u => u.id === Number(id))?.nome ?? (id ? `#${id}` : '—');

function resolverUnidade(v) {
  if (v === null || v === undefined || v === '') return null;
  if (/^\d+$/.test(String(v))) {
    if (!state.unidades.some(u => u.id === Number(v))) throw new Error(`Unidade de medida ${v} não existe`);
    return Number(v);
  }
  const norm = s => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
  const u = state.unidades.find(x => norm(x.nome) === norm(String(v)) || norm(x.simbolo) === norm(String(v)));
  if (!u) throw new Error(`Unidade de medida "${v}" não existe. Opções: ${state.unidades.map(x => x.nome).join(', ')}`);
  return u.id;
}

// ─── Propostas ────────────────────────────────────────────────────────────────

const propostas = new Map();
let seq = 0;
const fmtPreco = v => (v === null || v === undefined ? '—' : `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

/**
 * Valida uma lista de alterações e calcula o "antes → depois" de cada uma.
 * Tipos: item.atualizar, item.preco, item.criar, pasta.criar, pasta.atualizar, pasta.excluir.
 * Pastas criadas na mesma proposta podem ser referenciadas como "@ref".
 */
export function criarProposta({ resumo: texto, origem, alteracoes }) {
  if (!Array.isArray(alteracoes) || alteracoes.length === 0) throw new Error('A proposta não tem alterações');
  if (alteracoes.length > 300) throw new Error('Proposta grande demais (máximo 300 alterações por vez)');
  const refs = new Set();
  const pastaOk = (v, campo) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'string' && v.startsWith('@')) {
      if (!refs.has(v.slice(1))) throw new Error(`${campo}: a pasta nova "${v}" precisa ser criada antes, na mesma proposta`);
      return v;
    }
    if (!getPasta(v)) throw new Error(`${campo}: pasta ${v} não existe`);
    return Number(v);
  };
  const linhas = alteracoes.map((a, i) => {
    const n = `Alteração ${i + 1}`;
    const c = a.campos ?? {};
    switch (a.tipo) {
      case 'item.atualizar': {
        const it = getItem(a.id); if (!it) throw new Error(`${n}: item ${a.id} não existe`);
        const campos = {}; const diffs = [];
        const add = (k, antes, depois, fa = x => x ?? '—') => { if (depois !== undefined && String(antes ?? '') !== String(depois ?? '')) { campos[k] = depois; diffs.push({ campo: k, antes: fa(antes), depois: fa(depois) }); } };
        if (c.nome !== undefined) { if (!String(c.nome).trim()) throw new Error(`${n}: nome vazio`); add('nome', it.nome, String(c.nome).trim()); }
        if (c.ativo !== undefined) add('ativo', it.ativo, Boolean(c.ativo), x => (x ? 'ativo' : 'inativo'));
        if (c.pastaId !== undefined) add('pastaId', it.pastaId, pastaOk(c.pastaId, n), x => (typeof x === 'string' ? `nova pasta ${x}` : caminho(x)));
        if (c.unidade !== undefined) add('unidade', it.unidade, resolverUnidade(c.unidade), nomeUnidade);
        if (c.descricao !== undefined) add('descricao', it.descricao, String(c.descricao));
        if (c.resumo !== undefined) add('resumo', it.resumo, String(c.resumo));
        if (c.ordem !== undefined) add('ordem', it.ordem, Number(c.ordem));
        if (!diffs.length) return null;
        return { tipo: a.tipo, id: it.id, campos, titulo: `${it.nome} (#${it.id})`, diffs };
      }
      case 'item.preco': {
        const it = getItem(a.id); if (!it) throw new Error(`${n}: item ${a.id} não existe`);
        const preco = Number(a.preco);
        if (!Number.isFinite(preco) || preco < 0) throw new Error(`${n}: preço inválido (${a.preco})`);
        if (it.preco !== null && Math.abs(it.preco - preco) < 0.005) return null;
        return { tipo: a.tipo, id: it.id, preco: Math.round(preco * 100) / 100, titulo: `${it.nome} (#${it.id})`, diffs: [{ campo: 'preco', antes: fmtPreco(it.preco), depois: fmtPreco(preco) }] };
      }
      case 'item.criar': {
        if (!String(c.nome ?? '').trim()) throw new Error(`${n}: item novo sem nome`);
        const pastaId = pastaOk(c.pastaId, n);
        if (pastaId === null) throw new Error(`${n}: item novo precisa de pasta`);
        const unidade = resolverUnidade(c.unidade ?? null);
        const preco = a.preco === undefined || a.preco === null ? null : Number(a.preco);
        if (preco !== null && (!Number.isFinite(preco) || preco < 0)) throw new Error(`${n}: preço inválido`);
        return {
          tipo: a.tipo, campos: { nome: String(c.nome).trim(), pastaId, unidade, descricao: c.descricao ?? '', servico: Boolean(c.servico) }, preco,
          titulo: `Novo ${c.servico ? 'serviço' : 'produto'}: ${String(c.nome).trim()}`,
          diffs: [
            { campo: 'pasta', antes: '—', depois: typeof pastaId === 'string' ? `nova pasta ${pastaId}` : caminho(pastaId) },
            { campo: 'preco', antes: '—', depois: fmtPreco(preco) },
            { campo: 'unidade', antes: '—', depois: nomeUnidade(unidade) },
          ],
        };
      }
      case 'pasta.criar': {
        if (!String(c.nome ?? '').trim()) throw new Error(`${n}: pasta nova sem nome`);
        const paiId = pastaOk(c.paiId ?? null, n);
        if (a.ref) refs.add(String(a.ref));
        return { tipo: a.tipo, ref: a.ref ? String(a.ref) : null, campos: { nome: String(c.nome).trim(), paiId, ordem: c.ordem ?? 500 }, titulo: `Nova pasta: ${String(c.nome).trim()}`, diffs: [{ campo: 'dentro de', antes: '—', depois: paiId === null ? '(raiz)' : (typeof paiId === 'string' ? `nova pasta ${paiId}` : caminho(paiId)) }] };
      }
      case 'pasta.atualizar': {
        const p = getPasta(a.id); if (!p) throw new Error(`${n}: pasta ${a.id} não existe`);
        const campos = {}; const diffs = [];
        if (c.nome !== undefined && String(c.nome).trim() !== p.nome) { campos.nome = String(c.nome).trim(); diffs.push({ campo: 'nome', antes: p.nome, depois: campos.nome }); }
        if (c.paiId !== undefined && (c.paiId ?? null) !== p.paiId) {
          const pai = pastaOk(c.paiId ?? null, n);
          if (pai === p.id) throw new Error(`${n}: uma pasta não pode ficar dentro dela mesma`);
          campos.paiId = pai; diffs.push({ campo: 'dentro de', antes: p.paiId ? caminho(p.paiId) : '(raiz)', depois: pai === null ? '(raiz)' : caminho(pai) });
        }
        if (c.ativo !== undefined && Boolean(c.ativo) !== p.ativo) { campos.ativo = Boolean(c.ativo); diffs.push({ campo: 'ativo', antes: p.ativo ? 'ativa' : 'inativa', depois: c.ativo ? 'ativa' : 'inativa' }); }
        if (c.ordem !== undefined && Number(c.ordem) !== p.ordem) { campos.ordem = Number(c.ordem); diffs.push({ campo: 'ordem', antes: p.ordem, depois: campos.ordem }); }
        if (!diffs.length) return null;
        return { tipo: a.tipo, id: p.id, campos, titulo: `Pasta ${caminho(p.id)}`, diffs };
      }
      case 'pasta.excluir': {
        const p = getPasta(a.id); if (!p) throw new Error(`${n}: pasta ${a.id} não existe`);
        const sub = descendentes(p.id);
        const dentro = state.itens.filter(it => sub.includes(it.pastaId));
        if (dentro.length) throw new Error(`${n}: a pasta "${p.nome}" tem ${dentro.length} itens. Mova-os antes de excluir — excluir uma pasta com itens apaga os itens para sempre.`);
        return { tipo: a.tipo, id: p.id, titulo: `Excluir pasta vazia ${caminho(p.id)}`, diffs: [{ campo: 'pasta', antes: p.nome, depois: '(excluída)' }] };
      }
      default:
        throw new Error(`${n}: tipo desconhecido "${a.tipo}"`);
    }
  }).filter(Boolean);
  if (!linhas.length) throw new Error('Nenhuma alteração: os valores propostos já são os atuais');
  const id = `P${++seq}`;
  const prop = { id, resumo: texto || `${linhas.length} alterações`, origem: origem || 'manual', criadaEm: new Date().toISOString(), status: 'pendente', alteracoes: linhas };
  propostas.set(id, prop);
  return prop;
}

function descendentes(id) {
  const out = [id];
  for (let i = 0; i < out.length; i++) for (const p of state.pastas) if (p.paiId === out[i]) out.push(p.id);
  return out;
}

export const listarPropostas = () => [...propostas.values()].reverse();
export const getProposta = id => propostas.get(id);

export function descartarProposta(id) {
  const p = propostas.get(id);
  if (!p || p.status !== 'pendente') throw new Error('Proposta não está pendente');
  p.status = 'descartada';
  return p;
}

const tf = v => (v ? 'Y' : 'N');
function camposItem(c, refs, it) {
  const f = {};
  if (c.nome !== undefined) f.name = c.nome;
  if (c.ativo !== undefined) f.active = tf(c.ativo);
  if (c.pastaId !== undefined) { const s = typeof c.pastaId === 'string' ? refs[c.pastaId.slice(1)] : c.pastaId; f.iblockSectionId = s; f.iblockSection = [s]; }
  if (c.unidade !== undefined) f.measure = c.unidade;
  if (c.descricao !== undefined) { f.detailText = c.descricao; f.detailTextType = /<[a-z][\s\S]*>/i.test(c.descricao) ? 'html' : (it?.descricaoTipo === 'html' ? 'html' : 'text'); }
  if (c.resumo !== undefined) f.previewText = c.resumo;
  if (c.ordem !== undefined) f.sort = c.ordem;
  return f;
}

async function aplicarPreco(it, preco) {
  for (const alvo of it.precoAlvos) {
    const fields = { productId: alvo.productId, catalogGroupId: state.baseGroupId, price: preco, currency: 'BRL' };
    if (alvo.priceId) await call('catalog.price.update', { id: alvo.priceId, fields });
    else await call('catalog.price.add', { fields });
  }
}

const novoId = r => Number(r?.id ?? Object.values(r ?? {}).find(v => v && typeof v === 'object' && v.id)?.id);

/** Aplica no Bitrix24 uma proposta pendente. Grava o "antes" de cada alteração no histórico. */
export async function aplicarProposta(id) {
  const prop = propostas.get(id);
  if (!prop || prop.status !== 'pendente') throw new Error('Proposta não está pendente');
  prop.status = 'aplicando';
  const refs = {};
  const resultados = [];
  for (const a of prop.alteracoes) {
    const r = { titulo: a.titulo, tipo: a.tipo, ok: false };
    try {
      if (a.tipo === 'item.atualizar') {
        const it = getItem(a.id);
        r.antes = { nome: it.nome, ativo: it.ativo, pastaId: it.pastaId, unidade: it.unidade, descricao: it.descricao, resumo: it.resumo, ordem: it.ordem };
        r.id = a.id; r.campos = a.campos;
        await call(it.servico ? 'catalog.product.service.update' : 'catalog.product.update', { id: a.id, fields: camposItem(a.campos, refs, it) });
      } else if (a.tipo === 'item.preco') {
        const it = getItem(a.id);
        r.antes = { preco: it.preco }; r.id = a.id; r.preco = a.preco;
        await aplicarPreco(it, a.preco);
      } else if (a.tipo === 'item.criar') {
        const f = { iblockId: IBLOCK, ...camposItem({ nome: a.campos.nome, pastaId: a.campos.pastaId, unidade: a.campos.unidade ?? undefined, descricao: a.campos.descricao || undefined }, refs), active: 'Y' };
        const res = await call(a.campos.servico ? 'catalog.product.service.add' : 'catalog.product.add', { fields: f });
        const nid = novoId(res.result);
        if (!nid) throw new Error('o Bitrix24 não devolveu o ID do item criado');
        r.id = nid; r.criado = true;
        if (a.preco !== null) await call('catalog.price.add', { fields: { productId: nid, catalogGroupId: state.baseGroupId, price: a.preco, currency: 'BRL' } });
      } else if (a.tipo === 'pasta.criar') {
        const pai = typeof a.campos.paiId === 'string' ? refs[a.campos.paiId.slice(1)] : a.campos.paiId;
        const res = await call('catalog.section.add', { fields: { iblockId: IBLOCK, name: a.campos.nome, iblockSectionId: pai, sort: a.campos.ordem, active: 'Y' } });
        const nid = novoId(res.result);
        if (!nid) throw new Error('o Bitrix24 não devolveu o ID da pasta criada');
        if (a.ref) refs[a.ref] = nid;
        r.id = nid; r.criado = true;
      } else if (a.tipo === 'pasta.atualizar') {
        const p = getPasta(a.id);
        r.antes = { nome: p.nome, paiId: p.paiId, ativo: p.ativo, ordem: p.ordem }; r.id = a.id; r.campos = a.campos;
        const f = { iblockId: IBLOCK, name: a.campos.nome ?? p.nome };
        if (a.campos.paiId !== undefined) f.iblockSectionId = typeof a.campos.paiId === 'string' ? refs[a.campos.paiId.slice(1)] : a.campos.paiId;
        if (a.campos.ativo !== undefined) f.active = tf(a.campos.ativo);
        if (a.campos.ordem !== undefined) f.sort = a.campos.ordem;
        await call('catalog.section.update', { id: a.id, fields: f });
      } else if (a.tipo === 'pasta.excluir') {
        // Confere de novo direto no Bitrix24, porque excluir pasta com itens apaga os itens.
        const sub = descendentes(a.id);
        const dentro = await listAll('catalog.product.list', { select: ['id', 'iblockId'], filter: { iblockId: IBLOCK, iblockSectionId: sub } });
        if (dentro.length) throw new Error(`a pasta não está vazia no Bitrix24 (${dentro.length} itens) — não excluída`);
        r.antes = { ...getPasta(a.id) }; r.id = a.id;
        await call('catalog.section.delete', { id: a.id });
      }
      r.ok = true;
    } catch (err) {
      r.erro = err.message;
    }
    resultados.push(r);
  }
  prop.status = resultados.every(r => r.ok) ? 'aplicada' : (resultados.some(r => r.ok) ? 'aplicada com erros' : 'falhou');
  prop.aplicadaEm = new Date().toISOString();
  prop.resultados = resultados;
  fs.mkdirSync(HIST_DIR, { recursive: true });
  fs.writeFileSync(path.join(HIST_DIR, `${prop.aplicadaEm.replace(/[:.]/g, '-')}-${prop.id}.json`), JSON.stringify(prop, null, 2));
  await recarregar();
  return prop;
}

/** Monta uma nova proposta (pendente) que desfaz o que uma proposta aplicada mudou. */
export function propostaDesfazer(id) {
  const prop = propostas.get(id);
  if (!prop?.resultados) throw new Error('Só dá para desfazer uma proposta aplicada');
  const alt = [];
  for (const r of [...prop.resultados].reverse()) {
    if (!r.ok) continue;
    if (r.tipo === 'item.atualizar') { const c = {}; for (const k of Object.keys(r.campos)) c[k] = r.antes[k]; alt.push({ tipo: 'item.atualizar', id: r.id, campos: c }); }
    else if (r.tipo === 'item.preco' && r.antes.preco !== null) alt.push({ tipo: 'item.preco', id: r.id, preco: r.antes.preco });
    else if (r.tipo === 'item.criar') alt.push({ tipo: 'item.atualizar', id: r.id, campos: { ativo: false } });
    else if (r.tipo === 'pasta.atualizar') { const c = {}; for (const k of Object.keys(r.campos)) c[k] = r.antes[k]; alt.push({ tipo: 'pasta.atualizar', id: r.id, campos: c }); }
    else if (r.tipo === 'pasta.criar') alt.push({ tipo: 'pasta.excluir', id: r.id });
  }
  if (!alt.length) throw new Error('Não há o que desfazer nesta proposta (exclusão de pasta não tem volta automática)');
  return criarProposta({ resumo: `Desfazer ${prop.id}: ${prop.resumo}`, origem: 'desfazer', alteracoes: alt });
}

/** Lê catalogo/data/precos-pendentes.csv (coluna preco_novo preenchida) e monta uma proposta de preços. */
export function propostaPlanilhaPrecos() {
  const file = path.join(DATA_DIR, 'precos-pendentes.csv');
  if (!fs.existsSync(file)) throw new Error('Planilha catalogo/data/precos-pendentes.csv não encontrada');
  const linhas = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const cab = linhas.shift().split(';').map(s => s.replace(/"/g, '').trim());
  const iId = cab.indexOf('id'); const iP = cab.indexOf('preco_novo');
  const alt = [];
  for (const l of linhas) {
    const cols = l.split(';').map(s => s.replace(/"/g, '').trim());
    const v = cols[iP]; if (!v) continue;
    const preco = Number(v.replace(/R\$\s*/i, '').replace(/\./g, '').replace(',', '.'));
    alt.push({ tipo: 'item.preco', id: Number(cols[iId]), preco });
  }
  if (!alt.length) throw new Error('Nenhum preço preenchido na coluna preco_novo da planilha');
  return criarProposta({ resumo: `Preços da planilha precos-pendentes.csv (${alt.length})`, origem: 'planilha', alteracoes: alt });
}

/** Busca usada pelo agente e pela interface. */
export function buscar({ texto, pastaId, ativo, semPreco, limite = 60 } = {}) {
  const norm = s => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const termos = norm(texto).split(/\s+/).filter(Boolean);
  const pastas = pastaId ? descendentes(Number(pastaId)) : null;
  const r = state.itens.filter(i =>
    (!pastas || pastas.includes(i.pastaId)) &&
    (ativo === undefined || ativo === null || i.ativo === ativo) &&
    (!semPreco || !i.preco) &&
    termos.every(t => norm(`${i.id} ${i.nome} ${caminho(i.pastaId)}`).includes(t)));
  return { total: r.length, itens: r.slice(0, limite).map(i => ({ id: i.id, nome: i.nome, pasta: caminho(i.pastaId), pastaId: i.pastaId, preco: i.preco, unidade: nomeUnidade(i.unidade), ativo: i.ativo, servico: i.servico })) };
}
