// Decide por dónde avisarle a cada uno: Discord primero y mail de respaldo.

import { embedSorteo, mailSorteo, type DatosAviso, type Embed, type Mail } from './mensajes.ts';

export type Destinatario = {
  nombre: string;
  discordUserId: string | null;
  email: string | null;
};

export type Canales = {
  discord?: (userId: string, embed: Embed) => Promise<void>;
  mail?: (para: { email: string; nombre: string }, mail: Mail) => Promise<void>;
};

export type ResultadoAviso =
  | { ok: true; canal: 'discord' | 'mail'; nota?: string }
  | { ok: false; error: string };

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function avisar(
  a: Destinatario,
  contenido: { embed: Embed; mail: Mail },
  canales: Canales,
): Promise<ResultadoAviso> {
  let falloDiscord: string | null = null;

  if (a.discordUserId) {
    if (canales.discord) {
      try {
        await canales.discord(a.discordUserId, contenido.embed);
        return { ok: true, canal: 'discord' };
      } catch (e) {
        falloDiscord = `Discord: ${mensaje(e)}`;
      }
    } else {
      falloDiscord = 'El bot de Discord no está configurado.';
    }
  }

  if (a.email && canales.mail) {
    try {
      await canales.mail({ email: a.email, nombre: a.nombre }, contenido.mail);
      return { ok: true, canal: 'mail', nota: falloDiscord ?? undefined };
    } catch (e) {
      return { ok: false, error: [falloDiscord, `Mail: ${mensaje(e)}`].filter(Boolean).join(' ') };
    }
  }

  if (falloDiscord) return { ok: false, error: falloDiscord };
  if (a.email) return { ok: false, error: 'No tiene Discord vinculado y el mail no está configurado.' };
  return { ok: false, error: 'No tiene Discord vinculado ni mail.' };
}

export function contenidoSorteo(d: DatosAviso) {
  return { embed: embedSorteo(d), mail: mailSorteo(d) };
}
