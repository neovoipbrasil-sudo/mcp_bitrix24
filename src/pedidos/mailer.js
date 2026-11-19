import nodemailer from 'nodemailer';

// E-mail do resumo do pedido. Desligado (sem erro) enquanto SMTP_HOST não estiver configurado.
// Variáveis: SMTP_HOST, SMTP_PORT (465 = SSL), SMTP_USER, SMTP_PASS, SMTP_FROM, PEDIDOS_EMAIL_COPIA (opcional, cópia oculta).
export function createMailer(env = process.env) {
  if (!env.SMTP_HOST) {
    return { enabled: false, async send() { return { skipped: true }; } };
  }
  const port = Number(env.SMTP_PORT || 465);
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return {
    enabled: true,
    async send({ to, subject, html, text }) {
      return transport.sendMail({
        from: env.SMTP_FROM || env.SMTP_USER,
        to,
        bcc: env.PEDIDOS_EMAIL_COPIA || undefined,
        subject,
        html,
        text,
      });
    },
  };
}
