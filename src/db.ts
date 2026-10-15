import type { Evento, Participante, Persona } from './tipos.ts';
import type { FilaImportada } from './importar.ts';

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
        `UPDATE people SET name = ?, email = COALESCE(?, email),
           discord_username = COALESCE(?, discord_username), address = COALESCE(?, address)
         WHERE id = ?`,
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
      .prepare('UPDATE people SET name = ?, email = ?, discord_username = ?, address = ? WHERE id = ?')
      .bind(persona.name, persona.email, persona.discord_username, persona.address, p.person_id),
    db
      .prepare('UPDATE participants SET wishlist = ?, sizes = ?, notes = ? WHERE id = ?')
      .bind(datos.wishlist, datos.sizes, datos.notes, p.participant_id),
  ]);
}

export async function quitarParticipante(db: D1Database, eventoId: number, participanteId: number): Promise<void> {
  await db.prepare('DELETE FROM participants WHERE event_id = ? AND id = ?').bind(eventoId, participanteId).run();
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
