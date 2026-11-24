import { describe, it, expect, vi } from 'vitest';
import { readFileSync, mkdtempSync } from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';
import { isValidCPF, isValidCNPJ, isValidPhone, mask, phoneDigits, phoneCrm, validateValue, isValidDate } from './shared/validators.js';
import { calcularPedido, resolverPlanoVox, contarNumerosPortabilidade, tiposVoxDisponiveis } from './shared/pricing.js';
import { validarPedido } from './shared/validate-order.js';
import { createCatalogStore } from './catalog-store.js';
import { createPedidosRouter } from './router.js';
import { createPedidosStore } from './pedidos-store.js';
import { createReportUserStore } from '../reports/report-users.js';
import { enviarPedidoAoBitrix } from './bitrix-order.js';
import { F } from './bitrix-fields.js';

// Pessoas fictícias: o catálogo padrão não traz vendedores/revendas reais (repositório público).
const catalogo = {
  ...JSON.parse(readFileSync(new URL('./catalogo-padrao.json', import.meta.url), 'utf-8')),
  vendedores: [{ id: 'v1', nome: 'Vendedor Teste', email: 'vendedor@exemplo.com.br', celular: '5561900000001', bitrixUserId: 762, ativo: true }],
  revendas: [{ id: 'r1', nome: 'Revenda Teste', cnpj: '11222333000181', email: 'revenda@exemplo.com.br', celular: '5561900000002', responsavelNome: 'Gerente', bitrixUserId: 500, ativo: true }],
  precosEspeciais: [{ revendaCnpj: '11222333000181', planoId: 'pre-1', preco: 39.9 }],
};
const arquivo = [{ nome: 'doc.pdf', tipo: 'application/pdf', base64: Buffer.from('%PDF-1.4 teste').toString('base64') }];
const end = { cep: '70714-020', logradouro: 'SCN Quadra 4', numero: '702', complemento: '', bairro: 'Asa Norte', cidade: 'Brasília', uf: 'DF' };
const pess = (n) => ({ nome: n, celular: '+55 (61) 9 9999-0000', email: 'teste@empresa.com.br' });

function pedidoPJ(over = {}) {
  return {
    origem: { tipo: 'vendedor', id: 'v1', nome: 'Vendedor Teste', email: 'vendedor@exemplo.com.br', celular: '5561900000001', cnpj: '' },
    cliente: {
      tipo: 'PJ',
      pj: { cnpj: '11.222.333/0001-81', razaoSocial: 'Empresa Teste LTDA', nomeFantasia: 'Teste', dataFundacao: '01/02/2010', indicadorIE: 'Não Contribuinte', inscricaoEstadual: '', inscricaoMunicipal: '', simples: 'Sim', retencaoISS: 'Não',
        socios: [{ nome: 'Fulano de Tal', cpf: '529.982.247-25', nascimento: '10/10/1980', celular: '5561999990000', email: 'fulano@empresa.com.br' }], endereco: end },
      contatos: { gestor: pess('Gestor'), financeiro: pess('Fin'), tecnico: pess('Tec'), testemunha: { nome: 'Testemunha', email: 't@empresa.com.br' } },
    },
    produtos: 'ambos',
    fidelidade: 24,
    vox: { tipoId: 'full', linhas: 30, ddd: '61', adicionais: { quer: true, quantidade: 2 } },
    portabilidades: [],
    phone: { licencas: { essentials: 2, basic: 1, standard: 0 }, gravacao: { id: '1a', pacotes: 1 }, discador: false, grupoCallCenter: false },
    conclusao: { vencimento: 10, instalacao: 'remota', observacoes: 'Nada', endereco: end },
    arquivos: { documentos: arquivo },
    ...over,
  };
}

