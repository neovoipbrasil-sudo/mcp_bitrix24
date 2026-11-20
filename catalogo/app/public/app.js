// Interface do editor de catálogo. Edições na tabela e pedidos ao assistente viram
// "propostas"; nada vai para o Bitrix24 sem clicar em Aplicar.
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = v => (v === null || v === undefined ? '' : Number(v).toFixed(2).replace('.', ','));
const lerPreco = s => { const t = String(s).trim(); if (!t) return null; const n = Number(t.replace(/R\$\s*/i, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };

let conversaId = sessionStorage.getItem('conversaId');
if (!conversaId) { conversaId = crypto.randomUUID(); try { sessionStorage.setItem('conversaId', conversaId); } catch {} }

const st = { cat: null, pasta: null, busca: '', semPreco: false, inativos: false, sel: new Set(), rascunho: new Map(), propostas: [] };

async function api(url, body) {
  const r = await fetch(url, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ erro: `HTTP ${r.status}` }));
  if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`);
  return j;
}
function aviso(txt, erro = false) {
  const el = $('#aviso'); el.textContent = txt; el.className = `aviso${erro ? ' erro' : ''}`; el.hidden = false;
  clearTimeout(aviso.t); aviso.t = setTimeout(() => { el.hidden = true; }, erro ? 8000 : 3500);
}

// ─── Catálogo ────────────────────────────────────────────────────────────────
async function carregar(recarregar = false) {
  $('#lido').textContent = 'lendo o Bitrix24…';
  try {
    st.cat = await api(`/api/catalogo${recarregar ? '?recarregar=1' : ''}`);
    atualizarCatalogo();
  } catch (e) { $('#lido').textContent = 'erro ao ler'; aviso(e.message, true); }
}
function atualizarCatalogo() {
  const c = st.cat;
  $('#lido').textContent = `${c.itens.filter(i => i.ativo).length} itens ativos · lido às ${new Date(c.lidoEm).toLocaleTimeString('pt-BR')}`;
  $('#massa-pasta').innerHTML = '<option value="">Mover para…</option>' + ordenarPastas().map(p => `<option value="${p.id}">${'  '.repeat(p.nivel)}${esc(p.nome)}</option>`).join('');
  desenharArvore(); desenharLinhas();
}
function ordenarPastas() {
  const out = [];
  const rec = (pai, nivel) => st.cat.pastas.filter(p => p.paiId === pai).sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome)).forEach(p => { out.push({ ...p, nivel }); rec(p.id, nivel + 1); });
  rec(null, 0); return out;
}
function descendentes(id) { const out = [id]; for (let i = 0; i < out.length; i++) for (const p of st.cat.pastas) if (p.paiId === out[i]) out.push(p.id); return out; }
function visiveis() {
  const norm = s => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const termos = norm(st.busca).split(/\s+/).filter(Boolean);
  const pastas = st.pasta ? descendentes(st.pasta) : null;
  return st.cat.itens.filter(i => (st.inativos || i.ativo) && (!st.semPreco || !i.preco) && (!pastas || pastas.includes(i.pastaId)) &&
    termos.every(t => norm(`${i.id} ${i.nome} ${i.caminho}`).includes(t)))
    .sort((a, b) => a.caminho.localeCompare(b.caminho) || a.nome.localeCompare(b.nome));
}
function desenharArvore() {
  const conta = id => { const d = descendentes(id); return st.cat.itens.filter(i => d.includes(i.pastaId) && (st.inativos || i.ativo)).length; };
  const total = st.cat.itens.filter(i => st.inativos || i.ativo).length;
  $('#arvore').innerHTML = `<button class="no ${st.pasta === null ? 'sel' : ''}" data-p=""><span class="nome">Todos os itens</span><span class="qtd">${total}</span></button>` +
    ordenarPastas().map(p => `<button class="no ${st.pasta === p.id ? 'sel' : ''} ${p.ativo ? '' : 'inativa'}" data-p="${p.id}" style="padding-left:${8 + p.nivel * 14}px"><span class="nome">${esc(p.nome)}</span><span class="qtd">${conta(p.id)}</span></button>`).join('');
}
function valor(i, campo) { const r = st.rascunho.get(i.id); return r && campo in r ? r[campo] : i[campo]; }
function desenharLinhas() {
  const itens = visiveis();
  const un = st.cat.unidades;
  $('#titulo-lista').textContent = st.pasta ? st.cat.pastas.find(p => p.id === st.pasta)?.nome : 'Todos os itens';
  $('#linhas').innerHTML = itens.map(i => {
    const alt = st.rascunho.has(i.id);
    const preco = valor(i, 'preco'); const ativo = valor(i, 'ativo'); const unidade = valor(i, 'unidade');
    const pastaNova = valor(i, 'pastaId') !== i.pastaId ? st.cat.pastas.find(p => p.id === valor(i, 'pastaId'))?.nome : null;
    return `<tr data-id="${i.id}" class="${ativo ? '' : 'inativo'} ${alt ? 'alterado' : ''}">
      <td><input type="checkbox" class="sel" ${st.sel.has(i.id) ? 'checked' : ''} aria-label="Selecionar"></td>
      <td class="c-id">${i.id}</td>
      <td><input class="nome" data-c="nome" value="${esc(valor(i, 'nome'))}" title="${esc(i.nome)}">
        <div class="caminho">${esc(pastaNova ? `→ ${pastaNova}` : i.caminho)}${i.servico ? ' · serviço' : ''}</div></td>
      <td><input class="preco ${preco ? '' : 'zero'}" data-c="preco" inputmode="decimal" value="${brl(preco)}" placeholder="0,00"></td>
      <td><select data-c="unidade"><option value="">—</option>${un.map(u => `<option value="${u.id}" ${u.id === unidade ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}</select></td>
      <td class="c-at"><input type="checkbox" data-c="ativo" ${ativo ? 'checked' : ''} aria-label="Ativo"></td></tr>`;
  }).join('') || '<tr><td colspan="6" class="sutil" style="padding:16px">Nenhum item com esses filtros.</td></tr>';
  $('#sel-todos').checked = itens.length > 0 && itens.every(i => st.sel.has(i.id));
  $('#massa').hidden = st.sel.size === 0; $('#massa-n').textContent = `${st.sel.size} selecionado(s)`;
  $('#rascunho').hidden = st.rascunho.size === 0; $('#rascunho-n').textContent = `${st.rascunho.size} item(ns) alterado(s), ainda não aplicados`;
}
function mudar(id, campo, v) {
  const i = st.cat.itens.find(x => x.id === id);
  const r = { ...(st.rascunho.get(id) ?? {}) };
  const igual = campo === 'preco' ? (i.preco ?? 0) === (v ?? 0) : i[campo] === v;
  if (igual) delete r[campo]; else r[campo] = v;
  if (Object.keys(r).length) st.rascunho.set(id, r); else st.rascunho.delete(id);
}

