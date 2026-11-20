// Cálculo de preços do pedido. Isomórfico: o navegador mostra os valores enquanto o vendedor
// preenche, e o servidor recalcula tudo a partir do catálogo (nunca confia no valor do navegador).
import { onlyDigits } from './validators.js';

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export const brl = (n) =>
  Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const comDesconto = (cheio, pct) => round2(cheio * (1 - pct / 100));

export function tiposVoxDisponiveis(catalogo, { origemTipo }) {
  return catalogo.tiposVox.filter((t) => t.ativo && (!t.somenteRevenda || origemTipo === 'revenda'));
}

// Planos Ilimitado e Pós: escolhidos sozinhos pela fidelidade e quantidade de linhas.
// Pré: o vendedor escolhe o plano (nível de recarga).
export function resolverPlanoVox(catalogo, { tipoId, fidelidade, linhas, planoPreId }) {
  const tipo = catalogo.tiposVox.find((t) => t.id === tipoId && t.ativo);
  if (!tipo) return { erro: 'Escolha o tipo de plano Neo Vox.' };
  const n = Number(linhas);
  if (!Number.isInteger(n) || n < 1) return { tipo, erro: 'Informe a quantidade de linhas (número inteiro maior que zero).' };
  const ativos = catalogo.planosVox.filter((p) => p.tipo === tipoId && p.ativo);
  if (tipo.categoria === 'pre') {
    const plano = ativos.find((p) => p.id === planoPreId);
    return plano ? { tipo, plano } : { tipo, erro: 'Escolha o plano Pré (valor de recarga).' };
  }
  const daFidelidade = ativos.filter((p) => p.fidelidade === Number(fidelidade));
  if (!daFidelidade.length) return { tipo, erro: `Não há plano ${tipo.nome} com fidelidade de ${fidelidade} meses.` };
  const plano = daFidelidade.find((p) => n >= (p.minLinhas ?? 1) && (p.maxLinhas == null || n <= p.maxLinhas));
  if (!plano) return { tipo, erro: `Quantidade de linhas fora das faixas do ${tipo.nome}.` };
  return { tipo, plano };
}

// Conta os números de um bloco de portabilidade (lista ou faixa em sequência).
export function contarNumerosPortabilidade(bloco) {
  if (!bloco) return 0;
  if (bloco.modo === 'faixa') {
    const ini = onlyDigits(bloco.faixa?.inicio);
    const fim = onlyDigits(bloco.faixa?.fim);
    if (ini.length !== 13 || fim.length !== 13) return 0;
    const diff = Number(fim) - Number(ini);
    return diff >= 0 ? diff + 1 : 0;
  }
  return (bloco.numeros || []).filter((x) => onlyDigits(x)).length;
}

// Taxa de ativação por linha, por categoria de plano (Pré e Pós cobram; Ilimitado não).
// Catálogos antigos só tinham "ativacaoPre": vale para Pré e Pós.
export function valorAtivacao(catalogo, categoria) {
  const v = catalogo.ativacao?.[categoria];
  if (v != null) return Number(v) || 0;
  return categoria === 'pre' || categoria === 'pos' ? Number(catalogo.ativacaoPre) || 0 : 0;
}

export function precoEspecial(catalogo, { origem, planoId }) {
  if (origem?.tipo !== 'revenda') return null;
  const cnpj = onlyDigits(origem.cnpj);
  const esp = (catalogo.precosEspeciais || []).find((e) => onlyDigits(e.revendaCnpj) === cnpj && e.planoId === planoId);
  return esp ? Number(esp.preco) : null;
}

