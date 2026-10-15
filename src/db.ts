import type { EstadoAviso, Evento, Participante, Persona } from './tipos.ts';
import type { FilaImportada } from './importar.ts';
import type { Asignacion } from './sorteo.ts';
import type { DatosAviso } from './mensajes.ts';
import type { Contexto } from './interacciones.ts';

export type DatosEvento = Pick<
  Evento,
  'name' | 'budget_min' | 'budget_max' | 'deadline' | 'reveal_date' | 'form_csv_url'
>;

export type DatosPersona = Pick<Persona, 'name' | 'email' | 'discord_username' | 'address'>;
export type DatosParticipante = Pick<Participante, 'wishlist' | 'sizes' | 'notes'>;

// ---------- Eventos ----------

export type ResumenEvento = Evento & { participantes: number };

export async function listarEventos(db: D1Database): Promise<ResumenEvento[]> {
  const { results } = await db
    .prepare(
      `SELECT e.*, COUNT(p.id) AS participantes
       FROM events e LEFT JOIN participants p ON p.event_id = e.id AND p.status = 'activo'
       GROUP BY e.id ORDER BY e.created_at DESC, e.id DESC`,
    )
    .all<ResumenEvento>();
  return results;
}

export function obtenerEvento(db: D1Database, id: number): Promise<Evento | null> {
  return db.prepare('SELECT * FROM events WHERE id = ?').bind(id).first<Evento>();
}

