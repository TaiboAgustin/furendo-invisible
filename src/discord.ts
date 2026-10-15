// Cliente mínimo de la API REST de Discord. El bot no necesita estar conectado
// al gateway para mandar mensajes privados ni para buscar miembros del server.

import type { Embed } from './mensajes.ts';

const API = 'https://discord.com/api/v10';

export class ErrorDiscord extends Error {
  readonly status: number;
  readonly codigo?: number;

  constructor(message: string, status: number, codigo?: number) {
    super(message);
    this.status = status;
    this.codigo = codigo;
  }
}

type Fetch = typeof fetch;

async function llamar<T>(token: string, ruta: string, init: RequestInit = {}, f: Fetch = fetch): Promise<T> {
  for (let intento = 0; ; intento++) {
    const r = await f(`${API}${ruta}`, {
      ...init,
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'FurendoInvisible (https://github.com/TaiboAgustin/furendo-invisible, 0.2)',
      },
    });
    if (r.status === 429 && intento < 2) {
      const cuerpo = (await r.json().catch(() => ({}))) as { retry_after?: number };
      await new Promise((ok) => setTimeout(ok, Math.min((cuerpo.retry_after ?? 1) * 1000, 5000)));
      continue;
    }
    if (!r.ok) {
      const cuerpo = (await r.json().catch(() => ({}))) as { code?: number; message?: string };
      throw new ErrorDiscord(explicar(r.status, cuerpo.code, cuerpo.message), r.status, cuerpo.code);
    }
    return (await r.json()) as T;
  }
}

function explicar(status: number, codigo?: number, mensaje?: string): string {
  if (codigo === 50007) return 'Tiene cerrados los mensajes privados de miembros del server.';
  if (codigo === 10013) return 'Esa cuenta de Discord no existe.';
  if (codigo === 10004) return 'El bot no está en el server configurado.';
  if (status === 401) return 'El token del bot no es válido.';
  if (status === 403) return 'El bot no tiene permiso para hacer eso.';
  return `Discord respondió ${status}${mensaje ? `: ${mensaje}` : ''}.`;
}

type Miembro = { user: { id: string; username: string; bot?: boolean }; nick?: string | null };

/** Busca en el server a alguien por su nombre de usuario exacto. Devuelve su id o null. */
export async function buscarMiembro(
  token: string,
  guildId: string,
  username: string,
  f: Fetch = fetch,
): Promise<string | null> {
  const q = new URLSearchParams({ query: username, limit: '20' });
  const miembros = await llamar<Miembro[]>(token, `/guilds/${guildId}/members/search?${q}`, {}, f);
  const exacto = miembros.find((m) => !m.user.bot && m.user.username.toLowerCase() === username.toLowerCase());
  return exacto?.user.id ?? null;
}

export async function mandarDM(token: string, userId: string, embed: Embed, f: Fetch = fetch): Promise<void> {
  const canal = await llamar<{ id: string }>(
    token,
    '/users/@me/channels',
    { method: 'POST', body: JSON.stringify({ recipient_id: userId }) },
    f,
  );
  await llamar(
    token,
    `/channels/${canal.id}/messages`,
    { method: 'POST', body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }) },
    f,
  );
}
