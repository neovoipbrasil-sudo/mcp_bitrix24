// Resumo do pedido em linhas (título, valor). Usado na tela de revisão, no e-mail e na
// timeline dos cards do Bitrix24. Isomórfico.
import { brl, contarNumerosPortabilidade } from './pricing.js';
import { mask } from './validators.js';

const PRODUTOS = { ambos: 'Neo Vox + Neo Phone', vox: 'Somente Neo Vox (linhas)', phone: 'Somente Neo Phone (ramais)' };

export function montarResumo(pedido, calculo) {
  const s = [];
  const add = (titulo, linhas) => s.push({ titulo, linhas: linhas.filter(Boolean) });
  const o = pedido.origem || {};
  const c = pedido.cliente || {};

  add('Quem enviou', [[o.tipo === 'revenda' ? 'Revenda' : 'Vendedor', o.nome], o.tipo === 'revenda' && ['CNPJ da revenda', mask.cnpj(o.cnpj)], ['E-mail', o.email], ['Celular', mask.phone(o.celular)]]);

  if (c.tipo === 'PF') {
    add('Cliente (Pessoa Física)', [['Nome', c.pf?.nome], ['CPF', mask.cpf(c.pf?.cpf)], ['Celular', mask.phone(c.pf?.celular)], ['E-mail', c.pf?.email]]);
  } else if (c.tipo === 'PJ') {
    add('Cliente (Pessoa Jurídica)', [
      ['Razão social', c.pj?.razaoSocial], ['CNPJ', mask.cnpj(c.pj?.cnpj)], ['Nome fantasia', c.pj?.nomeFantasia],
      ['Sócio(s)', (c.pj?.socios || []).map((x) => x.nome).join(', ')],
    ]);
  }

  add('Produtos', [['Escolha', PRODUTOS[pedido.produtos]], pedido.fidelidade && ['Fidelidade', `${pedido.fidelidade} meses`]]);

  const v = calculo.vox;
  if (v) {
    add('Neo Vox', [
      ['Plano', v.plano],
      ['Linhas', `${v.linhas} × ${brl(v.precoUnit)}${v.descontoPercent ? ` (cheio ${brl(v.precoCheio)}, ${v.descontoPercent}% de desconto)` : ''}`],
      v.adicionais.quantidade && ['Números adicionais', `${v.adicionais.quantidade} × ${brl(v.adicionais.precoUnit)}`],
      ['DDD / CFOP', `${v.ddd ?? '-'} / ${v.cfop ?? '-'}`],
      v.ativacao && ['Ativação (cobrança única)', `${v.linhas} × ${brl(v.ativacao / v.linhas)} = ${brl(v.ativacao)}`],
      ['Mensal Neo Vox', brl(v.mensal)],
    ]);
  }
  (pedido.portabilidades || []).forEach((b, i) => {
    const op = b.operadora === 'Outra' ? b.operadoraOutra : b.operadora;
    add(`Portabilidade ${i + 1}`, [['Origem', `${b.cidade}/${String(b.uf || '').toUpperCase()} – ${op}`], ['Números', String(contarNumerosPortabilidade(b))]]);
  });
  if (calculo.portabilidade) add('Portabilidade (total)', [['Números', String(calculo.portabilidade.numeros)], ['Valor', `${brl(calculo.portabilidade.total)}${calculo.portabilidade.cobranca === 'unica' ? ' (cobrança única)' : ' / mês'}`]]);

  const p = calculo.phone;
  if (p) {
    add('Neo Phone', [
      ...p.itens.filter((i) => i.quantidade).map((i) => [i.nome, `${i.quantidade} × ${brl(i.precoUnit)}`]),
      p.gravacao?.total && ['Gravação extra', `${p.gravacao.pacotes} × ${p.gravacao.nome}`],
      p.discador && ['Discador automático', brl(p.discador)],
      p.grupoCallCenter && ['Grupo Call Center', brl(p.grupoCallCenter)],
      ['Mensal Neo Phone', brl(p.mensal)],
    ]);
  }

  const z = pedido.conclusao || {};
  add('Conclusão', [
    ['Vencimento', z.vencimento ? `Dia ${z.vencimento}` : null],
    ['Instalação', z.instalacao ? `${z.instalacao === 'remota' ? 'Remota' : 'Presencial'} – ${brl(calculo.instalacao)}` : null],
    ['Endereço de instalação', z.endereco ? `${z.endereco.logradouro || ''}, ${z.endereco.numero || ''} – ${z.endereco.cidade || ''}/${z.endereco.uf || ''}` : null],
  ]);

  add('Valores', [['Valor mensal', brl(calculo.mensal)], ['Adesão (cobrança única)', brl(calculo.adesao)], ['Valor total do contrato', brl(calculo.totalContrato)]]);
  return s.map((sec) => ({ ...sec, linhas: sec.linhas.filter((l) => l && l[1] != null && l[1] !== '') }));
}

export function resumoEmTexto(secoes) {
  return secoes.map((s) => `${s.titulo.toUpperCase()}\n${s.linhas.map(([k, v]) => `  ${k}: ${v}`).join('\n')}`).join('\n\n');
}

const esc = (x) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function resumoEmHtml(secoes) {
  return secoes.map((s) => `<h3 style="font:600 13px Arial,sans-serif;margin:18px 0 6px;color:#373435">${esc(s.titulo)}</h3>
<table style="border-collapse:collapse;font:13px Arial,sans-serif;width:100%">${s.linhas.map(([k, v]) =>
  `<tr><td style="padding:4px 8px 4px 0;color:#5c5a5b;width:40%;vertical-align:top">${esc(k)}</td><td style="padding:4px 0;color:#373435">${esc(v)}</td></tr>`).join('')}</table>`).join('');
}

// E-mail com a identidade Neo VoIP (cabeçalho grafite com o nome em branco e ciano). Só HTML com estilos inline.
export function emailHtml({ titulo, introducao, secoes }) {
  return `<div style="background:#f4f5f6;padding:24px 12px;font-family:Montserrat,Arial,sans-serif">
<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border-collapse:collapse">
<tr><td style="background:#373435;padding:18px 24px;border-bottom:3px solid #00AFEF">
<span style="font:800 20px Arial,sans-serif;letter-spacing:4px;color:#ffffff">NEO</span><span style="font:800 20px Arial,sans-serif;letter-spacing:4px;color:#00AFEF">VOIP</span>
<div style="font:600 9px Arial,sans-serif;letter-spacing:3px;color:#96989A;margin-top:4px">TELECOM CLOUD</div></td></tr>
<tr><td style="padding:20px 24px">
<h2 style="font:800 18px Arial,sans-serif;color:#373435;margin:0 0 6px">${esc(titulo)}</h2>
<p style="font:14px Arial,sans-serif;color:#373435;margin:0 0 8px">${introducao}</p>
${resumoEmHtml(secoes)}
</td></tr>
<tr><td style="padding:14px 24px;background:#f4f5f6;font:12px Arial,sans-serif;color:#96989A">E-mail automático do Formulário de Pedidos · Neo VoIP</td></tr>
</table></div>`;
}