describe('validadores', () => {
  it('valida CPF, CNPJ e telefone com DDI+DDD+9 dígitos', () => {
    expect(isValidCPF('529.982.247-25')).toBe(true);
    expect(isValidCPF('111.111.111-11')).toBe(false);
    expect(isValidCNPJ('11.222.333/0001-81')).toBe(true);
    expect(isValidCNPJ('11.222.333/0001-82')).toBe(false);
    expect(isValidPhone('+55 (61) 9 9999-0000')).toBe(true);
    expect(isValidPhone('+55 (61) 3333-0000')).toBe(false); // 8 dígitos não
    expect(isValidPhone('+55 (20) 9 9999-0000')).toBe(false); // DDD inexistente
  });
  it('máscara de telefone e gravação só com dígitos, sem "+"', () => {
    expect(mask.phone('61999990000')).toBe('+55 (61) 9 9999-0000');
    expect(phoneDigits('+55 (61) 9 9999-0000')).toBe('5561999990000');
  });
  it('datas: inválida, futura e menor de idade', () => {
    expect(isValidDate('31/02/2020')).toBe(false);
    expect(validateValue('birth', '01/01/2020', {})).toMatch(/18 anos/);
    expect(validateValue('email', 'a@gmial.com')).toMatch(/gmail.com/);
  });
});

describe('preços', () => {
  it('escolhe o plano pela fidelidade e quantidade de linhas', () => {
    expect(resolverPlanoVox(catalogo, { tipoId: 'full', fidelidade: 24, linhas: 30 }).plano.id).toBe('full-5');
    expect(resolverPlanoVox(catalogo, { tipoId: 'smart', fidelidade: 12, linhas: 20 }).plano.id).toBe('smart-1');
    expect(resolverPlanoVox(catalogo, { tipoId: 'full-pos', fidelidade: 36, linhas: 3 }).plano.id).toBe('full-pos-3');
  });
  it('planos Partner só para revendas', () => {
    expect(tiposVoxDisponiveis(catalogo, { origemTipo: 'vendedor' }).map((t) => t.id)).not.toContain('partner');
    expect(tiposVoxDisponiveis(catalogo, { origemTipo: 'revenda' }).map((t) => t.id)).toContain('partner');
  });
  it('calcula Neo Vox + Neo Phone com 50% de desconto', () => {
    const c = calcularPedido(catalogo, pedidoPJ());
    expect(c.erros).toEqual([]);
    expect(c.vox.precoUnit).toBe(70.9); // 141,80 com 50%
    expect(c.vox.totalLinhas).toBe(2127);
    expect(c.vox.adicionais.total).toBe(13); // 2 × 6,50 (24 meses)
    expect(c.vox.cfop).toBe('5303');
    // 2 × 19,97 + 1 × 27,97 + gravação 7,97
    expect(c.phone.mensal).toBe(75.88);
    expect(c.instalacao).toBe(50);
    expect(c.totalContrato).toBe(Math.round(((2127 + 13) * 24 + 75.88 * 24 + 50) * 100) / 100);
  });
  it('preço especial de revenda no Pré 1 e ativação por linha', () => {
    const p = pedidoPJ({ origem: { tipo: 'revenda', id: 'r1', cnpj: '11.222.333/0001-81', nome: 'Revenda Teste', email: 'revenda@exemplo.com.br', celular: '5561900000002' }, produtos: 'vox', fidelidade: null, vox: { tipoId: 'pre', planoPreId: 'pre-1', linhas: 2, ddd: '11', adicionais: { quer: false } } });
    const c = calcularPedido(catalogo, p);
    expect(c.vox.precoUnit).toBe(39.9);
    expect(c.vox.ativacao).toBe(50);
    expect(c.vox.cfop).toBe('6303');
  });
  it('ativação de R$ 25 por linha no Pré e no Pós, não no Ilimitado', () => {
    const pos = calcularPedido(catalogo, pedidoPJ({ produtos: 'vox', vox: { tipoId: 'full-pos', linhas: 4, ddd: '61', adicionais: { quer: false } } }));
    expect(pos.vox.ativacao).toBe(100);
    expect(pos.adesao).toBe(150); // 100 ativação + 50 instalação remota
    expect(calcularPedido(catalogo, pedidoPJ()).vox.ativacao).toBe(0);
    const antigo = { ...catalogo, ativacao: undefined, ativacaoPre: 25 };
    expect(calcularPedido(antigo, pedidoPJ({ produtos: 'vox', vox: { tipoId: 'full-pos', linhas: 2, ddd: '61', adicionais: { quer: false } } })).vox.ativacao).toBe(50);
  });
  it('trava de portabilidade e mínimo de ramais / Grupo Call Center', () => {
    const bloco = { modo: 'faixa', faixa: { inicio: '5561933330000', fim: '5561933330049' } };
    expect(contarNumerosPortabilidade(bloco)).toBe(50);
    const c = calcularPedido(catalogo, pedidoPJ({ portabilidades: [bloco], phone: { licencas: { standard: 13 }, gravacao: { id: '90d' } } }));
    expect(c.portabilidade.numeros).toBe(50);
    expect(c.erros.some((e) => e.campo === 'portabilidade')).toBe(true); // 50 > 30 linhas + 2 adicionais
    expect(c.phone.grupoCallCenterObrigatorio).toBe(true); // 13 Standard > 12
    expect(c.phone.grupoCallCenter).toBe(239.97);
  });
});