$('#arvore').addEventListener('click', e => { const b = e.target.closest('.no'); if (!b) return; st.pasta = b.dataset.p ? Number(b.dataset.p) : null; st.sel.clear(); desenharArvore(); desenharLinhas(); });
$('#busca').addEventListener('input', e => { st.busca = e.target.value; desenharLinhas(); });
$('#f-sem-preco').addEventListener('change', e => { st.semPreco = e.target.checked; desenharArvore(); desenharLinhas(); });
$('#f-inativos').addEventListener('change', e => { st.inativos = e.target.checked; desenharArvore(); desenharLinhas(); });
$('#sel-todos').addEventListener('change', e => { for (const i of visiveis()) e.target.checked ? st.sel.add(i.id) : st.sel.delete(i.id); desenharLinhas(); });
$('#linhas').addEventListener('change', e => {
  const tr = e.target.closest('tr'); if (!tr) return; const id = Number(tr.dataset.id);
  if (e.target.classList.contains('sel')) { e.target.checked ? st.sel.add(id) : st.sel.delete(id); desenharLinhas(); return; }
  const c = e.target.dataset.c; if (!c) return;
  let v;
  if (c === 'nome') v = e.target.value.trim();
  else if (c === 'preco') { v = lerPreco(e.target.value); if (Number.isNaN(v)) { aviso('Preço inválido — use 1234,56', true); return; } }
  else if (c === 'unidade') v = e.target.value ? Number(e.target.value) : null;
  else if (c === 'ativo') v = e.target.checked;
  mudar(id, c, v); desenharLinhas();
});
function emMassa(campo, v) { for (const id of st.sel) mudar(id, campo, v); st.sel.clear(); desenharLinhas(); }
$('#massa-mover').addEventListener('click', () => { const p = Number($('#massa-pasta').value); if (!p) return aviso('Escolha a pasta de destino', true); emMassa('pastaId', p); });
$('#massa-desativar').addEventListener('click', () => emMassa('ativo', false));
$('#massa-ativar').addEventListener('click', () => emMassa('ativo', true));
$('#rascunho-descartar').addEventListener('click', () => { st.rascunho.clear(); desenharLinhas(); });
$('#rascunho-revisar').addEventListener('click', async () => {
  const alteracoes = [];
  for (const [id, r] of st.rascunho) {
    const campos = {};
    for (const k of ['nome', 'ativo', 'pastaId', 'unidade']) if (k in r) campos[k] = r[k];
    if (Object.keys(campos).length) alteracoes.push({ tipo: 'item.atualizar', id, campos });
    if ('preco' in r && r.preco !== null) alteracoes.push({ tipo: 'item.preco', id, preco: r.preco });
  }
  try {
    const p = await api('/api/propostas', { resumo: `Edição manual de ${st.rascunho.size} item(ns)`, alteracoes });
    st.rascunho.clear(); desenharLinhas(); await carregarPropostas(); abrirAba('propostas');
    aviso(`Proposta ${p.id} criada — confira e clique em Aplicar`);
  } catch (e) { aviso(e.message, true); }
});
$('#btn-recarregar').addEventListener('click', () => carregar(true));
$('#btn-planilha').addEventListener('click', async () => {
  try { const p = await api('/api/propostas/planilha-precos', {}); await carregarPropostas(); abrirAba('propostas'); aviso(`Proposta ${p.id}: ${p.alteracoes.length} preços da planilha`); }
  catch (e) { aviso(e.message, true); }
});

