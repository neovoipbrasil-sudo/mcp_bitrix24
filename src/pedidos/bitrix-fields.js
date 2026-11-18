// Campos do Bitrix24 usados pelo formulário. São os MESMOS campos que o Jotform preenchia
// (conjunto UF_CRM_65BBED…/65BBEE…, rótulos "(Clientes …)"), para manter modelos de contrato,
// relatórios e automações funcionando. Levantamento em docs/superpowers/specs/2026-11-12-formulario-pedidos-design.md.

export const PIPELINES = {
  vendedor: { categoryId: 22, stageId: 'C22:UC_5CXUV0' }, // Clientes - Vendas Diretas → Organizar Dados - Cliente Formulario
  revenda: { categoryId: 0, stageId: 'NEW' }, // Clientes - Revendas → Organizar Dados
};

export const ORIGINATOR_ID = 'formulario-pedidos';

export const F = {
  // Comuns
  tipoCliente: 'UF_CRM_65BBEDECA4663',
  produtos: 'UF_CRM_65BBEE0CC2963',
  vendedor: 'UF_CRM_652FE23F72D30',
  // Revenda
  revendaCnpj: 'UF_CRM_65BBEDE7A0185',
  revendaRazao: 'UF_CRM_654165FAAE4A4',
  revendaRespNome: 'UF_CRM_65BBEDEBBEDD9',
  revendaRespCelular: 'UF_CRM_65BBEDEC1AA28',
  revendaRespEmail: 'UF_CRM_65BBEDEC62635',
  // PF
  pf: {
    nome: 'UF_CRM_1686082137262', cpf: 'UF_CRM_1686082285035', nascimento: 'UF_CRM_65BBEDECE6023',
    celular: 'UF_CRM_65BBEDED5062C', email: 'UF_CRM_65BBEDED94280',
    end: { logradouro: 'UF_CRM_65BBEDEDDA421', numero: 'UF_CRM_65BBEDEE2F44B', bairro: 'UF_CRM_65BBEDEE80EF9', complemento: 'UF_CRM_65BBEDEEC0E68', cep: 'UF_CRM_65BBEDEF0A18A', cidade: 'UF_CRM_65BBEDEF497EC', uf: 'UF_CRM_65BBEDEF8B717' },
    gestor: { nome: 'UF_CRM_647F60208EFCF', celular: 'UF_CRM_647F6020BFAEC', email: 'UF_CRM_647F6020E7126' },
    financeiro: { nome: 'UF_CRM_65BBEDEFC8862', celular: 'UF_CRM_65BBEDF010689', email: 'UF_CRM_65BBEDF0574C7' },
    tecnico: { nome: 'UF_CRM_65BBEDF09DCBC', celular: 'UF_CRM_65BBEDF0DF47F', email: 'UF_CRM_65BBEDF14FB0C' },
    testemunha: { nome: 'UF_CRM_65BBEDF1ADE16', email: 'UF_CRM_65BBEDF1F34B0' },
  },
  // PJ
  pj: {
    cnpj: 'UF_CRM_65BBEDE80F239', razaoSocial: 'UF_CRM_65BBEDE855B0F', nomeFantasia: 'UF_CRM_65BBEDF251687',
    dataFundacao: 'UF_CRM_65BBEDF29B3D7', indicadorIE: 'UF_CRM_65BBEDF2E3881', inscricaoEstadual: 'UF_CRM_65BBEDF335E9A',
    inscricaoMunicipal: 'UF_CRM_65BBEDF382F06', simples: 'UF_CRM_65BBEDF3CD1F5', retencaoISS: 'UF_CRM_65BBEDF41DDF0',
    maisDeUmSocio: 'UF_CRM_65BBEDF468505', outrosSocios: 'UF_CRM_65BBEDF653652',
    socio: { nome: 'UF_CRM_65BBEDF4B7CD7', cpf: 'UF_CRM_65BBEDF50EA26', nascimento: 'UF_CRM_65BBEDF55C9D5', celular: 'UF_CRM_65BBEDF5A8339', email: 'UF_CRM_65BBEDF5F4224' },
    end: { logradouro: 'UF_CRM_65BBEDF69D244', numero: 'UF_CRM_65BBEDF6E8C2A', bairro: 'UF_CRM_65BBEDF752056', complemento: 'UF_CRM_65BBEDF79BCDE', cep: 'UF_CRM_65BBEDF7E2D63', cidade: 'UF_CRM_65BBEDF835D93', uf: 'UF_CRM_65BBEDF8897AD' },
    gestor: { nome: 'UF_CRM_647F602119825', celular: 'UF_CRM_647F60214E0B2', email: 'UF_CRM_647F60218EB1D' },
    financeiro: { nome: 'UF_CRM_65BBEDF8D1DF3', celular: 'UF_CRM_65BBEDF922AD5', email: 'UF_CRM_65BBEDF969281' },
    tecnico: { nome: 'UF_CRM_65BBEDF9B3B01', celular: 'UF_CRM_65BBEDFA0851C', email: 'UF_CRM_65BBEDFA4E22B' },
    testemunha: { nome: 'UF_CRM_65BBEDFAA1629', email: 'UF_CRM_65BBEDFAF0215' },
  },
  // Neo Vox
  vox: {
    tarifacao: 'UF_CRM_65BBEDFB56F9E', fidelizacao: 'UF_CRM_65BBEDFBAB2EB', pacoteRecarga: 'UF_CRM_65BBEDFC099BC',
    linhas: 'UF_CRM_65BBEDFC6E462', plano: 'UF_CRM_65BBEDFCBD751',
    tarifaLocalFixo: 'UF_CRM_65BBEDFD3B9C9', tarifaLdnFixo: 'UF_CRM_65BBEDFD9377B', tarifaLocalMovel: 'UF_CRM_65BBEDFDE2553', tarifaLdnMovel: 'UF_CRM_65BBEDFE3B35A',
    valorLinha: 'UF_CRM_65BBEDFE8A7A1', valorTotal: 'UF_CRM_65BBEDFED48E8', descontoPct: 'UF_CRM_65BBEDFF57114', descontoRs: 'UF_CRM_65BBEDFFA29FF',
    valorTotalComDesconto: 'UF_CRM_65BBEDFFEAD9D', ativacaoPre: 'UF_CRM_65BBEE0041DB9', totalDesconto: 'UF_CRM_65BBEE00902FC',
    ddd: 'UF_CRM_65BBEE00DCF22', cfop: 'UF_CRM_65BBEE012E50C',
    querAdicional: 'UF_CRM_65BBEE0181840', qtdAdicional: 'UF_CRM_65BBEE01CFC05', valorAdicional: 'UF_CRM_65BBEE0222F10', totalAdicional: 'UF_CRM_65BBEE026BA54',
    totalLinhasContratadas: 'UF_CRM_65BBEE02B480D', querPortabilidade: 'UF_CRM_65BBEE036CDE9',
  },
  // Portabilidade (um card por bloco)
  port: {
    cidade: 'UF_CRM_65BBEE03C4142', uf: 'UF_CRM_65BBEE0415AF4', operadora: 'UF_CRM_65BBEE04643E0', quantidade: 'UF_CRM_65BBEE04B3E43',
    valorNumero: 'UF_CRM_65BBEE0509F78', valorTotal: 'UF_CRM_65BBEE0558C5B', numeroUnico: 'UF_CRM_65BBEE05B5B01',
    emSequencia: 'UF_CRM_65BBEE0612E15', primeiro: 'UF_CRM_65BBEE0660D70', ultimo: 'UF_CRM_65BBEE06B0796', numeros: 'UF_CRM_65BBEE07070CA',
    titularTipo: 'UF_CRM_65BBEE075191C', mesmoCliente: 'UF_CRM_65BBEE07A70ED', mesmaEmpresa: 'UF_CRM_65BBEE09768FA',
    titularNome: 'UF_CRM_65BBEE080ECE8', titularCpf: 'UF_CRM_65BBEE0871ABF', titularCelular: 'UF_CRM_65BBEE08C6931', titularEmail: 'UF_CRM_65BBEE0926EF2',
    empresaCnpj: 'UF_CRM_65BBEE09C4340', empresaRazao: 'UF_CRM_65BBEE0A22A60', empresaFundacao: 'UF_CRM_65BBEE0A70EF1',
    empresaIndicadorIE: 'UF_CRM_65BBEE0ABFB74', empresaIE: 'UF_CRM_65BBEE0B3CCE5', empresaIM: 'UF_CRM_65BBEE0B8CF20',
    tecnicoNome: 'UF_CRM_65BBEE0BD3223', tecnicoCelular: 'UF_CRM_65BBEE0C2B752', tecnicoEmail: 'UF_CRM_65BBEE0C796DF',
  },
  // Neo Phone
  phone: {
    fidelizacao: 'UF_CRM_65BBEE0D2E155', licencasEscolhidas: 'UF_CRM_65BBEE0D74246',
    essentials: { qtd: 'UF_CRM_65BBEE0DBA464', unit: 'UF_CRM_65BBEE0E0E5C9', total: 'UF_CRM_65BBEE0E57CEE', pct: 'UF_CRM_65BBEE0EA139C', rs: 'UF_CRM_65BBEE0EE9018' },
    basic: { qtd: 'UF_CRM_65BBEE0F3FC5E', unit: 'UF_CRM_65BBEE0F89ADB', total: 'UF_CRM_65BBEE0FD58A9', pct: 'UF_CRM_65BBEE1035D23', rs: 'UF_CRM_65BBEE1090B06' },
    standard: { qtd: 'UF_CRM_65BBEE10D6D5A', unit: 'UF_CRM_65BBEE11334A4', total: 'UF_CRM_65BBEE1187819', pct: 'UF_CRM_65BBEE11D2378', rs: 'UF_CRM_65BBEE122D165' },
    totalComDesconto: 'UF_CRM_65BBEE127DD85', somaLicencas: 'UF_CRM_65BBEE12D7389', somaBasicStandard: 'UF_CRM_65BBEE1339194',
    gravacao: 'UF_CRM_65BBEE1392DB1', pacotesGravacao: 'UF_CRM_65BBEE13DAF0B', totalGravacao: 'UF_CRM_65BBEE143E140',
    discador: 'UF_CRM_65BBEE149DCDE', grupoCallCenter: 'UF_CRM_65BBEE14EFE50',
  },
  // Conclusão
  vencimento: 'UF_CRM_65BBEDE89869A',
  instalacao: 'UF_CRM_65BBEDE8E2556',
  valorInstalacao: 'UF_CRM_65BBEDEB77F3E',
  observacoes: 'UF_CRM_65BBEDE93387D',
  inst: { logradouro: 'UF_CRM_65BBEDE97E2DB', numero: 'UF_CRM_65BBEDE9CC615', bairro: 'UF_CRM_65BBEDEA1D04E', complemento: 'UF_CRM_65BBEDEA6498F', cep: 'UF_CRM_65BBEDEAA948C', cidade: 'UF_CRM_65BBEDEAE7EDC', uf: 'UF_CRM_65BBEDEB337B9' },
  // Arquivos (campos do tipo arquivo, múltiplos)
  arqDocumentoPF: 'UF_CRM_1707479591',
  arqDocumentosGerais: 'UF_CRM_1691521011524',
  arqUltimaFatura: 'UF_CRM_1778008028',
};

// Onde procurar CPF/CNPJ já cadastrado.
export const BUSCA = {
  leadCnpj: ['UF_CRM_3E3A4896'],
  leadCpf: ['UF_CRM_8EC4A9EE', 'UF_CRM_BC21AC3C'],
  companyCnpj: ['UF_CRM_62B34B216579D'],
  presetPJ: 5,
  presetPF: 7,
};
