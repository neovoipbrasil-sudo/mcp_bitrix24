// Grava um pedido no Bitrix24: encontra (ou cria) cliente, converte o lead e cria os cards.
// Um pedido gera vários negócios no mesmo pipeline e com o mesmo responsável:
//   1 card Neo Vox, 1 card Neo Phone e 1 card por bloco de portabilidade,
// todos com ORIGIN_ID = id do pedido (ORIGINATOR_ID = "formulario-pedidos") para ficarem ligados.
import { F, BUSCA, PIPELINES, ORIGINATOR_ID } from './bitrix-fields.js';
import { onlyDigits, mask, phoneDigits } from './shared/validators.js';
import { brl, contarNumerosPortabilidade } from './shared/pricing.js';

const simNao = (v) => (v ? 'Sim' : 'Não');
const pct = (n) => `${Number(n || 0)}%`;
const fid = (m) => (m ? `${m} meses` : 'Sem Fidelidade (Faz Recargas)');
const PRODUTOS_LABEL = {
  ambos: 'Linhas Telefônicas + Ramais (Neo Vox + Neo Phone)',
  vox: 'Somente Linhas Telefônicas (Neo Vox)',
  phone: 'Somente Ramais (Neo Phone)',
};

const r = async (client, method, params) => (await client.call(method, params)).result;

function splitName(nome) {
  const parts = String(nome || '').trim().split(/\s+/);
  return { NAME: parts.shift() || '', LAST_NAME: parts.join(' ') };
}

const comms = (celular, email) => ({
  ...(celular ? { PHONE: [{ VALUE: phoneDigits(celular), VALUE_TYPE: 'WORK' }] } : {}),
  ...(email ? { EMAIL: [{ VALUE: String(email).trim(), VALUE_TYPE: 'WORK' }] } : {}),
});

const fileValues = (arquivos) => (arquivos || []).map((a) => ({ fileData: [a.nome, a.base64] }));

function setPessoa(fields, map, p) {
  if (!map || !p) return;
  if (map.nome) fields[map.nome] = p.nome || '';
  if (map.celular) fields[map.celular] = phoneDigits(p.celular);
  if (map.email) fields[map.email] = p.email || '';
}

function setEndereco(fields, map, e) {
  if (!e) return;
  for (const k of ['logradouro', 'numero', 'bairro', 'complemento', 'cidade']) fields[map[k]] = e[k] || '';
  fields[map.cep] = mask.cep(e.cep);
  fields[map.uf] = String(e.uf || '').toUpperCase();
}

// ---------------------------------------------------------------- busca de cliente

async function findRequisite(client, { entityTypeId, field, doc }) {
  const values = [onlyDigits(doc), entityTypeId === 4 ? mask.cnpj(doc) : mask.cpf(doc)];
  for (const v of values) {
    const list = await r(client, 'crm.requisite.list', { filter: { ENTITY_TYPE_ID: entityTypeId, [field]: v }, select: ['ID', 'ENTITY_ID'] });
    if (list?.length) return Number(list[0].ENTITY_ID);
  }
  return null;
}

async function findByUf(client, entity, fields, doc, extraFilter = {}) {
  const values = [onlyDigits(doc), doc.length === 14 || onlyDigits(doc).length === 14 ? mask.cnpj(doc) : mask.cpf(doc)];
  for (const f of fields) {
    for (const v of values) {
      const list = await r(client, `crm.${entity}.list`, { filter: { [f]: v, ...extraFilter }, select: ['ID'], order: { ID: 'DESC' } });
      if (list?.length) return Number(list[0].ID);
    }
  }
  return null;
}

async function findDuplicate(client, entityType, { celular, email }) {
  for (const [type, value] of [['PHONE', celular && phoneDigits(celular)], ['EMAIL', email]]) {
    if (!value) continue;
    const res = await r(client, 'crm.duplicate.findbycomm', { entity_type: entityType, type, values: [value] });
    const ids = res?.[entityType];
    if (ids?.length) return Number(ids[ids.length - 1]);
  }
  return null;
}