// ─── Propostas ───────────────────────────────────────────────────────────────
function cartao(p) {
  const res = p.resultados ?? [];
  const alts = (p.alteracoes ?? []).map((a, k) => {
    const r = res[k];
    return `<div class="alt"><div class="t">${esc(a.titulo)} ${r ? (r.ok ? '<span class="ok">✓</span>' : `<span class="erro">✗ ${esc(r.erro)}</span>`) : ''}</div>
      <div class="d">${a.diffs.map(d => `<span class="sutil">${esc(d.campo)}</span><span><span class="antes">${esc(String(d.antes).slice(0, 120))}</span> → ${esc(String(d.depois).slice(0, 200))}</span>`).join('')}</div></div>`;
  }).join('');
  const botoes = p.status === 'pendente'
    ? `<button data-acao="descartar" data-id="${p.id}">Descartar</button><button class="primario" data-acao="aplicar" data-id="${p.id}">Aplicar ${p.alteracoes.length} alteração(ões)</button>`
    : (p.resultados && p.origem !== 'desfazer' ? `<button data-acao="desfazer" data-id="${p.id}">Desfazer</button>` : '');
  return `<div class="proposta" data-prop="${p.id}"><div class="proposta-cab"><b>${esc(p.id)} · ${esc(p.resumo)}</b><span class="status ${esc(p.status.replace(/ /g, '-'))}">${esc(p.status)}</span></div>
    <div class="alts">${alts}</div>${botoes ? `<div class="proposta-acoes">${botoes}</div>` : ''}</div>`;
}
async function carregarPropostas() {
  st.propostas = await api('/api/propostas');
  $('#lista-propostas').innerHTML = st.propostas.map(cartao).join('') || '<p class="sutil">Nenhuma proposta ainda. Edite itens na tabela ou peça ao assistente.</p>';
  const n = st.propostas.filter(p => p.status === 'pendente').length;
  $('#n-pendentes').hidden = !n; $('#n-pendentes').textContent = n;
  // Atualiza cartões que aparecem dentro do chat
  for (const el of document.querySelectorAll('.mensagens .proposta')) {
    const p = st.propostas.find(x => x.id === el.dataset.prop); if (p) el.outerHTML = cartao(p);
  }
}
document.addEventListener('click', async e => {
  const b = e.target.closest('button[data-acao]'); if (!b) return;
  const { acao, id } = b.dataset;
  b.disabled = true;
  try {
    if (acao === 'aplicar') {
      b.textContent = 'Aplicando…';
      const r = await api(`/api/propostas/${id}/aplicar`, { conversaId });
      st.cat = r.catalogo; atualizarCatalogo();
      const erros = r.proposta.resultados.filter(x => !x.ok).length;
      aviso(erros ? `${id} aplicada com ${erros} erro(s) — veja os detalhes` : `${id} aplicada no Bitrix24`, erros > 0);
    } else if (acao === 'descartar') {
      await api(`/api/propostas/${id}/descartar`, { conversaId });
    } else if (acao === 'desfazer') {
      const p = await api(`/api/propostas/${id}/desfazer`, {});
      aviso(`Proposta ${p.id} criada para desfazer ${id} — confira e aplique`);
      abrirAba('propostas');
    }
  } catch (err) { aviso(err.message, true); }
  await carregarPropostas();
});

