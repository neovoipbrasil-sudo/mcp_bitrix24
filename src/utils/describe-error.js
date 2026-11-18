// Resumo de uma falha numa linha, para logs. NUNCA inclui a URL do webhook
// (ela contém o token de acesso ao Bitrix24): só o método REST chamado,
// o código/status e a mensagem.
export function describeError(err) {
  if (!err) return 'erro desconhecido';
  const url = err.config?.url;
  const method = typeof url === 'string' ? url.split('/').pop().replace(/\.json$/, '') : null;
  const status = err.response?.status;
  const parts = [];
  if (method) parts.push(method);
  if (err.code) parts.push(err.code);
  if (status) parts.push(`HTTP ${status}`);
  parts.push(err.message ?? String(err));
  return parts.join(' | ');
}

// Mostra só os 4 últimos dígitos do telefone nos logs.
export function maskPhone(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return digits.length > 4 ? `***${digits.slice(-4)}` : digits;
}