export async function buscarCliente(client, { tipo, doc }) {
  const d = onlyDigits(doc);
  const out = { tipo, contactId: null, companyId: null, leadId: null };
  if (tipo === 'PJ') {
    out.companyId = (await findRequisite(client, { entityTypeId: 4, field: 'RQ_CNPJ', doc: d })) || (await findByUf(client, 'company', BUSCA.companyCnpj, d));
    out.leadId = await findByUf(client, 'lead', BUSCA.leadCnpj, d, { '!STATUS_ID': ['CONVERTED', 'JUNK'] });
  } else {
    out.contactId = await findRequisite(client, { entityTypeId: 3, field: 'RQ_CPF', doc: d });
    out.leadId = await findByUf(client, 'lead', BUSCA.leadCpf, d, { '!STATUS_ID': ['CONVERTED', 'JUNK'] });
  }
  return out;
}

// ---------------------------------------------------------------- criação de cliente

async function addAddressToRequisite(client, requisiteId, e) {
  if (!e) return;
  await r(client, 'crm.address.add', {
    fields: {
      TYPE_ID: 6, ENTITY_TYPE_ID: 8, ENTITY_ID: requisiteId,
      ADDRESS_1: [e.logradouro, e.numero].filter(Boolean).join(', '),
      ADDRESS_2: [e.complemento, e.bairro].filter(Boolean).join(' - '),
      CITY: e.cidade, PROVINCE: String(e.uf || '').toUpperCase(), POSTAL_CODE: mask.cep(e.cep), COUNTRY: 'Brasil',
    },
  });
}

async function criarClientePJ(client, pj, assignedById) {
  const companyId = await r(client, 'crm.company.add', {
    fields: {
      TITLE: pj.razaoSocial, COMPANY_TYPE: 'CUSTOMER', ASSIGNED_BY_ID: assignedById, [BUSCA.companyCnpj[0]]: mask.cnpj(pj.cnpj),
      ...comms(pj.socios?.[0]?.celular, pj.socios?.[0]?.email),
    },
  });
  const reqId = await r(client, 'crm.requisite.add', {
    fields: {
      ENTITY_TYPE_ID: 4, ENTITY_ID: companyId, PRESET_ID: BUSCA.presetPJ, NAME: pj.razaoSocial, ACTIVE: 'Y',
      RQ_CNPJ: mask.cnpj(pj.cnpj), RQ_COMPANY_NAME: pj.razaoSocial,
      RQ_STATE_REG: pj.indicadorIE === 'Contribuinte' ? pj.inscricaoEstadual : pj.indicadorIE, RQ_MNPL_REG: pj.inscricaoMunicipal || '',
    },
  });
  await addAddressToRequisite(client, reqId, pj.endereco);
  return Number(companyId);
}

async function criarContato(client, p, { assignedById, companyId = null, cpf = null, endereco = null }) {
  const fields = { ...splitName(p.nome), ASSIGNED_BY_ID: assignedById, ...comms(p.celular, p.email) };
  if (companyId) fields.COMPANY_ID = companyId;
  if (p.nascimento) {
    const [dd, mm, yyyy] = p.nascimento.split('/');
    fields.BIRTHDATE = `${yyyy}-${mm}-${dd}`;
  }
  const contactId = Number(await r(client, 'crm.contact.add', { fields }));
  if (cpf) {
    const reqId = await r(client, 'crm.requisite.add', {
      fields: {
        ENTITY_TYPE_ID: 3, ENTITY_ID: contactId, PRESET_ID: BUSCA.presetPF, NAME: p.nome, ACTIVE: 'Y',
        RQ_CPF: mask.cpf(cpf), ...Object.fromEntries(Object.entries(splitName(p.nome)).map(([k, v]) => [k === 'NAME' ? 'RQ_FIRST_NAME' : 'RQ_LAST_NAME', v])),
      },
    });
    await addAddressToRequisite(client, reqId, endereco);
  }
  return contactId;
}

// ---------------------------------------------------------------- campos dos cards

