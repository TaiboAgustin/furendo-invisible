// Envío de mails con la API transaccional de Brevo (plan gratis: 300 por día).

import type { Mail } from './mensajes.ts';

export type ConfigMail = { apiKey: string; from: string; fromName: string };

export async function mandarMail(
  cfg: ConfigMail,
  para: { email: string; nombre: string },
  mail: Mail,
  f: typeof fetch = fetch,
): Promise<void> {
  const r = await f('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': cfg.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: cfg.from, name: cfg.fromName },
      to: [{ email: para.email, name: para.nombre }],
      subject: mail.subject,
      textContent: mail.text,
      htmlContent: mail.html,
    }),
  });
  if (!r.ok) {
    const cuerpo = (await r.json().catch(() => ({}))) as { message?: string };
    throw new Error(`El servicio de mail respondió ${r.status}${cuerpo.message ? `: ${cuerpo.message}` : ''}.`);
  }
}
