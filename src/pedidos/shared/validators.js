// Máscaras e validações do formulário de pedidos.
// Módulo isomórfico: roda no navegador (servido em /formulario/shared/validators.js)
// e no servidor, que revalida tudo antes de mandar ao Bitrix24.

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

// DDDs válidos no Brasil (Anatel).
export const DDDS = [
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
];

export const onlyDigits = (v) => String(v ?? '').replace(/\D/g, '');

function applyPattern(digits, pattern) {
  let out = '';
  let i = 0;
  for (const ch of pattern) {
    if (i >= digits.length) break;
    if (ch === '0') out += digits[i++];
    else out += ch;
  }
  return out;
}

export const mask = {
  cpf: (v) => applyPattern(onlyDigits(v).slice(0, 11), '000.000.000-00'),
  cnpj: (v) => applyPattern(onlyDigits(v).slice(0, 14), '00.000.000/0000-00'),
  cep: (v) => applyPattern(onlyDigits(v).slice(0, 8), '00000-000'),
  date: (v) => applyPattern(onlyDigits(v).slice(0, 8), '00/00/0000'),
  // Telefone único: +DDI (DDD) X XXXX-XXXX. DDI padrão 55.
  phone: (v) => {
    let d = onlyDigits(v);
    if (d && !d.startsWith('55')) d = '55' + d;
    return applyPattern(d.slice(0, 13), '+00 (00) 0 0000-0000');
  },
  // Números de portabilidade: 8 ou 9 dígitos depois do DDD (nunca mais que 9).
  phonePort: (v) => {
    let d = onlyDigits(v);
    if (d && !d.startsWith('55')) d = '55' + d;
    d = d.slice(0, 13);
    return applyPattern(d, d.length === 13 ? '+00 (00) 0 0000-0000' : '+00 (00) 0000-0000');
  },
};

// Telefone gravado no Bitrix: só dígitos, sem "+" (ex.: 5561999999999).
export const phoneDigits = (v) => {
  let d = onlyDigits(v);
  if (d && !d.startsWith('55')) d = '55' + d;
  return d;
};

// Telefone como vai para os campos do card no Bitrix: "55 (61) 9 9999-9999" ou, fixo de 8 dígitos, "55 (61) 3333-4444".
export function phoneCrm(v) {
  const d = phoneDigits(v);
  if (d.length === 13) return `${d.slice(0, 2)} (${d.slice(2, 4)}) ${d[4]} ${d.slice(5, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return d;
}

export function isValidCPF(v) {
  const d = onlyDigits(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function isValidCNPJ(v) {
  const d = onlyDigits(v);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

// Celular/telefone brasileiro com DDI 55, DDD válido e 9 dígitos (todos os campos usam esse formato).
export function isValidPhone(v) {
  const d = phoneDigits(v);
  if (d.length !== 13 || !d.startsWith('55')) return false;
  return DDDS.includes(Number(d.slice(2, 4)));
}

// Portabilidade: DDI 55 + DDD válido + 8 ou 9 dígitos.
export function isValidPhonePort(v) {
  const d = phoneDigits(v);
  if (!(d.length === 12 || d.length === 13) || !d.startsWith('55')) return false;
  return DDDS.includes(Number(d.slice(2, 4)));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TYPO_DOMAINS = {
  'gmial.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.co': 'gmail.com',
  'gamil.com': 'gmail.com', 'hotmal.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmail.con': 'hotmail.com',
  'outlok.com': 'outlook.com', 'outlook.con': 'outlook.com', 'yahoo.com.br.': 'yahoo.com.br', 'yaho.com.br': 'yahoo.com.br',
};

export function isValidEmail(v) {
  const s = String(v ?? '').trim();
  return EMAIL_RE.test(s) && !TYPO_DOMAINS[s.split('@')[1]?.toLowerCase()];
}

export function emailTypoSuggestion(v) {
  const [user, domain] = String(v ?? '').trim().split('@');
  const fix = domain && TYPO_DOMAINS[domain.toLowerCase()];
  return fix ? `${user}@${fix}` : null;
}

// "DD/MM/AAAA" → Date (meia-noite local) ou null se a data não existe.
export function parseDate(v) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v ?? '').trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m.map(Number);
  const dt = new Date(yyyy, mm - 1, dd);
  if (dt.getFullYear() !== yyyy || dt.getMonth() !== mm - 1 || dt.getDate() !== dd) return null;
  if (yyyy < 1900) return null;
  return dt;
}

export function isValidDate(v, { notFuture = true, minAge = null, today = new Date() } = {}) {
  const dt = parseDate(v);
  if (!dt) return false;
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (notFuture && dt > t) return false;
  if (minAge != null) {
    const limit = new Date(t.getFullYear() - minAge, t.getMonth(), t.getDate());
    if (dt > limit) return false;
  }
  return true;
}

export const isValidCEP = (v) => onlyDigits(v).length === 8;
export const isValidUF = (v) => UFS.includes(String(v ?? '').toUpperCase());
export const isValidDDD = (v) => DDDS.includes(Number(onlyDigits(v)));

// Mensagens usadas no navegador e no servidor.
export const MESSAGES = {
  required: 'Campo obrigatório.',
  cpf: 'CPF inválido.',
  cnpj: 'CNPJ inválido.',
  phone: 'Telefone inválido. Use +55 (DDD) 9 XXXX-XXXX.',
  phonePort: 'Número inválido. Use +55 (DDD) e 8 ou 9 dígitos.',
  email: 'E-mail inválido.',
  date: 'Data inválida (DD/MM/AAAA).',
  birth: 'Data inválida: a pessoa precisa ter 18 anos ou mais.',
  cep: 'CEP inválido.',
  uf: 'UF inválida.',
  ddd: 'DDD inválido.',
};

// Valida um valor pelo tipo do campo. Retorna a mensagem de erro ou null.
export function validateValue(type, value, { required = true } = {}) {
  const empty = value == null || String(value).trim() === '';
  if (empty) return required ? MESSAGES.required : null;
  switch (type) {
    case 'cpf': return isValidCPF(value) ? null : MESSAGES.cpf;
    case 'cnpj': return isValidCNPJ(value) ? null : MESSAGES.cnpj;
    case 'phone': return isValidPhone(value) ? null : MESSAGES.phone;
    case 'phonePort': return isValidPhonePort(value) ? null : MESSAGES.phonePort;
    case 'email': {
      const fix = emailTypoSuggestion(value);
      if (fix) return `E-mail parece ter erro de digitação. Você quis dizer ${fix}?`;
      return isValidEmail(value) ? null : MESSAGES.email;
    }
    case 'date': return isValidDate(value) ? null : MESSAGES.date;
    case 'birth': return isValidDate(value, { minAge: 18 }) ? null : MESSAGES.birth;
    case 'cep': return isValidCEP(value) ? null : MESSAGES.cep;
    case 'uf': return isValidUF(value) ? null : MESSAGES.uf;
    case 'ddd': return isValidDDD(value) ? null : MESSAGES.ddd;
    default: return null;
  }
}