function camposComuns({ pedido, calculo, origemInfo }) {
  const f = {};
  const c = pedido.cliente;
  f[F.tipoCliente] = c.tipo === 'PF' ? 'Pessoa Física (CPF)' : 'Pessoa Jurídica (CNPJ)';
  f[F.produtos] = PRODUTOS_LABEL[pedido.produtos];

  const o = pedido.origem;
  if (o.tipo === 'revenda') {
    f[F.revendaCnpj] = mask.cnpj(o.cnpj);
    f[F.revendaRazao] = origemInfo.nome;
    f[F.revendaRespNome] = o.nome;
    f[F.revendaRespCelular] = phoneDigits(o.celular);
    f[F.revendaRespEmail] = o.email;
  } else {
    f[F.vendedor] = o.nome;
  }

  const k = c.contatos;
  if (c.tipo === 'PF') {
    const p = c.pf;
    f[F.pf.nome] = p.nome; f[F.pf.cpf] = mask.cpf(p.cpf); f[F.pf.nascimento] = p.nascimento;
    f[F.pf.celular] = phoneDigits(p.celular); f[F.pf.email] = p.email;
    setEndereco(f, F.pf.end, p.endereco);
    for (const papel of ['gestor', 'financeiro', 'tecnico', 'testemunha']) setPessoa(f, F.pf[papel], k[papel]);
  } else {
    const j = c.pj;
    f[F.pj.cnpj] = mask.cnpj(j.cnpj); f[F.pj.razaoSocial] = j.razaoSocial; f[F.pj.nomeFantasia] = j.nomeFantasia;
    f[F.pj.dataFundacao] = j.dataFundacao; f[F.pj.indicadorIE] = j.indicadorIE;
    f[F.pj.inscricaoEstadual] = j.indicadorIE === 'Contribuinte' ? j.inscricaoEstadual : '';
    f[F.pj.inscricaoMunicipal] = j.inscricaoMunicipal; f[F.pj.simples] = j.simples; f[F.pj.retencaoISS] = j.retencaoISS;
    const [principal, ...outros] = j.socios;
    f[F.pj.socio.nome] = principal.nome; f[F.pj.socio.cpf] = mask.cpf(principal.cpf); f[F.pj.socio.nascimento] = principal.nascimento;
    f[F.pj.socio.celular] = phoneDigits(principal.celular); f[F.pj.socio.email] = principal.email;
    f[F.pj.maisDeUmSocio] = simNao(outros.length);
    f[F.pj.outrosSocios] = outros.map((s, i) => `Sócio ${i + 2}: ${s.nome} | CPF ${mask.cpf(s.cpf)} | Nasc. ${s.nascimento} | ${phoneDigits(s.celular)} | ${s.email}`).join('\n');
    setEndereco(f, F.pj.end, j.endereco);
    for (const papel of ['gestor', 'financeiro', 'tecnico', 'testemunha']) setPessoa(f, F.pj[papel], k[papel]);
  }

  const z = pedido.conclusao;
  f[F.vencimento] = String(z.vencimento);
  f[F.instalacao] = z.instalacao === 'remota' ? 'Remoto (Todo o Brasil)' : 'Presencial (Consultar Disponibilidade)';
  f[F.valorInstalacao] = brl(calculo.instalacao);
  f[F.observacoes] = z.observacoes;
  setEndereco(f, F.inst, z.endereco);

  const docs = fileValues(pedido.arquivos?.documentos);
  if (docs.length) f[c.tipo === 'PF' ? F.arqDocumentoPF : F.arqDocumentosGerais] = docs;
  return f;
}