describe('validação do pedido', () => {
  it('pedido completo passa', () => {
    expect(validarPedido(catalogo, pedidoPJ()).erros).toEqual([]);
  });
  it('acusa portabilidade acima do contratado, ramais abaixo do mínimo e IE de contribuinte', () => {
    const p = pedidoPJ({ portabilidades: [{ cidade: 'Brasília', uf: 'DF', operadora: 'Vivo', modo: 'faixa', faixa: { inicio: '5561933330000', fim: '5561933330049' }, titular: { mesmoCliente: true }, tecnico: pess('T'), fatura: arquivo }],
      phone: { licencas: { essentials: 1 }, gravacao: { id: '90d' } } });
    p.cliente.pj.indicadorIE = 'Contribuinte';
    const campos = validarPedido(catalogo, p).erros.map((e) => e.campo);
    expect(campos).toContain('portabilidade');
    expect(campos).toContain('phone');
    expect(campos).toContain('cliente.pj.inscricaoEstadual');
  });
});

describe('mudanças de novembro', () => {
  it('telefone no formato do CRM e portabilidade com 8 ou 9 dígitos', () => {
    expect(phoneCrm('+55 (61) 9 9999-0000')).toBe('55 (61) 9 9999-0000');
    expect(phoneCrm('+55 (61) 3042-4080')).toBe('55 (61) 3042-4080');
    expect(mask.phonePort('6130424080')).toBe('+55 (61) 3042-4080');
    expect(mask.phonePort('61930424080')).toBe('+55 (61) 9 3042-4080');
    expect(mask.phonePort('619304240801234')).toBe('+55 (61) 9 3042-4080'); // nunca passa de 9 dígitos
    expect(validateValue('phonePort', '+55 (61) 3042-4080')).toBeNull();
    expect(validateValue('phonePort', '+55 (61) 304-4080')).toMatch(/inválido/);
    expect(contarNumerosPortabilidade({ modo: 'faixa', faixa: { inicio: '556130424080', fim: '556130424089' } })).toBe(10);
  });
  it('Neo Phone: descontos totais e benefício no período', async () => {
    const calls = [];
    const client = { portal: 'x', call: vi.fn(async (m, p) => { calls.push([m, p]); if (m.endsWith('.list') || m === 'crm.duplicate.findbycomm') return { result: [] }; return { result: 1 }; }) };
    const pedido = pedidoPJ({ produtos: 'phone', phone: { licencas: { essentials: 3 }, gravacao: { id: '90d' } } });
    await enviarPedidoAoBitrix({ client, catalogo, pedido, calculo: calcularPedido(catalogo, pedido), pedidoId: 'PED-3', resumoTexto: '', portalHost: 'x' });
    const deal = calls.find(([m]) => m === 'crm.deal.add')[1].fields;
    // 3 × 39,94 cheio = 119,82; com 50% = 59,91 → desconto 59,91/mês; 24 meses = 1.437,84
    expect(deal[F.phone.descontoTotalPct]).toBe('50%');
    expect(deal[F.phone.descontoTotalRs]).toMatch(/59,91/);
    expect(deal[F.phone.beneficiosDesconto]).toMatch(/1.437,84/);
  });
  it('aditivo: valida só identificação + responsável e grava como aditivo em "Aditivo Recebido"', async () => {
    const aditivo = (over = {}) => ({ ...pedidoPJ(), tipoPedido: 'aditivo',
      cliente: { tipo: 'PJ', pj: { cnpj: '11.222.333/0001-81', razaoSocial: 'Empresa Teste LTDA' }, responsavelAditivo: pess('Resp Aditivo') },
      arquivos: { documentos: [] }, conclusao: { vencimento: '', instalacao: 'remota', observacoes: 'Aditivo', endereco: end }, ...over });
    expect(validarPedido(catalogo, aditivo()).erros).toEqual([]);
    const semResp = aditivo(); semResp.cliente.responsavelAditivo = { nome: '', celular: '', email: '' };
    expect(validarPedido(catalogo, semResp).erros.map((e) => e.campo)).toContain('cliente.responsavelAditivo.nome');

    const calls = [];
    const client = { portal: 'x', call: vi.fn(async (m, p) => {
      calls.push([m, p]);
      if (m === 'crm.requisite.list') return { result: [{ ID: 9, ENTITY_ID: 555 }] }; // empresa já existe
      if (m.endsWith('.list') || m === 'crm.duplicate.findbycomm') return { result: [] };
      return { result: 900 };
    }) };
    const pedido = aditivo();
    const r = await enviarPedidoAoBitrix({ client, catalogo, pedido, calculo: calcularPedido(catalogo, pedido), pedidoId: 'PED-4', resumoTexto: '', portalHost: 'x' });
    const deals = calls.filter(([m]) => m === 'crm.deal.add').map(([, p]) => p.fields);
    expect(deals.map((d) => d.TYPE_ID)).toEqual(['UC_TF3A56', 'UC_K46OU9']); // Aditivo Neo Vox, Aditivo Neo Phone
    expect(deals.every((d) => d.CATEGORY_ID === 16 && d.STAGE_ID === 'C16:UC_ECHZPU' && d.COMPANY_ID === 555)).toBe(true);
    expect(deals[0].TITLE).toMatch(/Aditivo Neo Vox/);
    expect(deals[0][F.pj.gestor.nome]).toBe('Resp Aditivo');
    expect(calls.some(([m]) => m === 'crm.company.add')).toBe(false); // não cria empresa
    expect(calls.some(([m]) => m === 'crm.lead.update')).toBe(false); // não mexe em lead
    expect(r.leadId).toBeNull();

    const naoAchou = { portal: 'x', call: async (m) => ({ result: m === 'crm.duplicate.findbycomm' ? [] : [] }) };
    await expect(enviarPedidoAoBitrix({ client: naoAchou, catalogo, pedido, calculo: calcularPedido(catalogo, pedido), pedidoId: 'PED-5', resumoTexto: '', portalHost: 'x' })).rejects.toThrow(/não encontrado/);
  });
});