// ─── Chat ────────────────────────────────────────────────────────────────────
function md(t) {
  const linhas = esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').split('\n');
  let html = ''; let lista = false;
  for (const l of linhas) {
    const m = l.match(/^\s*[-*•]\s+(.*)/) || l.match(/^\s*\d+[.)]\s+(.*)/);
    if (m) { if (!lista) { html += '<ul>'; lista = true; } html += `<li>${m[1]}</li>`; continue; }
    if (lista) { html += '</ul>'; lista = false; }
    if (l.trim()) html += `<p>${l}</p>`;
  }
  return html + (lista ? '</ul>' : '');
}
function addMsg(cls, html) {
  const el = document.createElement('div'); el.className = `msg ${cls}`; el.innerHTML = html;
  $('#mensagens').append(el); $('#mensagens').scrollTop = 1e9; return el;
}
async function enviar(texto) {
  if (!texto.trim()) return;
  addMsg('usuario', esc(texto));
  const espera = addMsg('assistente digitando', 'Pensando e consultando o catálogo…');
  $('#btn-enviar').disabled = true;
  try {
    const r = await api('/api/chat', { conversaId, texto });
    espera.remove();
    addMsg('assistente', md(r.texto) + (r.propostas ?? []).map(cartao).join(''));
    await carregarPropostas();
  } catch (e) {
    espera.remove(); addMsg('assistente erro', esc(`Erro: ${e.message}`));
  } finally { $('#btn-enviar').disabled = false; }
}
$('#form-chat').addEventListener('submit', e => { e.preventDefault(); const t = $('#entrada').value; $('#entrada').value = ''; enviar(t); });
$('#entrada').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#form-chat').requestSubmit(); } });
$('#mensagens').addEventListener('click', e => { const s = e.target.closest('.sugestao'); if (s) enviar(s.textContent); });
$('#btn-nova').addEventListener('click', async () => {
  await api('/api/chat/limpar', { conversaId }).catch(() => {});
  conversaId = crypto.randomUUID(); try { sessionStorage.setItem('conversaId', conversaId); } catch {}
  for (const m of [...document.querySelectorAll('.mensagens .msg:not(.boas-vindas)')]) m.remove();
});

function abrirAba(nome) {
  for (const b of document.querySelectorAll('.aba')) b.classList.toggle('ativa', b.dataset.aba === nome);
  $('#aba-chat').hidden = nome !== 'chat'; $('#aba-propostas').hidden = nome !== 'propostas';
}
for (const b of document.querySelectorAll('.aba')) b.addEventListener('click', () => abrirAba(b.dataset.aba));

carregar(); carregarPropostas();