function camposVox(calculo, pedido) {
  const v = calculo.vox;
  const f = {};
  const isPre = v.categoria === 'pre';
  f[F.vox.tarifacao] = isPre ? 'Pré-Pago (Tarifado/Ilimitado)' : v.categoria === 'pos' ? 'Pós-Pago (Tarifado)' : 'Pré-Pago (Tarifado/Ilimitado)';
  f[F.vox.fidelizacao] = fid(v.fidelidade);
  f[F.vox.linhas] = String(v.linhas);
  f[F.vox.plano] = v.plano;
  if (isPre) f[F.vox.pacoteRecarga] = brl(v.precoCheio);
  if (v.tarifas) {
    f[F.vox.tarifaLocalFixo] = brl(v.tarifas.fixoLocal ?? v.tarifas.local);
    f[F.vox.tarifaLdnFixo] = brl(v.tarifas.fixoLDN ?? v.tarifas.ldn);
    f[F.vox.tarifaLocalMovel] = brl(v.tarifas.movelLocal ?? v.tarifas.vc);
    f[F.vox.tarifaLdnMovel] = brl(v.tarifas.movelLDN ?? v.tarifas.vc);
  }
  f[F.vox.valorLinha] = brl(v.precoCheio);
  f[F.vox.valorTotal] = brl(v.totalLinhasCheio);
  f[F.vox.descontoPct] = pct(v.descontoPercent);
  f[F.vox.descontoRs] = brl(v.descontoMensal);
  f[F.vox.valorTotalComDesconto] = brl(v.totalLinhas);
  f[F.vox.totalDesconto] = brl(v.descontoMensal * (v.fidelidade || 1));
  f[F.vox.ativacaoPre] = brl(v.ativacao);
  f[F.vox.ddd] = String(v.ddd);
  f[F.vox.cfop] = v.cfop;
  f[F.vox.querAdicional] = simNao(v.adicionais.quantidade);
  f[F.vox.qtdAdicional] = String(v.adicionais.quantidade);
  f[F.vox.valorAdicional] = brl(v.adicionais.precoUnit);
  f[F.vox.totalAdicional] = brl(v.adicionais.total);
  f[F.vox.totalLinhasContratadas] = String(v.totalNumeros);
  f[F.vox.querPortabilidade] = simNao((pedido.portabilidades || []).length);
  return f;
}

function camposPhone(calculo) {
  const p = calculo.phone;
  const f = {};
  f[F.phone.fidelizacao] = fid(p.fidelidade);
  f[F.phone.licencasEscolhidas] = p.itens.filter((i) => i.quantidade).map((i) => i.nome).join(', ');
  for (const i of p.itens) {
    const m = F.phone[i.id];
    if (!m) continue;
    f[m.qtd] = String(i.quantidade); f[m.unit] = brl(i.precoCheio); f[m.total] = brl(i.totalCheio);
    f[m.pct] = pct(i.descontoPercent); f[m.rs] = brl(i.totalCheio - i.total);
  }
  f[F.phone.totalComDesconto] = brl(p.mensal);
  f[F.phone.somaLicencas] = String(p.totalRamais);
  f[F.phone.somaBasicStandard] = String(p.licencasComGravacao);
  f[F.phone.gravacao] = p.gravacao ? `${p.gravacao.nome}${p.gravacao.precoUnit ? ` = ${brl(p.gravacao.precoUnit)}` : ''}` : '';
  f[F.phone.pacotesGravacao] = String(p.gravacao?.pacotes || 0);
  f[F.phone.totalGravacao] = brl(p.gravacao?.total || 0);
  f[F.phone.discador] = p.discador ? `Com Discador Automático Mensal = ${brl(p.discador)}` : 'Sem Discador Automático Mensal = R$ 0,00';
  f[F.phone.grupoCallCenter] = p.grupoCallCenter ? `Com Grupo Call Center = ${brl(p.grupoCallCenter)}` : 'Sem Grupo Call Center = R$ 0,00';
  return f;
}