describe('envio ao Bitrix', () => {
  it('dois blocos do mesmo estado (fora da instalação) viram um card só', async () => {
    const calls = [];
    let id = 500;
    const client = { portal: 'x', call: vi.fn(async (method, params) => { calls.push([method, params]); if (method.endsWith('.list') || method === 'crm.duplicate.findbycomm') return { result: [] }; return { result: ++id }; }) };
    const b = (cidade, op, n) => ({ cidade, uf: 'GO', operadora: op, modo: 'lista', numeros: [n], titular: { mesmoCliente: true }, tecnico: pess('T'), fatura: arquivo });
    const pedido = pedidoPJ({ produtos: 'vox', portabilidades: [b('Goiânia', 'Vivo', '+55 (62) 9 3042-4080'), b('Anápolis', 'Claro', '+55 (62) 9 3042-4081')] });
    const r = await enviarPedidoAoBitrix({ client, catalogo, pedido, calculo: calcularPedido(catalogo, pedido), pedidoId: 'PED-2', resumoTexto: '', portalHost: 'x' });
    expect(r.cards.map((c) => c.tipo)).toEqual(['vox', 'portabilidade']);
    const port = calls.filter(([m]) => m === 'crm.deal.add').map(([, p]) => p.fields)[1];
    expect(port[F.port.quantidade]).toBe('2');
    expect(port[F.port.operadora]).toBe('Vivo / Claro');
    expect(port[F.arqUltimaFatura]).toHaveLength(2);
  });
  it('cria 1 card por serviço; portabilidade do estado da instalação vai no card Neo Vox e outro estado vira card próprio', async () => {
    const calls = [];
    let id = 100;
    const client = {
      portal: 'x.bitrix24.com.br',
      call: vi.fn(async (method, params) => {
        calls.push([method, params]);
        if (method.endsWith('.list')) return { result: [] };
        if (method === 'crm.duplicate.findbycomm') return { result: [] };
        return { result: ++id };
      }),
    };
    const bloco = { cidade: 'Brasília', uf: 'DF', operadora: 'Vivo', modo: 'lista', numeros: ['+55 (61) 9 3333-0000'], titular: { mesmoCliente: true }, tecnico: pess('T'), fatura: arquivo };
    const pedido = pedidoPJ({ portabilidades: [bloco, { ...bloco, uf: 'GO', cidade: 'Goiânia' }] });
    const calculo = calcularPedido(catalogo, pedido);
    const r = await enviarPedidoAoBitrix({ client, catalogo, pedido, calculo, pedidoId: 'PED-1', resumoTexto: 'resumo', portalHost: client.portal });
    expect(r.cards.map((c) => c.tipo)).toEqual(['vox', 'phone', 'portabilidade']);
    expect(r.cards[0].titulo).toBe('Neo Vox + Portabilidade');
    expect(r.cards[2].titulo).toMatch(/^Portabilidade GO/);
    const deals = calls.filter(([m]) => m === 'crm.deal.add').map(([, p]) => p.fields);
    expect(deals.every((d) => d.CATEGORY_ID === 16 && d.STAGE_ID === 'C16:UC_7SA6T7' && d.ASSIGNED_BY_ID === 762 && d.ORIGIN_ID === 'PED-1')).toBe(true); // Administrativo → Validação de Dados
    expect(deals.map((d) => d.TYPE_ID)).toEqual(['SALE', 'UC_JUD1FN', 'SALE']); // Neo Vox, Neo Phone, portabilidade (Neo Vox)
    expect(deals[0][F.vox.tarifaLocalFixo]).toBe('Ilimitado');
    expect(deals[1][F.phone.descontoTotalPct]).toBe('50%');
    expect(deals[1][F.phone.descontoTotalRs]).toMatch(/67,91/); // 2×39,94 + 55,94 = 135,82 cheio; metade de desconto
    expect(deals[0][F.pj.cnpj]).toBe('11.222.333/0001-81');
    expect(deals[0][F.pj.socio.celular]).toBe('55 (61) 9 9999-0000');
    expect(deals[0][F.port.numeroUnico]).toBe('55 (61) 9 3333-0000'); // DF (instalação) no card Neo Vox
    expect(deals[0][F.port.uf]).toBe('DF');
    expect(deals[2][F.port.uf]).toBe('GO');
    expect(deals[1][F.port.uf]).toBeUndefined(); // card Neo Phone sem portabilidade
    expect(calls.some(([m]) => m === 'crm.company.add')).toBe(true);
    // Linhas de produto ligadas ao catálogo do Bitrix, com o preço do formulário
    const rows = calls.filter(([m]) => m === 'crm.deal.productrows.set').map(([, p]) => p.rows);
    expect(rows).toHaveLength(3);
    const [vox, phone, port] = rows;
    expect(vox[0]).toMatchObject({ PRODUCT_ID: 704, QUANTITY: 30, PRICE: 70.9, DISCOUNT_SUM: 70.9, DISCOUNT_RATE: 50 });
    expect(vox.find((r) => r.PRODUCT_ID === 134)).toMatchObject({ QUANTITY: 2, PRICE: 6.5 });
    expect(vox.find((r) => r.PRODUCT_ID === 420)).toMatchObject({ PRICE: 50 }); // instalação remota só no card Neo Vox
    expect(phone.find((r) => r.PRODUCT_ID === 420)).toBeUndefined();
    expect(phone.find((r) => r.PRODUCT_ID === 752)).toMatchObject({ QUANTITY: 2, PRICE: 19.97 }); // Essentials 24m
    expect(phone.find((r) => r.PRODUCT_NAME.includes('Basic'))).toMatchObject({ PRODUCT_ID: 0, PRICE: 27.97 }); // sem produto no Bitrix
    expect(vox.find((r) => r.PRODUCT_ID === 130)).toMatchObject({ QUANTITY: 1, PRICE: 9.5 });
    expect(port).toHaveLength(1);
    expect(port[0]).toMatchObject({ PRODUCT_ID: 130, QUANTITY: 1, PRICE: 9.5 });
    expect(deals[0].OPPORTUNITY).toBe(Math.round((30 * 70.9 + 2 * 6.5 + 9.5 + 50) * 100) / 100);
  });
});

