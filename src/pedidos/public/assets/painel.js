// Telas do painel: pedidos enviados (lista, filtros, exportação, detalhe), usuários e troca de senha.
import { brl } from '/formulario/shared/pricing.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dataHora = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');
const PRODUTOS = { ambos: 'Neo Vox + Neo Phone', vox: 'Neo Vox', phone: 'Neo Phone' };
const BITRIX = { enviado: 'No Bitrix', falhou: 'Falhou no Bitrix', pendente: 'Pendente', enviando: 'Enviando…' };

async function api(url, opcoes = {}) {
  const r = await fetch(url, { ...opcoes, headers: { 'content-type': 'application/json', ...(opcoes.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, d };
}

// ------------------------------------------------------------------ pedidos
export function criarTelaPedidos({ perfil, aoSair }) {
  let pedidos = null;
  let statusLista = [];
  let filtro = { q: '', status: '', origem: '', bitrix: '', de: '', ate: '' };
  let aberto = null; // { pedido, resumo }
  let msg = '';
  let el = null;

  async function carregarLista() {
    const r = await api('/formulario/admin/api/pedidos');
    if (r.status === 401) return aoSair();
    pedidos = r.d.pedidos || [];
    render();
  }

  async function abrir(id) {
    const r = await api(`/formulario/admin/api/pedidos/${encodeURIComponent(id)}`);
    if (r.status === 401) return aoSair();
    if (!r.ok) { msg = r.d.erro || 'Não foi possível abrir o pedido.'; return render(); }
    aberto = r.d;
    statusLista = r.d.status;
    msg = '';
    render();
  }

  function filtrados() {
    const q = filtro.q.trim().toLowerCase();
    const soDig = q.replace(/\D/g, '');
    return (pedidos || []).filter((p) => {
      if (filtro.status && p.status !== filtro.status) return false;
      if (filtro.origem && p.origemTipo !== filtro.origem) return false;
      if (filtro.bitrix && p.bitrix !== filtro.bitrix) return false;
      if (filtro.de && p.criadoEm.slice(0, 10) < filtro.de) return false;
      if (filtro.ate && p.criadoEm.slice(0, 10) > filtro.ate) return false;
      if (q) {
        const alvo = `${p.id} ${p.clienteNome} ${p.origemNome}`.toLowerCase();
        if (!alvo.includes(q) && !(soDig && String(p.clienteDoc || '').replace(/\D/g, '').includes(soDig))) return false;
      }
      return true;
    });
  }

  function exportarCsv() {
    const linhas = filtrados();
    const cab = ['Pedido', 'Data', 'Status', 'Origem', 'Vendedor/Revenda', 'Cliente', 'CPF/CNPJ', 'Produtos', 'Mensal (R$)', 'Adesão (R$)', 'Total do contrato (R$)', 'Bitrix', 'Cards', 'E-mail'];
    const num = (n) => (n == null ? '' : String(n).replace('.', ','));
    const csv = [cab, ...linhas.map((p) => [p.id, dataHora(p.criadoEm), p.status, p.origemTipo === 'revenda' ? 'Revenda' : 'Vendedor', p.origemNome, p.clienteNome, p.clienteDoc, PRODUTOS[p.produtos] || p.produtos,
      num(p.mensal), num(p.adesao), num(p.totalContrato), BITRIX[p.bitrix] || p.bitrix, p.cards, p.email])]
      .map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pedidos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function lista() {
    if (!pedidos) return '<p class="sub">Carregando pedidos…</p>';
    const f = filtrados();
    const opts = (lista, atual, vazio) => `<option value="">${vazio}</option>${lista.map(([v, t]) => `<option value="${esc(v)}" ${v === atual ? 'selected' : ''}>${esc(t)}</option>`).join('')}`;
    const falhas = pedidos.filter((p) => p.bitrix === 'falhou').length;
    return `<h2 class="titulo">Pedidos enviados</h2>
    <p class="sub">${pedidos.length} pedido(s) no total${falhas ? ` · <b style="color:var(--err)">${falhas} com falha no Bitrix</b>` : ''}.</p>
    ${msg ? `<div class="aviso alerta">${esc(msg)}</div>` : ''}
    <div class="regras filtros">
      <div class="campo"><label>Buscar</label><input data-filtro="q" value="${esc(filtro.q)}" placeholder="Cliente, CPF/CNPJ, vendedor ou nº do pedido"></div>
      <div class="campo"><label>Status</label><select data-filtro="status">${opts((statusLista.length ? statusLista : ['Novo', 'Em análise', 'Contrato enviado', 'Concluído', 'Cancelado']).map((s) => [s, s]), filtro.status, 'Todos')}</select></div>
      <div class="campo"><label>Origem</label><select data-filtro="origem">${opts([['vendedor', 'Vendedor'], ['revenda', 'Revenda']], filtro.origem, 'Todas')}</select></div>
      <div class="campo"><label>Bitrix</label><select data-filtro="bitrix">${opts([['enviado', 'No Bitrix'], ['falhou', 'Falhou'], ['pendente', 'Pendente']], filtro.bitrix, 'Todos')}</select></div>
      <div class="campo"><label>De</label><input type="date" data-filtro="de" value="${esc(filtro.de)}"></div>
      <div class="campo"><label>Até</label><input type="date" data-filtro="ate" value="${esc(filtro.ate)}"></div>
    </div>
    <p><button class="mini" data-acao="exportar">Exportar planilha (${f.length})</button> <button class="mini" data-acao="recarregar">Atualizar lista</button></p>
    <div class="rolavel"><table class="tab pedidos"><thead><tr><th>Pedido</th><th>Data</th><th>Cliente</th><th>Vendedor/Revenda</th><th>Produtos</th><th class="num">Mensal</th><th>Status</th><th>Bitrix</th></tr></thead>
    <tbody>${f.map((p) => `<tr class="clicavel" data-abrir="${esc(p.id)}">
      <td><b>${esc(p.id)}</b></td><td>${esc(dataHora(p.criadoEm))}</td><td>${esc(p.clienteNome)}<br><span class="ajuda">${esc(p.clienteDoc)}</span></td>
      <td>${esc(p.origemNome)}<br><span class="ajuda">${p.origemTipo === 'revenda' ? 'Revenda' : 'Vendedor'}</span></td><td>${esc(PRODUTOS[p.produtos] || '')}</td>
      <td class="num">${brl(p.mensal)}</td><td><span class="etiqueta">${esc(p.status)}</span></td>
      <td><span class="etiqueta ${p.bitrix === 'falhou' ? 'ruim' : p.bitrix === 'enviado' ? 'bom' : ''}">${esc(BITRIX[p.bitrix] || p.bitrix)}</span></td></tr>`).join('') || '<tr><td colspan="8" class="ajuda">Nenhum pedido com esses filtros.</td></tr>'}</tbody></table></div>`;
  }

  function detalhe() {
    const { pedido: r, resumo } = aberto;
    const anexos = [...(r.pedido.arquivos?.documentos || []).map((a) => ['Documento do cliente', a]),
      ...(r.pedido.portabilidades || []).flatMap((b, i) => (b.fatura || []).map((a) => [`Fatura – portabilidade ${i + 1} (${b.cidade}/${b.uf})`, a]))];
    const b = r.bitrix;
    return `<p><button class="mini" data-acao="voltar">← Voltar para a lista</button></p>
    <h2 class="titulo">${esc(r.id)}</h2>
    <p class="sub">Recebido em ${esc(dataHora(r.criadoEm))} · ${esc(r.pedido.origem?.nome)} (${r.pedido.origem?.tipo === 'revenda' ? 'revenda' : 'vendedor'})</p>
    ${msg ? `<div class="aviso alerta">${esc(msg)}</div>` : ''}
    <div class="grade-detalhe">
      <div>
        <h3>Bitrix24</h3>
        ${b.situacao === 'enviado'
          ? `<div class="aviso ok">Gravado no Bitrix24.</div>`
          : `<div class="aviso ${b.situacao === 'falhou' ? 'erro' : 'alerta'}">${b.situacao === 'falhou' ? `Falhou: ${esc(b.erro)}` : esc(BITRIX[b.situacao] || b.situacao)}</div>
             <p><button class="pri" data-acao="reenviar">Reenviar ao Bitrix24</button></p>`}
        ${b.cards?.length ? `<ul class="cards-criados">${b.cards.map((c) => `<li>${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.titulo)} (#${c.id})</a>` : `${esc(c.titulo)} (#${c.id})`}</li>`).join('')}</ul>` : ''}
        <h3>E-mail do resumo</h3>
        <p class="ajuda">${esc(r.email?.situacao || '—')}${r.email?.resposta ? ` · ${esc(r.email.resposta)}` : ''}${r.email?.erro ? ` · ${esc(r.email.erro)}` : ''}</p>
        <p><button class="mini" data-acao="reenviar-email">Reenviar e-mail para ${esc(r.pedido.origem?.email)}</button></p>
        <h3>Anexos</h3>
        ${anexos.length ? `<ul class="arquivos">${anexos.map(([rot, a]) => `<li>${esc(rot)}: <a href="/formulario/admin/api/pedidos/${encodeURIComponent(r.id)}/anexos/${encodeURIComponent(a.arquivo)}">${esc(a.nome)}</a></li>`).join('')}</ul>` : '<p class="ajuda">Sem anexos.</p>'}
        <h3>Status e observações</h3>
        <div class="campo"><label>Status</label><select id="novo-status">${statusLista.map((s) => `<option ${s === r.status ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>
        <div class="campo"><label>Nova observação interna</label><textarea id="nova-obs" placeholder="Visível só no painel"></textarea></div>
        <p><button class="pri" data-acao="salvar-status">Salvar</button></p>
        ${r.observacoes.length ? `<ul class="obs">${r.observacoes.slice().reverse().map((o) => `<li><span class="ajuda">${esc(dataHora(o.quando))} · ${esc(o.usuario)}</span><br>${esc(o.texto)}</li>`).join('')}</ul>` : ''}
        <h3>Histórico</h3>
        <ul class="obs">${r.historico.slice().reverse().map((h) => `<li><span class="ajuda">${esc(dataHora(h.quando))}${h.usuario ? ` · ${esc(h.usuario)}` : ''}</span><br>${esc(h.acao)}</li>`).join('')}</ul>
      </div>
      <div class="resumo">${resumo.map((s) => `<section><h4>${esc(s.titulo)}</h4><dl>${s.linhas.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></section>`).join('')}</div>
    </div>`;
  }

  function render() {
    if (!el) return;
    el.innerHTML = aberto ? detalhe() : lista();
  }

  async function acao(nome) {
    if (nome === 'exportar') return exportarCsv();
    if (nome === 'recarregar') { pedidos = null; render(); return carregarLista(); }
    if (nome === 'voltar') { aberto = null; msg = ''; render(); return carregarLista(); }
    const id = aberto?.pedido.id;
    if (!id) return;
    if (nome === 'salvar-status') {
      const r = await api(`/formulario/admin/api/pedidos/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status: el.querySelector('#novo-status').value, observacao: el.querySelector('#nova-obs').value }) });
      msg = r.ok ? 'Salvo.' : r.d.erro || 'Não foi possível salvar.';
      return abrir(id).then(() => { msg = r.ok ? 'Salvo.' : msg; render(); });
    }
    if (nome === 'reenviar' || nome === 'reenviar-confirmado') {
      msg = 'Enviando ao Bitrix24…';
      render();
      const r = await api(`/formulario/admin/api/pedidos/${encodeURIComponent(id)}/reenviar`, { method: 'POST', body: JSON.stringify({ confirmar: nome === 'reenviar-confirmado' }) });
      if (r.d.parcial) {
        const lista = r.d.cards.map((c) => `#${c.id} ${c.titulo}`).join(', ');
        if (confirm(`Uma tentativa anterior já criou estes cards: ${lista}.\n\nO ideal é apagá-los no Bitrix24 antes. Criar todos de novo mesmo assim?`)) return acao('reenviar-confirmado');
        msg = 'Reenvio cancelado. Apague os cards parciais no Bitrix24 e tente de novo.';
        return render();
      }
      await abrir(id);
      msg = r.ok ? `Gravado no Bitrix24 (${r.d.cards.length} card(s)).` : r.d.erro || 'Falhou de novo.';
      return render();
    }
    if (nome === 'reenviar-email') {
      const r = await api(`/formulario/admin/api/pedidos/${encodeURIComponent(id)}/reenviar-email`, { method: 'POST', body: '{}' });
      await abrir(id);
      msg = r.ok ? 'E-mail aceito pelo servidor de envio.' : r.d.erro || 'Falhou.';
      return render();
    }
  }

  return {
    montar(container) {
      el = container;
      el.oninput = (ev) => {
        const k = ev.target.dataset?.filtro;
        if (!k) return;
        filtro[k] = ev.target.value;
        const pos = ev.target.selectionStart;
        render();
        const novo = el.querySelector(`[data-filtro="${k}"]`);
        novo?.focus();
        if (pos != null && novo?.setSelectionRange && novo.type !== 'date') novo.setSelectionRange(pos, pos);
      };
      el.onclick = (ev) => {
        const a = ev.target.closest('[data-acao]');
        if (a) { ev.preventDefault(); return acao(a.dataset.acao); }
        const linha = ev.target.closest('[data-abrir]');
        if (linha) abrir(linha.dataset.abrir);
      };
      render();
      if (!pedidos) carregarLista();
      if (!statusLista.length) api('/formulario/admin/api/me').then((r) => { statusLista = r.d.status || []; render(); });
    },
  };
}

// ------------------------------------------------------------------ usuários (admin)
export function criarTelaUsuarios({ usuarioAtual, aoSair }) {
  let usuarios = null;
  let msg = '';
  let el = null;
  const PERFIL = { admin: 'Administrador', operador: 'Operador', viewer: 'Só relatórios' };

  async function carregar() {
    const r = await api('/formulario/admin/api/usuarios');
    if (r.status === 401) return aoSair();
    usuarios = r.d.usuarios || [];
    render();
  }

  function render() {
    if (!el) return;
    el.innerHTML = `<h2 class="titulo">Usuários do painel</h2>
    <p class="sub"><b>Administrador</b>: pedidos, catálogo, preços e usuários. <b>Operador</b>: só os pedidos (ver, anexos, status, reenviar, exportar).
    Quem recebe uma senha inicial ou redefinida troca no primeiro acesso.</p>
    ${msg ? `<div class="aviso alerta">${esc(msg)}</div>` : ''}
    <h3>Novo usuário</h3>
    <div class="regras">
      <div class="campo"><label>Usuário</label><input id="nu-usuario" placeholder="ex.: maria.silva" autocomplete="off"></div>
      <div class="campo"><label>Senha inicial (mín. 8)</label><input id="nu-senha" type="text" autocomplete="off"></div>
      <div class="campo"><label>Perfil</label><select id="nu-perfil"><option value="operador">Operador</option><option value="admin">Administrador</option></select></div>
      <div class="campo"><label>&nbsp;</label><button class="pri" data-acao="criar">Criar usuário</button></div>
    </div>
    <h3>Usuários</h3>
    ${usuarios ? `<div class="rolavel"><table class="tab"><thead><tr><th>Usuário</th><th>Perfil</th><th>Situação</th><th>Ações</th></tr></thead><tbody>
      ${usuarios.map((u) => `<tr><td><b>${esc(u.username)}</b>${u.username === usuarioAtual ? ' <span class="ajuda">(você)</span>' : ''}</td>
        <td><select data-perfil="${esc(u.username)}" ${u.username === usuarioAtual ? 'disabled' : ''}>${['admin', 'operador', 'viewer'].map((p) => `<option value="${p}" ${u.role === p ? 'selected' : ''} ${p === 'viewer' ? 'disabled' : ''}>${PERFIL[p]}</option>`).join('')}</select></td>
        <td>${u.mustChangePassword ? '<span class="etiqueta">Troca de senha pendente</span>' : 'Ativo'}</td>
        <td class="acoes"><button class="mini" data-acao="senha:${esc(u.username)}">Redefinir senha</button>
          ${u.username === usuarioAtual ? '' : `<button class="mini perigo" data-acao="remover:${esc(u.username)}">Remover</button>`}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="sub">Carregando…</p>'}`;
  }

  async function acao(nome) {
    const [cmd, u] = nome.split(':');
    let r;
    if (cmd === 'criar') {
      r = await api('/formulario/admin/api/usuarios', { method: 'POST', body: JSON.stringify({ usuario: el.querySelector('#nu-usuario').value, senha: el.querySelector('#nu-senha').value, perfil: el.querySelector('#nu-perfil').value }) });
      msg = r.ok ? 'Usuário criado. Passe o usuário e a senha inicial para a pessoa; ela troca no primeiro acesso.' : r.d.erro;
    }
    if (cmd === 'senha') {
      const senha = prompt(`Nova senha temporária para "${u}" (mín. 8 caracteres). A pessoa troca no próximo acesso:`);
      if (!senha) return;
      r = await api(`/formulario/admin/api/usuarios/${encodeURIComponent(u)}/senha`, { method: 'POST', body: JSON.stringify({ senha }) });
      msg = r.ok ? `Senha de "${u}" redefinida.` : r.d.erro;
    }
    if (cmd === 'remover') {
      if (!confirm(`Remover o usuário "${u}"? Ele perde o acesso na hora.`)) return;
      r = await api(`/formulario/admin/api/usuarios/${encodeURIComponent(u)}`, { method: 'DELETE' });
      msg = r.ok ? `Usuário "${u}" removido.` : r.d.erro;
    }
    if (r?.status === 401) return aoSair();
    if (r?.ok) usuarios = r.d.usuarios;
    render();
  }

  return {
    montar(container) {
      el = container;
      el.onclick = (ev) => { const a = ev.target.closest('[data-acao]'); if (a) { ev.preventDefault(); acao(a.dataset.acao); } };
      el.onchange = async (ev) => {
        const u = ev.target.dataset?.perfil;
        if (!u) return;
        const r = await api(`/formulario/admin/api/usuarios/${encodeURIComponent(u)}/perfil`, { method: 'POST', body: JSON.stringify({ perfil: ev.target.value }) });
        msg = r.ok ? `Perfil de "${u}" alterado.` : r.d.erro;
        if (r.ok) usuarios = r.d.usuarios;
        render();
      };
      render();
      carregar();
    },
  };
}

// ------------------------------------------------------------------ minha senha
export function criarTelaSenha() {
  let msg = '';
  let el = null;
  function render() {
    el.innerHTML = `<h2 class="titulo">Trocar minha senha</h2>
    ${msg ? `<div class="aviso alerta">${esc(msg)}</div>` : ''}
    <div class="regras" style="max-width:640px">
      <div class="campo"><label>Senha atual</label><input id="s-atual" type="password" autocomplete="current-password"></div>
      <div class="campo"><label>Nova senha (mín. 8)</label><input id="s-nova" type="password" autocomplete="new-password"></div>
      <div class="campo"><label>&nbsp;</label><button class="pri" data-acao="trocar">Trocar senha</button></div>
    </div>`;
  }
  return {
    montar(container) {
      el = container;
      el.onclick = async (ev) => {
        if (!ev.target.closest('[data-acao="trocar"]')) return;
        const r = await api('/formulario/admin/api/senha', { method: 'POST', body: JSON.stringify({ atual: el.querySelector('#s-atual').value, nova: el.querySelector('#s-nova').value }) });
        msg = r.ok ? 'Senha trocada.' : r.d.erro;
        render();
      };
      render();
    },
  };
}