export function calcularPedido(catalogo, pedido) {
  const regras = catalogo.regras;
  const pct = Number(regras.descontoPercent) || 0;
  const fidelidade = Number(pedido.fidelidade) || null;
  const temVox = pedido.produtos === 'vox' || pedido.produtos === 'ambos';
  const temPhone = pedido.produtos === 'phone' || pedido.produtos === 'ambos';
  const erros = [];
  const out = { vox: null, phone: null, portabilidade: null, instalacao: null, erros };

  if (temVox) {
    const v = pedido.vox || {};
    const { tipo, plano, erro } = resolverPlanoVox(catalogo, { ...v, fidelidade });
    if (erro) erros.push({ campo: 'vox', mensagem: erro });
    if (plano) {
      const linhas = Number(v.linhas);
      const isPre = tipo.categoria === 'pre';
      const especial = precoEspecial(catalogo, { origem: pedido.origem, planoId: plano.id });
      const cheio = especial ?? Number(plano.precoCheio);
      const unit = isPre ? cheio : comDesconto(cheio, pct);
      const qtdAdic = v.adicionais?.quer ? Number(v.adicionais.quantidade) || 0 : 0;
      const precoAdic = Number(catalogo.numeroAdicional[isPre ? 'semFidelidade' : String(plano.fidelidade)] ?? 0);
      const ddd = Number(onlyDigits(v.ddd));
      out.vox = {
        tipo: tipo.nome,
        categoria: tipo.categoria,
        plano: plano.nome,
        planoId: plano.id,
        fidelidade: isPre ? null : plano.fidelidade,
        linhas,
        precoCheio: cheio,
        descontoPercent: isPre ? 0 : pct,
        precoUnit: unit,
        totalLinhasCheio: round2(cheio * linhas),
        totalLinhas: round2(unit * linhas),
        descontoMensal: round2((cheio - unit) * linhas),
        adicionais: { quantidade: qtdAdic, precoUnit: precoAdic, total: round2(qtdAdic * precoAdic) },
        totalNumeros: linhas + qtdAdic,
        ativacao: round2(valorAtivacao(catalogo, tipo.categoria) * linhas),
        tarifas: plano.tarifas || null,
        ddd: ddd || null,
        cfop: ddd ? (ddd === Number(regras.cfop.ddd) ? regras.cfop.noDdd : regras.cfop.outros) : null,
      };
      out.vox.mensal = round2(out.vox.totalLinhas + out.vox.adicionais.total);
      if (fidelidade == null && !isPre) erros.push({ campo: 'fidelidade', mensagem: 'Escolha a fidelidade.' });
    }

    const blocos = pedido.portabilidades || [];
    if (blocos.length) {
      const porBloco = blocos.map(contarNumerosPortabilidade);
      const numeros = porBloco.reduce((a, b) => a + b, 0);
      const unit = Number(catalogo.portabilidade.precoPorNumero);
      out.portabilidade = { porBloco, numeros, precoUnit: unit, total: round2(numeros * unit), cobranca: catalogo.portabilidade.cobranca };
      if (out.vox && numeros > out.vox.totalNumeros) {
        erros.push({
          campo: 'portabilidade',
          mensagem: `Você está portando ${numeros} números, mas contratou ${out.vox.totalNumeros} (linhas + números adicionais). Aumente as linhas ou os números adicionais.`,
        });
      }
    }
  }

  if (temPhone) {
    const p = pedido.phone || {};
    if (!fidelidade) erros.push({ campo: 'fidelidade', mensagem: 'Escolha a fidelidade (Neo Phone exige 12, 24 ou 36 meses).' });
    const itens = catalogo.licencasPhone.filter((l) => l.ativo).map((l) => {
      const qtd = Number(p.licencas?.[l.id]) || 0;
      const cheio = Number(l.precos[String(fidelidade)] ?? 0);
      const unit = comDesconto(cheio, pct);
      return { id: l.id, nome: l.nome, quantidade: qtd, precoCheio: cheio, precoUnit: unit, totalCheio: round2(cheio * qtd), total: round2(unit * qtd), descontoPercent: pct };
    });
    const totalRamais = itens.reduce((a, i) => a + i.quantidade, 0);
    const comGravacao = itens.filter((i) => catalogo.licencasPhone.find((l) => l.id === i.id)?.incluiGravacao).reduce((a, i) => a + i.quantidade, 0);
    const standard = itens.filter((i) => catalogo.licencasPhone.find((l) => l.id === i.id)?.callCenter).reduce((a, i) => a + i.quantidade, 0);
    if (totalRamais < regras.minRamais) {
      erros.push({ campo: 'phone', mensagem: `O mínimo é de ${regras.minRamais} ramais por contrato (hoje: ${totalRamais}).` });
    }
    const grav = catalogo.gravacao.find((g) => g.id === p.gravacao?.id && g.ativo);
    const pacotes = grav && grav.preco > 0 ? Number(p.gravacao?.pacotes) || 0 : 0;
    if (grav && grav.preco > 0 && pacotes > comGravacao) {
      erros.push({ campo: 'gravacao', mensagem: `O número de pacotes de gravação (${pacotes}) não pode passar da soma das licenças Basic + Standard (${comGravacao}).` });
    }
    const gcObrigatorio = standard > regras.limiteStandardSemGrupoCallCenter;
    const gc = gcObrigatorio || !!p.grupoCallCenter;
    out.phone = {
      itens,
      totalRamais,
      licencasComGravacao: comGravacao,
      licencasStandard: standard,
      gravacao: grav ? { id: grav.id, nome: grav.nome, pacotes, precoUnit: grav.preco, total: round2(pacotes * grav.preco) } : null,
      discador: p.discador ? Number(catalogo.discador.preco) : 0,
      grupoCallCenter: gc ? Number(catalogo.grupoCallCenter.preco) : 0,
      grupoCallCenterObrigatorio: gcObrigatorio,
      fidelidade,
    };
    out.phone.totalLicencas = round2(itens.reduce((a, i) => a + i.total, 0));
    out.phone.totalLicencasCheio = round2(itens.reduce((a, i) => a + i.totalCheio, 0));
    out.phone.mensal = round2(out.phone.totalLicencas + (out.phone.gravacao?.total || 0) + out.phone.discador + out.phone.grupoCallCenter);
  }

  const inst = pedido.conclusao?.instalacao;
  if (inst === 'remota' || inst === 'presencial') out.instalacao = Number(regras.instalacao[inst]);

  const mensalVox = out.vox?.mensal || 0;
  const mensalPhone = out.phone?.mensal || 0;
  const portUnica = out.portabilidade?.cobranca === 'unica' ? out.portabilidade.total : 0;
  const portMensal = out.portabilidade && out.portabilidade.cobranca !== 'unica' ? out.portabilidade.total : 0;
  out.mensal = round2(mensalVox + mensalPhone + portMensal);
  out.adesao = round2((out.vox?.ativacao || 0) + (out.instalacao || 0) + portUnica);
  const mesesVox = out.vox ? out.vox.fidelidade || 1 : 0;
  const mesesPhone = out.phone ? fidelidade || 0 : 0;
  out.totalContrato = round2((mensalVox + portMensal) * mesesVox + mensalPhone * mesesPhone + out.adesao);
  out.meses = Math.max(mesesVox, mesesPhone) || null;
  return out;
}