describe('rotas', () => {
  function app({ enviar = vi.fn(async ({ pedidoId, aoCriarCard }) => { const c = { id: 1, tipo: 'vox', titulo: 'Neo Vox' }; aoCriarCard(c); return { pedidoId, cards: [c] }; }) } = {}) {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'pedidos-'));
    const catalogStore = createCatalogStore({ filePath: path.join(dir, 'cat.json') });
    catalogStore.save(catalogo, { usuario: 'teste' });
    const userStore = createReportUserStore({ filePath: path.join(dir, 'users.json') });
    const pedidosStore = createPedidosStore({ dir: path.join(dir, 'pedidos') });
    const a = express();
    a.use('/formulario', createPedidosRouter({ catalogStore, pedidosStore, bitrixClient: { portal: 'x' }, mailer: { send: async () => ({ skipped: true }) }, userStore, enviar }));
    return { a, enviar, catalogStore, userStore, pedidosStore };
  }
  async function entrar(a, usuario, senha) {
    const r = await request(a).post('/formulario/admin/login').send({ usuario, senha });
    return { r, cookie: (r.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ') };
  }

  it('recusa pedido inválido (422), salva o válido com anexos e não duplica por envioId', async () => {
    const { a, enviar, pedidosStore } = app();
    const ruim = await request(a).post('/formulario/api/pedidos').send({ envioId: 'abcdefgh123', pedido: { ...pedidoPJ(), produtos: '' } });
    expect(ruim.status).toBe(422);
    const ok1 = await request(a).post('/formulario/api/pedidos').send({ envioId: 'abcdefgh123', pedido: pedidoPJ() });
    const ok2 = await request(a).post('/formulario/api/pedidos').send({ envioId: 'abcdefgh123', pedido: pedidoPJ() });
    expect(ok1.status).toBe(200);
    expect(ok2.body.pedidoId).toBe(ok1.body.pedidoId);
    expect(enviar).toHaveBeenCalledTimes(1);
    const salvo = pedidosStore.obter(ok1.body.pedidoId);
    expect(salvo.bitrix.situacao).toBe('enviado');
    expect(salvo.pedido.arquivos.documentos[0]).toMatchObject({ nome: 'doc.pdf', arquivo: '01-doc.pdf' });
    expect(JSON.stringify(salvo)).not.toContain(arquivo[0].base64); // conteúdo fica no arquivo, não no JSON
    expect(pedidosStore.pedidoComAnexos(salvo.id).arquivos.documentos[0].base64).toBe(arquivo[0].base64);
  });

  it('com o Bitrix fora, o pedido fica salvo e o operador reenvia pelo painel', async () => {
    let falhar = true;
    const enviar = vi.fn(async ({ pedidoId }) => { if (falhar) throw new Error('Bitrix24 error [QUERY_LIMIT_EXCEEDED]'); return { pedidoId, cards: [{ id: 7, tipo: 'vox', titulo: 'Neo Vox' }] }; });
    const { a, userStore } = app({ enviar });
    const r = await request(a).post('/formulario/api/pedidos').send({ envioId: 'falha-0001', pedido: pedidoPJ() });
    expect(r.status).toBe(200);
    expect(r.body.bitrixFalhou).toBe(true);

    userStore.create({ username: 'op', password: 'inicial123', role: 'operador' });
    const primeiro = await entrar(a, 'op', 'inicial123');
    expect(primeiro.r.status).toBe(409); // precisa trocar a senha
    const troca = await request(a).post('/formulario/admin/login').send({ usuario: 'op', senha: 'inicial123', novaSenha: 'definitiva1' });
    expect(troca.status).toBe(200);
    const { cookie } = await entrar(a, 'op', 'definitiva1');

    const lista = await request(a).get('/formulario/admin/api/pedidos').set('cookie', cookie);
    expect(lista.body.pedidos[0]).toMatchObject({ id: r.body.pedidoId, bitrix: 'falhou', status: 'Novo' });
    expect((await request(a).get('/formulario/admin/api/catalogo').set('cookie', cookie)).status).toBe(403); // operador não mexe no catálogo
    expect((await request(a).get('/formulario/admin/api/usuarios').set('cookie', cookie)).status).toBe(403);

    falhar = false;
    const re = await request(a).post(`/formulario/admin/api/pedidos/${r.body.pedidoId}/reenviar`).set('cookie', cookie).send({});
    expect(re.status).toBe(200);
    expect((await request(a).post(`/formulario/admin/api/pedidos/${r.body.pedidoId}/reenviar`).set('cookie', cookie).send({})).status).toBe(409); // já enviado

    const st = await request(a).patch(`/formulario/admin/api/pedidos/${r.body.pedidoId}`).set('cookie', cookie).send({ status: 'Em análise', observacao: 'Conferir contrato social' });
    expect(st.body.pedido.status).toBe('Em análise');
    expect(st.body.pedido.observacoes[0]).toMatchObject({ usuario: 'op', texto: 'Conferir contrato social' });
    const anexo = await request(a).get(`/formulario/admin/api/pedidos/${r.body.pedidoId}/anexos/01-doc.pdf`).set('cookie', cookie);
    expect(anexo.status).toBe(200);
    expect((await request(a).get(`/formulario/admin/api/pedidos/${r.body.pedidoId}/anexos/..%2Fpedido.json`).set('cookie', cookie)).status).toBe(404);
  });

  it('admin cria usuário operador; sem login a API do painel recusa', async () => {
    const { a, userStore } = app();
    expect((await request(a).get('/formulario/admin/api/pedidos')).status).toBe(401);
    userStore.changePassword('admin', 'admin', 'admin-forte1');
    const { cookie } = await entrar(a, 'admin', 'admin-forte1');
    const c = await request(a).post('/formulario/admin/api/usuarios').set('cookie', cookie).send({ usuario: 'maria', senha: 'temporaria1', perfil: 'operador' });
    expect(c.status).toBe(200);
    expect(c.body.usuarios.find((u) => u.username === 'maria')).toMatchObject({ role: 'operador', mustChangePassword: true });
    expect((await request(a).delete('/formulario/admin/api/usuarios/admin').set('cookie', cookie)).status).toBe(400); // não remove a si mesmo
  });

  it('com chave de acesso, a API exige o link', async () => {
    const { a, catalogStore } = app();
    const c = catalogStore.get();
    catalogStore.save({ ...c, regras: { ...c.regras, chaveAcesso: 'segredo' } }, { usuario: 'admin' });
    expect((await request(a).get('/formulario/api/catalogo')).status).toBe(403);
    const ok = await request(a).get('/formulario/api/catalogo').set('cookie', 'fp_key=segredo');
    expect(ok.status).toBe(200);
    expect(ok.body.regras.chaveAcesso).toBeUndefined();
  });
});
