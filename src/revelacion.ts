// La revelación: a cada uno le llega quién era su amigo invisible y, si hay un
// canal configurado, se publica la ronda completa en el server. La dispara el
// organizador desde el panel o el cron el día de la revelación.

import type { Env, Evento } from './tipos.ts';
import * as db from './db.ts';
import { avisar } from './avisos.ts';
import { canales } from './canales.ts';
import { mandarAlCanal } from './discord.ts';
import { embedResumenRevelacion, embedRevelacion, mailRevelacion } from './mensajes.ts';

/** Fecha de hoy en Argentina (YYYY-MM-DD): la revelación arranca a las 00 de ese día. */
export function hoyEnArgentina(ahora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
}

export { eventosParaRevelar } from './db.ts';

export type Progreso = { avisados: number; fallidos: number; pendientes: number; resumen: 'publicado' | 'sin-canal' | string };

/** Publica el resumen (una sola vez) y manda una tanda de avisos de revelación. */
export async function avisarRevelacion(env: Env, evento: Evento, limite: number): Promise<Progreso> {
  let resumen: Progreso['resumen'] = 'sin-canal';
  const canalId = env.DISCORD_REVEAL_CHANNEL_ID;
  if (evento.reveal_posted) {
    resumen = 'publicado';
  } else if (canalId && env.DISCORD_BOT_TOKEN) {
    try {
      await mandarAlCanal(
        env.DISCORD_BOT_TOKEN,
        canalId,
        embedResumenRevelacion(evento.name, await db.rondaConNombres(env.DB, evento.id)),
      );
      await db.marcarResumenPublicado(env.DB, evento.id);
      evento.reveal_posted = 1;
      resumen = 'publicado';
    } catch (e) {
      resumen = `No se pudo publicar en el canal: ${(e as Error).message}`;
    }
  }

  const can = canales(env);
  for (const p of await db.revelacionesPendientes(env.DB, evento.id, limite)) {
    const r = await avisar(
      p.destinatario,
      {
        embed: embedRevelacion(evento.name, p.quienLeRegalo, p.aQuienRegalo),
        mail: mailRevelacion(evento.name, p.quienLeRegalo),
      },
      can,
    );
    await db.registrarRevelacion(env.DB, evento.id, p.receiver_id, r.ok ? null : r.error);
  }

  const { avisados, fallidos, pendientes } = await db.estadoRevelacion(env.DB, evento.id);
  return { avisados, fallidos, pendientes, resumen };
}

/** Cada 50 llamadas externas por ejecución, como en el plan gratis: 20 avisos de 2 llamadas + el canal. */
const AVISOS_POR_EJECUCION_CRON = 20;

/** Lo que corre el cron: revela los eventos cuya fecha llegó y sigue con los que quedaron a medias. */
export async function revelarLoQueToca(env: Env, ahora = new Date()): Promise<string[]> {
  const log: string[] = [];
  for (const evento of await db.eventosParaRevelar(env.DB, hoyEnArgentina(ahora))) {
    if (await db.empezarRevelacion(env.DB, evento.id)) log.push(`Revelación iniciada: ${evento.name}`);
  }
  // Una tanda por ejecución: si quedan avisos o hay otro evento, sigue en la próxima hora.
  const [evento] = await db.revelacionesSinTerminar(env.DB);
  if (evento) {
    const p = await avisarRevelacion(env, evento, AVISOS_POR_EJECUCION_CRON);
    log.push(`${evento.name}: ${p.avisados} avisados, ${p.pendientes} pendientes, ${p.fallidos} fallidos`);
  }
  return log;
}
