// Validação completa do pedido (isomórfica). O navegador usa antes de mostrar o resumo;
// o servidor usa de novo antes de gravar no Bitrix24. Retorna [{ campo, mensagem }].
import { validateValue, onlyDigits } from './validators.js';
import { calcularPedido } from './pricing.js';

const pessoa = (prefix, obj, { email = true } = {}) => {
  const out = [
    [`${prefix}.nome`, 'text', obj?.nome],
    [`${prefix}.celular`, 'phone', obj?.celular],
  ];
  if (email) out.push([`${prefix}.email`, 'email', obj?.email]);
  return out;
};

const endereco = (prefix, e) => [
  [`${prefix}.cep`, 'cep', e?.cep],
  [`${prefix}.logradouro`, 'text', e?.logradouro],
  [`${prefix}.numero`, 'text', e?.numero],
  [`${prefix}.complemento`, 'text', e?.complemento, { required: false }],
  [`${prefix}.bairro`, 'text', e?.bairro],
  [`${prefix}.cidade`, 'text', e?.cidade],
  [`${prefix}.uf`, 'uf', e?.uf],
];

const ARQ_TIPOS = ['application/pdf', 'image/jpeg', 'image/png'];
export const ARQ_MAX_BYTES = 10 * 1024 * 1024;

function checarArquivos(campo, lista, erros) {
  if (!Array.isArray(lista) || !lista.length) {
    erros.push({ campo, mensagem: 'Envie o arquivo.' });
    return;
  }
  for (const a of lista) {
    if (!ARQ_TIPOS.includes(a?.tipo)) erros.push({ campo, mensagem: `"${a?.nome}": envie PDF, JPG ou PNG.` });
    const bytes = Math.floor(String(a?.base64 || '').length * 0.75);
    if (!bytes) erros.push({ campo, mensagem: `"${a?.nome}": arquivo vazio.` });
    if (bytes > ARQ_MAX_BYTES) erros.push({ campo, mensagem: `"${a?.nome}": máximo de 10 MB por arquivo.` });
  }
}