function camposPortabilidade(bloco, pedido, calculo) {
  const f = {};
  const qtd = contarNumerosPortabilidade(bloco);
  const unit = calculo.portabilidade.precoUnit;
  f[F.port.cidade] = bloco.cidade;
  f[F.port.uf] = String(bloco.uf).toUpperCase();
  f[F.port.operadora] = bloco.operadora === 'Outra' ? bloco.operadoraOutra : bloco.operadora;
  f[F.port.quantidade] = String(qtd);
  f[F.port.valorNumero] = brl(unit);
  f[F.port.valorTotal] = brl(qtd * unit);
  if (bloco.modo === 'faixa') {
    f[F.port.emSequencia] = 'Sim';
    f[F.port.primeiro] = phoneDigits(bloco.faixa.inicio);
    f[F.port.ultimo] = phoneDigits(bloco.faixa.fim);
  } else {
    const nums = bloco.numeros.filter((x) => onlyDigits(x)).map(phoneDigits);
    f[F.port.emSequencia] = 'Não';
    if (nums.length === 1) f[F.port.numeroUnico] = nums[0];
    f[F.port.numeros] = nums.join('\n');
  }
  const t = titularEfetivo(bloco, pedido);
  f[F.port.titularTipo] = t.tipo === 'PF' ? 'Pessoa Física (CPF)' : 'Pessoa Jurídica (CNPJ)';
  if (t.tipo === 'PF') {
    f[F.port.mesmoCliente] = simNao(bloco.titular?.mesmoCliente);
    f[F.port.titularNome] = t.pf.nome; f[F.port.titularCpf] = mask.cpf(t.pf.cpf);
    f[F.port.titularCelular] = phoneDigits(t.pf.celular); f[F.port.titularEmail] = t.pf.email;
  } else {
    f[F.port.mesmaEmpresa] = simNao(bloco.titular?.mesmoCliente);
    f[F.port.empresaCnpj] = mask.cnpj(t.pj.cnpj); f[F.port.empresaRazao] = t.pj.razaoSocial; f[F.port.empresaFundacao] = t.pj.dataFundacao;
    f[F.port.empresaIndicadorIE] = t.pj.indicadorIE; f[F.port.empresaIE] = t.pj.inscricaoEstadual || ''; f[F.port.empresaIM] = t.pj.inscricaoMunicipal || '';
  }
  f[F.port.tecnicoNome] = bloco.tecnico.nome;
  f[F.port.tecnicoCelular] = phoneDigits(bloco.tecnico.celular);
  f[F.port.tecnicoEmail] = bloco.tecnico.email;
  const faturas = fileValues(bloco.fatura);
  if (faturas.length) f[F.arqUltimaFatura] = faturas;
  return f;
}

// Vários blocos de portabilidade do mesmo estado num card só: campos do 1º bloco (titular, técnico)
// e cidades, operadoras e números de todos os blocos.
const operadoraDe = (b) => (b.operadora === 'Outra' ? b.operadoraOutra : b.operadora);
const unicos = (xs) => [...new Set(xs.filter(Boolean))];
function numerosDoBloco(b) {
  if (b.modo === 'faixa') return [`${phoneDigits(b.faixa.inicio)} a ${phoneDigits(b.faixa.fim)}`];
  return b.numeros.filter((x) => onlyDigits(x)).map(phoneDigits);
}

function camposPortabilidadeGrupo(blocos, pedido, calculo) {
  const f = camposPortabilidade(blocos[0], pedido, calculo);
  if (blocos.length === 1) return f;
  const qtd = blocos.reduce((a, b) => a + contarNumerosPortabilidade(b), 0);
  f[F.port.cidade] = unicos(blocos.map((b) => b.cidade)).join(' / ');
  f[F.port.operadora] = unicos(blocos.map(operadoraDe)).join(' / ');
  f[F.port.quantidade] = String(qtd);
  f[F.port.valorTotal] = brl(qtd * calculo.portabilidade.precoUnit);
  f[F.port.emSequencia] = 'Não';
  f[F.port.numeroUnico] = '';
  f[F.port.primeiro] = '';
  f[F.port.ultimo] = '';
  f[F.port.numeros] = blocos.map((b) => `${b.cidade} – ${operadoraDe(b)}:\n${numerosDoBloco(b).join('\n')}`).join('\n\n');
  const faturas = blocos.flatMap((b) => fileValues(b.fatura));
  if (faturas.length) f[F.arqUltimaFatura] = faturas;
  return f;
}

