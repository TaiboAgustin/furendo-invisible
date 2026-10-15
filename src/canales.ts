// Canales de aviso según lo configurado. Los usan las rutas y el cron de la revelación.

import type { Canales } from './avisos.ts';
import type { Env } from './tipos.ts';
import { mandarDM } from './discord.ts';
import { mandarMail } from './mail.ts';

export function canales(env: Env): Canales {
  const { DISCORD_BOT_TOKEN: token, BREVO_API_KEY: apiKey, MAIL_FROM: from } = env;
  return {
    discord: token ? (userId, embed, archivo) => mandarDM(token, userId, embed, archivo) : undefined,
    mail:
      apiKey && from
        ? (para, mail, archivo) =>
            mandarMail({ apiKey, from, fromName: env.MAIL_FROM_NAME || 'Furendo Invisible' }, para, mail, archivo)
        : undefined,
  };
}

export function configuracion(env: Env) {
  return {
    discord: !!(env.DISCORD_BOT_TOKEN && env.DISCORD_GUILD_ID),
    mail: !!(env.BREVO_API_KEY && env.MAIL_FROM),
    canalRevelacion: !!(env.DISCORD_BOT_TOKEN && env.DISCORD_REVEAL_CHANNEL_ID),
  };
}