export function validarPedido(catalogo, pedido, { checarArquivosEnviados = true } = {}) {
  const regras = [];
  const erros = [];
  const p = pedido || {};

  // Seção 0/1 — quem preenche
  const o = p.origem || {};
  if (!['vendedor', 'revenda'].includes(o.tipo)) erros.push({ campo: 'origem.tipo', mensagem: 'Informe se você é Vendedor ou Revenda.' });
  const lista = o.tipo === 'revenda' ? catalogo.revendas : catalogo.vendedores;
  if (o.tipo && !lista.some((x) => x.id === o.id && x.ativo)) erros.push({ campo: 'origem.id', mensagem: 'Escolha seu nome na lista.' });
  if (o.tipo === 'revenda') regras.push(['origem.cnpj', 'cnpj', o.cnpj]);
  regras.push(['origem.nome', 'text', o.nome], ['origem.email', 'email', o.email], ['origem.celular', 'phone', o.celular]);

  // Seção 2/3 — cliente
  const c = p.cliente || {};
  const aditivo = p.tipoPedido === 'aditivo';
  if (!['novo', 'aditivo'].includes(p.tipoPedido || 'novo')) erros.push({ campo: 'tipoPedido', mensagem: 'Informe se é contrato novo ou aditivo.' });
  if (!['PF', 'PJ'].includes(c.tipo)) erros.push({ campo: 'cliente.tipo', mensagem: 'Informe se o cliente é Pessoa Física ou Jurídica.' });
  if (aditivo) {
    // Aditivo: cliente já cadastrado no Bitrix24; pede só identificação e o responsável pelo aditivo.
    if (c.tipo === 'PF') regras.push(['cliente.pf.nome', 'text', c.pf?.nome], ['cliente.pf.cpf', 'cpf', c.pf?.cpf]);
    if (c.tipo === 'PJ') regras.push(['cliente.pj.razaoSocial', 'text', c.pj?.razaoSocial], ['cliente.pj.cnpj', 'cnpj', c.pj?.cnpj]);
    if (c.tipo) regras.push(...pessoa('cliente.responsavelAditivo', c.responsavelAditivo));
  } else if (c.tipo === 'PF') {
    const f = c.pf || {};
    regras.push(
      ['cliente.pf.nome', 'text', f.nome], ['cliente.pf.cpf', 'cpf', f.cpf], ['cliente.pf.nascimento', 'birth', f.nascimento],
      ['cliente.pf.celular', 'phone', f.celular], ['cliente.pf.email', 'email', f.email],
      ...endereco('cliente.pf.endereco', f.endereco),
    );
  }
  if (!aditivo && c.tipo === 'PJ') {
    const j = c.pj || {};
    regras.push(
      ['cliente.pj.cnpj', 'cnpj', j.cnpj], ['cliente.pj.razaoSocial', 'text', j.razaoSocial], ['cliente.pj.nomeFantasia', 'text', j.nomeFantasia],
      ['cliente.pj.dataFundacao', 'date', j.dataFundacao], ['cliente.pj.indicadorIE', 'text', j.indicadorIE],
      ['cliente.pj.inscricaoMunicipal', 'text', j.inscricaoMunicipal, { required: false }], ['cliente.pj.simples', 'text', j.simples], ['cliente.pj.retencaoISS', 'text', j.retencaoISS],
      ...endereco('cliente.pj.endereco', j.endereco),
    );
    if (j.indicadorIE === 'Contribuinte') regras.push(['cliente.pj.inscricaoEstadual', 'text', j.inscricaoEstadual]);
    const socios = Array.isArray(j.socios) ? j.socios : [];
    if (!socios.length) erros.push({ campo: 'cliente.pj.socios', mensagem: 'Informe o sócio principal.' });
    socios.forEach((s, i) => regras.push(
      [`cliente.pj.socios.${i}.nome`, 'text', s.nome], [`cliente.pj.socios.${i}.cpf`, 'cpf', s.cpf], [`cliente.pj.socios.${i}.nascimento`, 'birth', s.nascimento],
      [`cliente.pj.socios.${i}.celular`, 'phone', s.celular], [`cliente.pj.socios.${i}.email`, 'email', s.email],
    ));
  }
  if (c.tipo && !aditivo) {
    const k = c.contatos || {};
    for (const papel of ['gestor', 'financeiro', 'tecnico']) regras.push(...pessoa(`cliente.contatos.${papel}`, k[papel]));
    regras.push(['cliente.contatos.testemunha.nome', 'text', k.testemunha?.nome], ['cliente.contatos.testemunha.email', 'email', k.testemunha?.email]);
    if (checarArquivosEnviados) checarArquivos('arquivos.documentos', p.arquivos?.documentos, erros);
  }

  // Seção 4/5/6 — produtos
  if (!['vox', 'phone', 'ambos'].includes(p.produtos)) erros.push({ campo: 'produtos', mensagem: 'Escolha os produtos.' });
  const temVox = p.produtos === 'vox' || p.produtos === 'ambos';
  if (temVox) {
    regras.push(['vox.ddd', 'ddd', p.vox?.ddd]);
    if (p.vox?.adicionais?.quer && !(Number(p.vox.adicionais.quantidade) >= 1)) {
      erros.push({ campo: 'vox.adicionais.quantidade', mensagem: 'Informe quantos números adicionais.' });
    }
    (p.portabilidades || []).forEach((b, i) => {
      const pre = `portabilidades.${i}`;
      regras.push([`${pre}.cidade`, 'text', b.cidade], [`${pre}.uf`, 'uf', b.uf], [`${pre}.operadora`, 'text', b.operadora]);
      if (b.operadora === 'Outra') regras.push([`${pre}.operadoraOutra`, 'text', b.operadoraOutra]);
      if (b.modo === 'faixa') {
        regras.push([`${pre}.faixa.inicio`, 'phonePort', b.faixa?.inicio], [`${pre}.faixa.fim`, 'phonePort', b.faixa?.fim]);
        const ini = onlyDigits(b.faixa?.inicio);
        const fim = onlyDigits(b.faixa?.fim);
        const completos = [12, 13].includes(ini.length) && [12, 13].includes(fim.length);
        if (completos && ini.length !== fim.length) {
          erros.push({ campo: `${pre}.faixa.fim`, mensagem: 'O primeiro e o último número precisam ter a mesma quantidade de dígitos.' });
        } else if (completos && ini.slice(0, 4) !== fim.slice(0, 4)) {
          erros.push({ campo: `${pre}.faixa.fim`, mensagem: 'O primeiro e o último número precisam ter o mesmo DDD.' });
        } else if (completos && Number(fim) < Number(ini)) {
          erros.push({ campo: `${pre}.faixa.fim`, mensagem: 'O último número precisa ser maior que o primeiro.' });
        }
      } else {
        const nums = (b.numeros || []).filter((x) => String(x ?? '').trim());
        if (!nums.length) erros.push({ campo: `${pre}.numeros`, mensagem: 'Informe ao menos um número.' });
        nums.forEach((n, j) => regras.push([`${pre}.numeros.${j}`, 'phonePort', n]));
      }
      const t = b.titular || {};
      if (!t.mesmoCliente) {
        if (!['PF', 'PJ'].includes(t.tipo)) erros.push({ campo: `${pre}.titular.tipo`, mensagem: 'Informe se o titular é PF ou PJ.' });
        if (t.tipo === 'PF') regras.push([`${pre}.titular.pf.nome`, 'text', t.pf?.nome], [`${pre}.titular.pf.cpf`, 'cpf', t.pf?.cpf], [`${pre}.titular.pf.celular`, 'phone', t.pf?.celular], [`${pre}.titular.pf.email`, 'email', t.pf?.email]);
        if (t.tipo === 'PJ') {
          regras.push([`${pre}.titular.pj.cnpj`, 'cnpj', t.pj?.cnpj], [`${pre}.titular.pj.razaoSocial`, 'text', t.pj?.razaoSocial], [`${pre}.titular.pj.dataFundacao`, 'date', t.pj?.dataFundacao], [`${pre}.titular.pj.indicadorIE`, 'text', t.pj?.indicadorIE], [`${pre}.titular.pj.inscricaoMunicipal`, 'text', t.pj?.inscricaoMunicipal, { required: false }]);
          if (t.pj?.indicadorIE === 'Contribuinte') regras.push([`${pre}.titular.pj.inscricaoEstadual`, 'text', t.pj?.inscricaoEstadual]);
        }
      }
      regras.push(...pessoa(`${pre}.tecnico`, b.tecnico));
      if (checarArquivosEnviados) checarArquivos(`${pre}.fatura`, b.fatura, erros);
    });
  }

  // Seção 7 — conclusão
  const z = p.conclusao || {};
  if (!aditivo && !catalogo.regras.vencimentos.includes(Number(z.vencimento))) erros.push({ campo: 'conclusao.vencimento', mensagem: 'Escolha o dia de vencimento.' });
  if (!['remota', 'presencial'].includes(z.instalacao)) erros.push({ campo: 'conclusao.instalacao', mensagem: 'Escolha o tipo de instalação.' });
  regras.push(['conclusao.observacoes', 'text', z.observacoes], ...endereco('conclusao.endereco', z.endereco));

  for (const [campo, tipo, valor, opts] of regras) {
    const msg = validateValue(tipo, valor, opts);
    if (msg) erros.push({ campo, mensagem: msg });
  }

  const calculo = calcularPedido(catalogo, p);
  erros.push(...calculo.erros);
  return { erros, calculo };
}