// Agrupa a portabilidade por estado. O grupo do mesmo estado do endereço de instalação vai no card
// Neo Vox; cada outro estado vira um card próprio.
export function agruparPortabilidade(pedido, { temVox }) {
  const ufInstalacao = String(pedido.conclusao?.endereco?.uf || '').toUpperCase();
  const porUf = new Map();
  for (const b of pedido.portabilidades || []) {
    const uf = String(b.uf || '').toUpperCase();
    if (!porUf.has(uf)) porUf.set(uf, []);
    porUf.get(uf).push(b);
  }
  const noCardVox = temVox && porUf.has(ufInstalacao) ? porUf.get(ufInstalacao) : [];
  const separados = [...porUf.entries()].filter(([uf]) => !(temVox && uf === ufInstalacao)).map(([uf, blocos]) => ({ uf, blocos }));
  return { noCardVox, separados };
}

// ---------------------------------------------------------------- linhas de produto (aba Produtos do card)
// PRICE é o preço final por unidade (já com desconto); o preço cheio fica em DISCOUNT_SUM/DISCOUNT_RATE.
// Sem produto associado no catálogo, a linha entra só com nome e preço (PRODUCT_ID 0).
function linha({ produtoId, nome, quantidade, precoCheio, precoFinal }) {
  const cheio = Number(precoCheio ?? precoFinal);
  const final = Number(precoFinal);
  const desconto = Math.max(0, Math.round((cheio - final) * 100) / 100);
  return {
    PRODUCT_ID: Number(produtoId) || 0,
    PRODUCT_NAME: nome,
    PRICE: final,
    QUANTITY: Number(quantidade),
    DISCOUNT_TYPE_ID: desconto ? 2 : 1,
    DISCOUNT_RATE: desconto && cheio ? Math.round((desconto / cheio) * 10000) / 100 : 0,
    DISCOUNT_SUM: desconto,
    MEASURE_CODE: 796, // unidade (peça)
  };
}

export function linhasProdutos(tipo, { catalogo, calculo, blocos = [], comInstalacao, pedido }) {
  const pb = catalogo.produtosBitrix || {};
  const rows = [];
  if (tipo === 'vox') {
    const v = calculo.vox;
    const plano = catalogo.planosVox.find((p) => p.id === v.planoId);
    rows.push(linha({ produtoId: plano?.bitrixProdutoId, nome: v.plano, quantidade: v.linhas, precoCheio: v.precoCheio, precoFinal: v.precoUnit }));
    if (v.adicionais.quantidade) rows.push(linha({ produtoId: pb.numeroAdicional, nome: 'DID/DDR Adicional', quantidade: v.adicionais.quantidade, precoFinal: v.adicionais.precoUnit }));
    if (v.ativacao) rows.push(linha({ produtoId: pb.ativacao, nome: 'Ativação de Linhas Neo Vox', quantidade: v.linhas, precoFinal: v.ativacao / v.linhas }));
  }
  if (tipo === 'phone') {
    const p = calculo.phone;
    for (const i of p.itens.filter((x) => x.quantidade)) {
      const lic = catalogo.licencasPhone.find((l) => l.id === i.id);
      rows.push(linha({ produtoId: lic?.bitrixProdutoIds?.[String(p.fidelidade)], nome: `Neo Phone ${i.nome} — ${p.fidelidade} meses`, quantidade: i.quantidade, precoCheio: i.precoCheio, precoFinal: i.precoUnit }));
    }
    if (p.gravacao?.pacotes) {
      const g = catalogo.gravacao.find((x) => x.id === p.gravacao.id);
      rows.push(linha({ produtoId: g?.bitrixProdutoId, nome: `Gravação de Chamadas — ${p.gravacao.nome}`, quantidade: p.gravacao.pacotes, precoFinal: p.gravacao.precoUnit }));
    }
    if (p.discador) rows.push(linha({ produtoId: pb.discador, nome: 'Discador Automático', quantidade: 1, precoFinal: p.discador }));
    if (p.grupoCallCenter) rows.push(linha({ produtoId: pb.grupoCallCenter, nome: 'Grupo Call Center', quantidade: 1, precoFinal: p.grupoCallCenter }));
  }
  // Portabilidade: no card próprio (tipo 'portabilidade') ou junto no card Neo Vox (blocos do mesmo estado).
  const qtdPort = blocos.reduce((a, b) => a + contarNumerosPortabilidade(b), 0);
  if (qtdPort) rows.push(linha({ produtoId: pb.portabilidade, nome: 'Portabilidade de Números', quantidade: qtdPort, precoFinal: calculo.portabilidade.precoUnit }));
  if (comInstalacao && calculo.instalacao) {
    const remota = pedido.conclusao.instalacao === 'remota';
    rows.push(linha({ produtoId: remota ? pb.instalacaoRemota : pb.instalacaoPresencial, nome: remota ? 'Instalação Remota' : 'Instalação Presencial', quantidade: 1, precoFinal: calculo.instalacao }));
  }
  return rows;
}