export async function crearEvento(db: D1Database, d: DatosEvento): Promise<number> {
  const r = await db
    .prepare(
      `INSERT INTO events (name, budget_min, budget_max, deadline, reveal_date, form_csv_url)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(d.name, d.budget_min, d.budget_max, d.deadline, d.reveal_date, d.form_csv_url)
    .first<{ id: number }>();
  return r!.id;
}

export async function actualizarEvento(db: D1Database, id: number, d: DatosEvento): Promise<void> {
  await db
    .prepare(
      `UPDATE events SET name = ?, budget_min = ?, budget_max = ?, deadline = ?, reveal_date = ?, form_csv_url = ?
       WHERE id = ?`,
    )
    .bind(d.name, d.budget_min, d.budget_max, d.deadline, d.reveal_date, d.form_csv_url, id)
    .run();
}

export async function borrarEvento(db: D1Database, id: number): Promise<void> {
  // Las tablas hijas se borran explícitamente para no depender de que la base
  // tenga activadas las foreign keys (en D1 lo están, en otros SQLite no siempre).
  await db.batch([
    db.prepare('DELETE FROM assignments WHERE event_id = ?').bind(id),
    db.prepare('DELETE FROM participants WHERE event_id = ?').bind(id),
    db.prepare('DELETE FROM events WHERE id = ?').bind(id),
  ]);
}

// ---------- Participantes ----------

const SELECT_PARTICIPANTE = `
  SELECT pe.*, pa.id AS participant_id, pa.person_id, pa.wishlist, pa.sizes, pa.notes, pa.status
  FROM participants pa JOIN people pe ON pe.id = pa.person_id`;

export async function listarParticipantes(db: D1Database, eventoId: number): Promise<Participante[]> {
  const { results } = await db
    .prepare(`${SELECT_PARTICIPANTE} WHERE pa.event_id = ? ORDER BY pa.status, pe.name COLLATE NOCASE`)
    .bind(eventoId)
    .all<Participante>();
  return results;
}

export function obtenerParticipante(
  db: D1Database,
  eventoId: number,
  participanteId: number,
): Promise<Participante | null> {
  return db
    .prepare(`${SELECT_PARTICIPANTE} WHERE pa.event_id = ? AND pa.id = ?`)
    .bind(eventoId, participanteId)
    .first<Participante>();
}

/**
 * Busca a la persona por mail o por usuario de Discord; si no existe la crea.
 * Los datos nuevos que no vengan vacíos pisan a los guardados.
 */
async function guardarPersona(db: D1Database, d: DatosPersona): Promise<number> {
  const existente = await db
    .prepare(
      `SELECT id FROM people
       WHERE (?1 IS NOT NULL AND email = ?1) OR (?2 IS NOT NULL AND discord_username = ?2)
       ORDER BY (email = ?1) DESC LIMIT 1`,
    )
    .bind(d.email, d.discord_username)
    .first<{ id: number }>();

  if (existente) {
    await db
      .prepare(
        `UPDATE people SET name = ?1, email = COALESCE(?2, email), address = COALESCE(?4, address),
           discord_user_id = CASE WHEN ?3 IS NULL OR discord_username IS ?3 THEN discord_user_id ELSE NULL END,
           discord_username = COALESCE(?3, discord_username)
         WHERE id = ?5`,
      )
      .bind(d.name, d.email, d.discord_username, d.address, existente.id)
      .run();
    return existente.id;
  }
  const r = await db
    .prepare('INSERT INTO people (name, email, discord_username, address) VALUES (?, ?, ?, ?) RETURNING id')
    .bind(d.name, d.email, d.discord_username, d.address)
    .first<{ id: number }>();
  return r!.id;
}

export type ResultadoAlta = 'nuevo' | 'actualizado';

export async function sumarParticipante(
  db: D1Database,
  eventoId: number,
  persona: DatosPersona,
  datos: DatosParticipante,
): Promise<ResultadoAlta> {
  const personId = await guardarPersona(db, persona);
  const previo = await db
    .prepare('SELECT id FROM participants WHERE event_id = ? AND person_id = ?')
    .bind(eventoId, personId)
    .first<{ id: number }>();
  await db
    .prepare(
      `INSERT INTO participants (event_id, person_id, wishlist, sizes, notes) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (event_id, person_id) DO UPDATE SET
         wishlist = COALESCE(excluded.wishlist, wishlist),
         sizes = COALESCE(excluded.sizes, sizes),
         notes = COALESCE(excluded.notes, notes)`,
    )
    .bind(eventoId, personId, datos.wishlist, datos.sizes, datos.notes)
    .run();
  return previo ? 'actualizado' : 'nuevo';
}

export async function importarFilas(
  db: D1Database,
  eventoId: number,
  filas: FilaImportada[],
): Promise<{ nuevos: number; actualizados: number }> {
  let nuevos = 0;
  let actualizados = 0;
  for (const f of filas) {
    const r = await sumarParticipante(
      db,
      eventoId,
      { name: f.name, email: f.email, discord_username: f.discord_username, address: f.address },
      { wishlist: f.wishlist, sizes: f.sizes, notes: f.notes },
    );
    if (r === 'nuevo') nuevos++;
    else actualizados++;
  }
  return { nuevos, actualizados };
}

/** Edición desde el panel: acá un campo vacío sí borra el dato. */
export async function editarParticipante(
  db: D1Database,
  p: Participante,
  persona: DatosPersona,
  datos: DatosParticipante,
): Promise<void> {
  await db.batch([
    db
      // Si cambia el usuario de Discord, el vínculo anterior deja de valer.
      .prepare(
        `UPDATE people SET name = ?, email = ?, address = ?,
           discord_user_id = CASE WHEN discord_username IS ?4 THEN discord_user_id ELSE NULL END,
           discord_username = ?4
         WHERE id = ?5`,
      )
      .bind(persona.name, persona.email, persona.address, persona.discord_username, p.person_id),
    db
      .prepare('UPDATE participants SET wishlist = ?, sizes = ?, notes = ? WHERE id = ?')
      .bind(datos.wishlist, datos.sizes, datos.notes, p.participant_id),
  ]);
}

export async function quitarParticipante(db: D1Database, eventoId: number, participanteId: number): Promise<void> {
  await db.prepare('DELETE FROM participants WHERE event_id = ? AND id = ?').bind(eventoId, participanteId).run();
}

// ---------- Discord ----------

export async function vincularDiscord(db: D1Database, personId: number, discordUserId: string): Promise<void> {
  await db.prepare('UPDATE people SET discord_user_id = ? WHERE id = ?').bind(discordUserId, personId).run();
}

// ---------- Sorteo ----------

/**
 * Guarda el sorteo y marca el evento como sorteado en una sola transacción.
 * Si el evento ya no estaba en armado (doble clic, otra pestaña), no inserta nada.
 * Devuelve false en ese caso.
 */
export async function guardarSorteo(db: D1Database, eventoId: number, asignaciones: Asignacion[]): Promise<boolean> {
  const enBorrador = `(SELECT status FROM events WHERE id = ?) = 'borrador'`;
  const resultados = await db.batch([
    ...asignaciones.map((a) =>
      db
        .prepare(`INSERT INTO assignments (event_id, giver_id, receiver_id) SELECT ?, ?, ? WHERE ${enBorrador}`)
        .bind(eventoId, a.giver, a.receiver, eventoId),
    ),
    db
      .prepare(`UPDATE events SET status = 'sorteado', drawn_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'borrador'`)
      .bind(eventoId),
  ]);
  return (resultados.at(-1)?.meta.changes ?? 0) === 1;
}

export async function estadoAvisos(db: D1Database, eventoId: number): Promise<Map<number, EstadoAviso>> {
  const { results } = await db
    .prepare('SELECT giver_id, notified_at, notify_channel, notify_error FROM assignments WHERE event_id = ?')
    .bind(eventoId)
    .all<EstadoAviso>();
  return new Map(results.map((r) => [r.giver_id, r]));
}

export type AvisoPendiente = {
  giver_id: number;
  giver_name: string;
  giver_email: string | null;
  giver_discord_user_id: string | null;
  datos: DatosAviso;
};

/** Los avisos que todavía no salieron ni fallaron. Es lo único que lee a quién le toca a quién. */
export async function avisosPendientes(db: D1Database, evento: Evento, limite: number): Promise<AvisoPendiente[]> {
  const { results } = await db
    .prepare(
      `SELECT a.giver_id,
              gp.name AS giver_name, gp.email AS giver_email, gp.discord_user_id AS giver_discord_user_id,
              rp.name AS receiver_name, rp.address AS receiver_address,
              r.wishlist, r.sizes, r.notes
       FROM assignments a
       JOIN participants g ON g.id = a.giver_id JOIN people gp ON gp.id = g.person_id
       JOIN participants r ON r.id = a.receiver_id JOIN people rp ON rp.id = r.person_id
       WHERE a.event_id = ? AND a.notified_at IS NULL AND a.notify_error IS NULL
       LIMIT ?`,
    )
    .bind(evento.id, limite)
    .all<{
      giver_id: number;
      giver_name: string;
      giver_email: string | null;
      giver_discord_user_id: string | null;
      receiver_name: string;
      receiver_address: string | null;
      wishlist: string | null;
      sizes: string | null;
      notes: string | null;
    }>();
  return results.map((r) => ({
    giver_id: r.giver_id,
    giver_name: r.giver_name,
    giver_email: r.giver_email,
    giver_discord_user_id: r.giver_discord_user_id,
    datos: {
      evento: evento.name,
      budgetMin: evento.budget_min,
      budgetMax: evento.budget_max,
      entrega: evento.deadline,
      revelacion: evento.reveal_date,
      quienRegala: r.giver_name,
      aQuien: r.receiver_name,
      wishlist: r.wishlist,
      sizes: r.sizes,
      notes: r.notes,
      address: r.receiver_address,
    },
  }));
}

export async function registrarAviso(
  db: D1Database,
  eventoId: number,
  giverId: number,
  r: { canal: 'discord' | 'mail'; nota?: string } | { error: string },
): Promise<void> {
  const q =
    'error' in r
      ? db
          .prepare('UPDATE assignments SET notify_error = ? WHERE event_id = ? AND giver_id = ?')
          .bind(r.error, eventoId, giverId)
      : db
          .prepare(
            `UPDATE assignments SET notified_at = CURRENT_TIMESTAMP, notify_channel = ?, notify_error = ?
             WHERE event_id = ? AND giver_id = ?`,
          )
          .bind(r.canal, r.nota ?? null, eventoId, giverId);
  await q.run();
}

/** Vuelve a dejar como pendientes los avisos que fallaron, para reintentarlos. */
export async function reintentarAvisos(db: D1Database, eventoId: number): Promise<void> {
  await db
    .prepare('UPDATE assignments SET notify_error = NULL WHERE event_id = ? AND notified_at IS NULL')
    .bind(eventoId)
    .run();
}

// ---------- Bot ----------

/**
 * La persona que usa un comando. Si todavía no estaba vinculada pero su usuario
 * coincide con el cargado, la vincula en el momento (es lo que hace /unirme).
 */
export async function personaDeDiscord(
  db: D1Database,
  usuario: { id: string; username: string },
): Promise<{ id: number; name: string } | null> {
  const vinculada = await db
    .prepare('SELECT id, name FROM people WHERE discord_user_id = ?')
    .bind(usuario.id)
    .first<{ id: number; name: string }>();
  if (vinculada) return vinculada;

  const porUsuario = await db
    .prepare('SELECT id, name FROM people WHERE discord_username = ? AND discord_user_id IS NULL')
    .bind(usuario.username.toLowerCase())
    .first<{ id: number; name: string }>();
  if (!porUsuario) return null;
  await vincularDiscord(db, porUsuario.id, usuario.id);
  return porUsuario;
}

type FilaContacto = {
  name: string;
  email: string | null;
  discord_user_id: string | null;
  address: string | null;
  wishlist: string | null;
  sizes: string | null;
  notes: string | null;
};

/** Datos del sorteo en curso para quien usa el bot: a quién le regala y quién le regala. */
export async function contextoBot(
  db: D1Database,
  personaId: number,
): Promise<Contexto | null | 'sin-sortear'> {
  const actual = await db
    .prepare(
      `SELECT e.*, pa.id AS mi_participacion, pe.name AS mi_nombre
       FROM participants pa JOIN events e ON e.id = pa.event_id JOIN people pe ON pe.id = pa.person_id
       WHERE pa.person_id = ? AND pa.status = 'activo' AND e.status IN ('borrador', 'sorteado')
       ORDER BY (e.status = 'sorteado') DESC, e.drawn_at DESC, e.id DESC LIMIT 1`,
    )
    .bind(personaId)
    .first<Evento & { mi_participacion: number; mi_nombre: string }>();
  if (!actual) return null;
  if (actual.status !== 'sorteado') return 'sin-sortear';

  // El otro extremo de mi asignación: si busco por giver_id obtengo a quién le regalo, y al revés.
  const otro = (yoComo: 'giver_id' | 'receiver_id', otroComo: 'giver_id' | 'receiver_id') =>
    db
      .prepare(
        `SELECT pe.name, pe.email, pe.discord_user_id, pe.address, pa.wishlist, pa.sizes, pa.notes
         FROM assignments a JOIN participants pa ON pa.id = a.${otroComo} JOIN people pe ON pe.id = pa.person_id
         WHERE a.event_id = ? AND a.${yoComo} = ?`,
      )
      .bind(actual.id, actual.mi_participacion)
      .first<FilaContacto>();
  const [receptor, regalador] = await Promise.all([otro('giver_id', 'receiver_id'), otro('receiver_id', 'giver_id')]);
  if (!receptor || !regalador) return null;

  return {
    evento: actual,
    yo: { name: actual.mi_nombre },
    receptor: {
      nombre: receptor.name,
      discordUserId: receptor.discord_user_id,
      email: receptor.email,
      address: receptor.address,
      wishlist: receptor.wishlist,
      sizes: receptor.sizes,
      notes: receptor.notes,
    },
    regalador: { nombre: regalador.name, discordUserId: regalador.discord_user_id, email: regalador.email },
  };
}

// ---------- Personas ----------

export type ResumenPersona = Persona & { eventos: number };

export async function listarPersonas(db: D1Database): Promise<ResumenPersona[]> {
  const { results } = await db
    .prepare(
      `SELECT pe.*, COUNT(pa.id) AS eventos
       FROM people pe LEFT JOIN participants pa ON pa.person_id = pe.id
       GROUP BY pe.id ORDER BY pe.name COLLATE NOCASE`,
    )
    .all<ResumenPersona>();
  return results;
}

/** Error de base por mail o Discord repetido, para mostrar un mensaje claro. */
export function esDuplicado(e: unknown): 'email' | 'discord' | null {
  const msg = e instanceof Error ? e.message : String(e);
  if (!/UNIQUE constraint failed/i.test(msg)) return null;
  return /email/.test(msg) ? 'email' : 'discord';
}