const somaLinhas = (rows) => Math.round(rows.reduce((a, r) => a + r.PRICE * r.QUANTITY, 0) * 100) / 100;

// "Mesmos dados do cliente": o titular da linha é o próprio cliente do pedido.
export function titularEfetivo(bloco, pedido) {
  if (!bloco.titular?.mesmoCliente) return bloco.titular;
  const c = pedido.cliente;
  if (c.tipo === 'PF') return { tipo: 'PF', pf: { nome: c.pf.nome, cpf: c.pf.cpf, celular: c.pf.celular, email: c.pf.email } };
  return { tipo: 'PJ', pj: { cnpj: c.pj.cnpj, razaoSocial: c.pj.razaoSocial, dataFundacao: c.pj.dataFundacao, indicadorIE: c.pj.indicadorIE, inscricaoEstadual: c.pj.inscricaoEstadual, inscricaoMunicipal: c.pj.inscricaoMunicipal } };
}

// ---------------------------------------------------------------- envio

// aoCriarCard(card) é chamado a cada negócio criado, para registrar cards parciais se algo falhar no meio.
export async function enviarPedidoAoBitrix({ client, catalogo, pedido, calculo, pedidoId, resumoTexto, portalHost, aoCriarCard = () => {} }) {
  const o = pedido.origem;
  const origemInfo = (o.tipo === 'revenda' ? catalogo.revendas : catalogo.vendedores).find((x) => x.id === o.id);
  const assignedById = Number(origemInfo.bitrixUserId);
  const pipe = PIPELINES[o.tipo];
  const c = pedido.cliente;
  const nomeCliente = c.tipo === 'PF' ? c.pf.nome : c.pj.razaoSocial;

  // 1. Cliente: reaproveita o que já existe; cria só o que falta.
  const achado = await buscarCliente(client, { tipo: c.tipo, doc: c.tipo === 'PF' ? c.pf.cpf : c.pj.cnpj });
  let { contactId, companyId } = achado;
  const criados = { contato: false, empresa: false };
  if (c.tipo === 'PJ') {
    if (!companyId) { companyId = await criarClientePJ(client, c.pj, assignedById); criados.empresa = true; }
    const socio = c.pj.socios[0];
    contactId = await findDuplicate(client, 'CONTACT', socio);
    if (!contactId) { contactId = await criarContato(client, socio, { assignedById, companyId }); criados.contato = true; }
  } else if (!contactId) {
    contactId = await findDuplicate(client, 'CONTACT', c.pf);
    if (!contactId) { contactId = await criarContato(client, c.pf, { assignedById, cpf: c.pf.cpf, endereco: c.pf.endereco }); criados.contato = true; }
  }
  let leadId = achado.leadId;
  if (!leadId) {
    const contato = c.tipo === 'PF' ? c.pf : c.pj.socios[0];
    const dup = await findDuplicate(client, 'LEAD', contato);
    if (dup) {
      const lead = await r(client, 'crm.lead.get', { id: dup });
      if (lead && !['CONVERTED', 'JUNK'].includes(lead.STATUS_ID)) leadId = dup;
    }
  }

  // 2. Cards
  const comuns = camposComuns({ pedido, calculo, origemInfo });
  const base = {
    CATEGORY_ID: pipe.categoryId, STAGE_ID: pipe.stageId, ASSIGNED_BY_ID: assignedById,
    CONTACT_ID: contactId, ...(companyId ? { COMPANY_ID: companyId } : {}),
    SOURCE_ID: 'WEBFORM', ORIGINATOR_ID: ORIGINATOR_ID, ORIGIN_ID: pedidoId, CURRENCY_ID: 'BRL',
    COMMENTS: `Pedido ${pedidoId} enviado pelo formulário por ${o.nome} (${o.tipo === 'revenda' ? 'revenda' : 'vendedor'}).${leadId ? ` Lead de origem: #${leadId}.` : ''}`,
  };
  const cards = [];
  // O valor do negócio é a soma das linhas de produto (mensalidades + cobranças únicas).
  const addDeal = async (tipo, titulo, campos, rows) => {
    const id = Number(await r(client, 'crm.deal.add', {
      fields: { ...base, ...comuns, ...campos, TITLE: `Pedido ${pedidoId} – ${titulo} – ${nomeCliente}`, OPPORTUNITY: somaLinhas(rows) },
      params: { REGISTER_SONET_EVENT: 'Y' },
    }));
    if (rows.length) await r(client, 'crm.deal.productrows.set', { id, rows });
    const card = { id, tipo, titulo, url: portalHost ? `https://${portalHost}/crm/deal/details/${id}/` : null };
    cards.push(card);
    aoCriarCard(card);
    return id;
  };

  // A instalação entra uma vez só: no card Neo Vox ou, sem linhas, no card Neo Phone.
  const ctx = { catalogo, calculo, pedido };
  const { noCardVox, separados } = agruparPortabilidade(pedido, { temVox: !!calculo.vox });
  if (calculo.vox) {
    const campos = { ...camposVox(calculo, pedido), ...(noCardVox.length ? camposPortabilidadeGrupo(noCardVox, pedido, calculo) : {}) };
    await addDeal('vox', noCardVox.length ? 'Neo Vox + Portabilidade' : 'Neo Vox', campos, linhasProdutos('vox', { ...ctx, blocos: noCardVox, comInstalacao: true }));
  }
  if (calculo.phone) {
    await addDeal('phone', 'Neo Phone', camposPhone(calculo), linhasProdutos('phone', { ...ctx, comInstalacao: !calculo.vox }));
  }
  for (const { uf, blocos } of separados) {
    const detalhe = `${unicos(blocos.map((b) => b.cidade)).join(', ')}/${uf} – ${unicos(blocos.map(operadoraDe)).join(', ')}`;
    await addDeal('portabilidade', `Portabilidade ${uf} (${detalhe})`,
      { ...camposVox(calculo, pedido), ...camposPortabilidadeGrupo(blocos, pedido, calculo) }, linhasProdutos('portabilidade', { ...ctx, blocos }));
  }

  // 3. Resumo na timeline de cada card, com links para os outros cards do mesmo pedido.
  const links = cards.map((k) => `• ${k.titulo}: [URL=/crm/deal/details/${k.id}/]negócio #${k.id}[/URL]`).join('\n');
  for (const k of cards) {
    await r(client, 'crm.timeline.comment.add', {
      fields: { ENTITY_ID: k.id, ENTITY_TYPE: 'deal', COMMENT: `Pedido ${pedidoId} — cards deste pedido:\n${links}\n\n${resumoTexto}` },
    });
  }

  // 4. Lead encontrado: marcado como convertido e ligado ao contato/empresa e aos cards.
  if (leadId) {
    await r(client, 'crm.lead.update', { id: leadId, fields: { STATUS_ID: 'CONVERTED', CONTACT_ID: contactId, ...(companyId ? { COMPANY_ID: companyId } : {}) } });
    await r(client, 'crm.timeline.comment.add', {
      fields: { ENTITY_ID: leadId, ENTITY_TYPE: 'lead', COMMENT: `Lead convertido pelo formulário de pedidos (pedido ${pedidoId}):\n${links}` },
    });
  }

  return { pedidoId, cards, contactId, companyId, leadId, criados };
}
