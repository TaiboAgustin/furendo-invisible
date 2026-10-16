import type { EstadoAviso, Evento, Participante, Persona } from './tipos.ts';
import type { FilaImportada } from './importar.ts';
import { ordenarRonda, reacomodar, type Asignacion } from './sorteo.ts';
import type { DatosAviso } from './mensajes.ts';
import type { Contexto, EstadoEntrega, Participacion, ResultadoPedido } from './interacciones.ts';

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
export async function avisosPendientes(
  db: D1Database,
  evento: Evento,
  limite: number,
  soloRegalador?: number,
): Promise<AvisoPendiente[]> {
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
         AND (?3 IS NULL OR a.giver_id = ?3)
       LIMIT ?2`,
    )
    .bind(evento.id, limite, soloRegalador ?? null)
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
  participacion: number;
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
       WHERE pa.person_id = ? AND pa.status = 'activo' AND e.status IN ('borrador', 'sorteado', 'revelado')
       ORDER BY CASE e.status WHEN 'sorteado' THEN 0 WHEN 'borrador' THEN 1 ELSE 2 END,
                e.drawn_at DESC, e.id DESC
       LIMIT 1`,
    )
    .bind(personaId)
    .first<Evento & { mi_participacion: number; mi_nombre: string }>();
  if (!actual) return null;
  if (actual.status === 'borrador') return 'sin-sortear';

  // El otro extremo de mi asignación: si busco por giver_id obtengo a quién le regalo, y al revés.
  const otro = (yoComo: 'giver_id' | 'receiver_id', otroComo: 'giver_id' | 'receiver_id') =>
    db
      .prepare(
        `SELECT pa.id AS participacion, pe.name, pe.email, pe.discord_user_id, pe.address, pa.wishlist, pa.sizes, pa.notes
         FROM assignments a JOIN participants pa ON pa.id = a.${otroComo} JOIN people pe ON pe.id = pa.person_id
         WHERE a.event_id = ? AND a.${yoComo} = ?`,
      )
      .bind(actual.id, actual.mi_participacion)
      .first<FilaContacto>();
  const [receptor, regalador] = await Promise.all([otro('giver_id', 'receiver_id'), otro('receiver_id', 'giver_id')]);
  if (!receptor || !regalador) return null;

  return {
    evento: actual,
    yo: { name: actual.mi_nombre, participacion: actual.mi_participacion },
    receptor: {
      nombre: receptor.name,
      discordUserId: receptor.discord_user_id,
      email: receptor.email,
      address: receptor.address,
      wishlist: receptor.wishlist,
      sizes: receptor.sizes,
      notes: receptor.notes,
    },
    regalador: {
      nombre: regalador.name,
      discordUserId: regalador.discord_user_id,
      email: regalador.email,
      participacion: regalador.participacion,
    },
  };
}

// ---------- Pedidos de vinculación por mail ----------

export async function pedirVinculo(
  db: D1Database,
  usuario: { id: string; username: string },
  mail: string,
): Promise<ResultadoPedido> {
  const p = await db
    .prepare('SELECT id, discord_user_id, discord_pending_id FROM people WHERE email = ?')
    .bind(mail)
    .first<{ id: number; discord_user_id: string | null; discord_pending_id: string | null }>();
  if (!p) return 'no-existe';
  if (p.discord_user_id) return 'ya-vinculado';
  if (p.discord_pending_id === usuario.id) return 'ya-pedido';
  await db
    .prepare(
      `UPDATE people SET discord_pending_id = ?, discord_pending_username = ?, discord_pending_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(usuario.id, usuario.username.toLowerCase(), p.id)
    .run();
  return 'pedido';
}

export type PedidoVinculo = { person_id: number; name: string; email: string; discord_pending_username: string };

export async function pedidosDeVinculo(db: D1Database, eventoId: number): Promise<PedidoVinculo[]> {
  const { results } = await db
    .prepare(
      `SELECT pe.id AS person_id, pe.name, pe.email, pe.discord_pending_username
       FROM participants pa JOIN people pe ON pe.id = pa.person_id
       WHERE pa.event_id = ? AND pa.status = 'activo' AND pe.discord_pending_id IS NOT NULL
       ORDER BY pe.discord_pending_at`,
    )
    .bind(eventoId)
    .all<PedidoVinculo>();
  return results;
}

/**
 * Confirma el pedido: la cuenta queda vinculada y, si el aviso del sorteo había
 * fallado por no tener Discord, vuelve a pendiente para mandarse solo.
 * Devuelve el id de Discord vinculado, o null si no había pedido.
 */
export async function confirmarVinculo(db: D1Database, eventoId: number, personId: number): Promise<string | null> {
  const p = await db
    .prepare('SELECT discord_pending_id FROM people WHERE id = ? AND discord_pending_id IS NOT NULL')
    .bind(personId)
    .first<{ discord_pending_id: string }>();
  if (!p) return null;
  await db.batch([
    db
      .prepare(
        `UPDATE people SET discord_user_id = discord_pending_id, discord_username = discord_pending_username,
           discord_pending_id = NULL, discord_pending_username = NULL, discord_pending_at = NULL
         WHERE id = ?`,
      )
      .bind(personId),
    db
      .prepare(
        `UPDATE assignments SET notify_error = NULL
         WHERE event_id = ? AND notified_at IS NULL
           AND giver_id IN (SELECT id FROM participants WHERE event_id = ? AND person_id = ?)`,
      )
      .bind(eventoId, eventoId, personId),
  ]);
  return p.discord_pending_id;
}

export async function rechazarVinculo(db: D1Database, personId: number): Promise<void> {
  await db
    .prepare(
      'UPDATE people SET discord_pending_id = NULL, discord_pending_username = NULL, discord_pending_at = NULL WHERE id = ?',
    )
    .bind(personId)
    .run();
}

// ---------- Lista de deseos desde el bot ----------

/** El evento en armado o sorteado donde participa (el sorteado tiene prioridad). */
export async function participacionBot(db: D1Database, personaId: number): Promise<Participacion | null> {
  const p = await db
    .prepare(
      `SELECT pa.id, pa.wishlist, pa.sizes, e.id AS evento_id, e.name AS evento, e.status
       FROM participants pa JOIN events e ON e.id = pa.event_id
       WHERE pa.person_id = ? AND pa.status = 'activo' AND e.status IN ('borrador', 'sorteado')
       ORDER BY (e.status = 'sorteado') DESC, e.id DESC LIMIT 1`,
    )
    .bind(personaId)
    .first<{
      id: number;
      wishlist: string | null;
      sizes: string | null;
      evento_id: number;
      evento: string;
      status: string;
    }>();
  if (!p) return null;

  const sorteado = p.status === 'sorteado';
  const regalador = sorteado
    ? await db
        .prepare(
          `SELECT pe.name, pe.email, pe.discord_user_id FROM assignments a
           JOIN participants g ON g.id = a.giver_id JOIN people pe ON pe.id = g.person_id
           WHERE a.event_id = ? AND a.receiver_id = ?`,
        )
        .bind(p.evento_id, p.id)
        .first<{ name: string; email: string | null; discord_user_id: string | null }>()
    : null;

  return {
    id: p.id,
    evento: p.evento,
    sorteado,
    deseos: p.wishlist,
    talles: p.sizes,
    regalador: regalador
      ? { nombre: regalador.name, email: regalador.email, discordUserId: regalador.discord_user_id }
      : null,
  };
}

export async function guardarDeseos(db: D1Database, participacionId: number, deseos: string | null): Promise<void> {
  await db.prepare('UPDATE participants SET wishlist = ? WHERE id = ?').bind(deseos, participacionId).run();
}

export async function guardarTalles(db: D1Database, participacionId: number, talles: string | null): Promise<void> {
  await db.prepare('UPDATE participants SET sizes = ? WHERE id = ?').bind(talles, participacionId).run();
}

// ---------- Bajas ----------

export type ResultadoBaja = {
  regalador: number;
  /** Quien le regalaba a la baja ya había mandado o entregado algo. */
  regaladorYaHabiaEnviado: boolean;
  /** La baja ya le había mandado su regalo a su amigo invisible: esa persona recibe dos. */
  bajaYaHabiaEnviado: boolean;
};

/** Da de baja a alguien después del sorteo con el reacomodo mínimo. Todo en una transacción. */
export async function darDeBaja(db: D1Database, eventoId: number, baja: number): Promise<ResultadoBaja> {
  const [{ results: asignaciones }, { results: entregas }] = await Promise.all([
    db
      .prepare('SELECT giver_id AS giver, receiver_id AS receiver FROM assignments WHERE event_id = ?')
      .bind(eventoId)
      .all<Asignacion>(),
    db.prepare('SELECT giver_id FROM deliveries WHERE event_id = ?').bind(eventoId).all<{ giver_id: number }>(),
  ]);
  const { regalador, nuevoReceptor } = reacomodar(asignaciones, baja);
  const conEntrega = new Set(entregas.map((e) => e.giver_id));

  await db.batch([
    db.prepare('DELETE FROM assignments WHERE event_id = ? AND giver_id = ?').bind(eventoId, baja),
    // El aviso vuelve a pendiente: quien regalaba tiene que enterarse del cambio.
    db
      .prepare(
        `UPDATE assignments SET receiver_id = ?, notified_at = NULL, notify_channel = NULL, notify_error = NULL
         WHERE event_id = ? AND giver_id = ?`,
      )
      .bind(nuevoReceptor, eventoId, regalador),
    db.prepare('DELETE FROM deliveries WHERE event_id = ? AND giver_id IN (?, ?)').bind(eventoId, regalador, baja),
    db.prepare(`UPDATE participants SET status = 'baja' WHERE event_id = ? AND id = ?`).bind(eventoId, baja),
  ]);

  return {
    regalador,
    regaladorYaHabiaEnviado: conEntrega.has(regalador),
    bajaYaHabiaEnviado: conEntrega.has(baja),
  };
}

// ---------- Revelación ----------

/** Pasa el evento a revelado. Devuelve false si ya no estaba sorteado. */
export async function empezarRevelacion(db: D1Database, eventoId: number): Promise<boolean> {
  const r = await db
    .prepare(`UPDATE events SET status = 'revelado', revealed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'sorteado'`)
    .bind(eventoId)
    .run();
  return r.meta.changes === 1;
}

export async function eventosParaRevelar(db: D1Database, hoy: string): Promise<Evento[]> {
  const { results } = await db
    .prepare(`SELECT * FROM events WHERE status = 'sorteado' AND reveal_date IS NOT NULL AND reveal_date <= ?`)
    .bind(hoy)
    .all<Evento>();
  return results;
}

/** Eventos ya revelados que todavía tienen avisos de revelación sin mandar. */
export async function revelacionesSinTerminar(db: D1Database): Promise<Evento[]> {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT e.* FROM events e JOIN assignments a ON a.event_id = e.id
       WHERE e.status = 'revelado' AND a.reveal_notified_at IS NULL AND a.reveal_error IS NULL`,
    )
    .all<Evento>();
  return results;
}

export async function marcarResumenPublicado(db: D1Database, eventoId: number): Promise<void> {
  await db.prepare('UPDATE events SET reveal_posted = 1 WHERE id = ?').bind(eventoId).run();
}

/** La ronda con nombres. Solo se usa con el evento ya revelado. */
export async function rondaConNombres(
  db: D1Database,
  eventoId: number,
): Promise<{ giver: number; de: string; para: string }[]> {
  const { results } = await db
    .prepare(
      `SELECT a.giver_id AS giver, a.receiver_id AS receiver, gp.name AS de, rp.name AS para
       FROM assignments a
       JOIN participants g ON g.id = a.giver_id JOIN people gp ON gp.id = g.person_id
       JOIN participants r ON r.id = a.receiver_id JOIN people rp ON rp.id = r.person_id
       WHERE a.event_id = ?`,
    )
    .bind(eventoId)
    .all<Asignacion & { de: string; para: string }>();
  const nombres = new Map(results.map((r) => [r.giver, r]));
  return ordenarRonda(results).map((a) => {
    const fila = nombres.get(a.giver)!;
    return { giver: a.giver, de: fila.de, para: fila.para };
  });
}

export type RevelacionPendiente = {
  receiver_id: number;
  destinatario: { nombre: string; discordUserId: string | null; email: string | null };
  quienLeRegalo: string;
  aQuienRegalo: string | null;
};

/** Avisos de "tu amigo invisible era…": van a quien RECIBE. */
export async function revelacionesPendientes(
  db: D1Database,
  eventoId: number,
  limite: number,
): Promise<RevelacionPendiente[]> {
  const { results } = await db
    .prepare(
      `SELECT a.receiver_id, rp.name AS nombre, rp.discord_user_id, rp.email, gp.name AS quien_le_regalo,
              (SELECT xp.name FROM assignments a2 JOIN participants x ON x.id = a2.receiver_id
                 JOIN people xp ON xp.id = x.person_id
               WHERE a2.event_id = a.event_id AND a2.giver_id = a.receiver_id) AS a_quien_regalo
       FROM assignments a
       JOIN participants g ON g.id = a.giver_id JOIN people gp ON gp.id = g.person_id
       JOIN participants r ON r.id = a.receiver_id JOIN people rp ON rp.id = r.person_id
       WHERE a.event_id = ? AND a.reveal_notified_at IS NULL AND a.reveal_error IS NULL
       LIMIT ?`,
    )
    .bind(eventoId, limite)
    .all<{
      receiver_id: number;
      nombre: string;
      discord_user_id: string | null;
      email: string | null;
      quien_le_regalo: string;
      a_quien_regalo: string | null;
    }>();
  return results.map((r) => ({
    receiver_id: r.receiver_id,
    destinatario: { nombre: r.nombre, discordUserId: r.discord_user_id, email: r.email },
    quienLeRegalo: r.quien_le_regalo,
    aQuienRegalo: r.a_quien_regalo,
  }));
}

export async function registrarRevelacion(
  db: D1Database,
  eventoId: number,
  receiverId: number,
  error: string | null,
): Promise<void> {
  await db
    .prepare(
      `UPDATE assignments SET
         reveal_notified_at = CASE WHEN ?1 IS NULL THEN CURRENT_TIMESTAMP END,
         reveal_error = ?1
       WHERE event_id = ?2 AND receiver_id = ?3`,
    )
    .bind(error, eventoId, receiverId)
    .run();
}

export async function reintentarRevelacion(db: D1Database, eventoId: number): Promise<void> {
  await db
    .prepare('UPDATE assignments SET reveal_error = NULL WHERE event_id = ? AND reveal_notified_at IS NULL')
    .bind(eventoId)
    .run();
}

export type EstadoRevelacion = {
  ronda: { giver: number; de: string; para: string }[];
  avisados: number;
  fallidos: number;
  pendientes: number;
};

export async function estadoRevelacion(db: D1Database, eventoId: number): Promise<EstadoRevelacion> {
  const [ronda, conteo] = await Promise.all([
    rondaConNombres(db, eventoId),
    db
      .prepare(
        `SELECT SUM(reveal_notified_at IS NOT NULL) AS avisados,
                SUM(reveal_notified_at IS NULL AND reveal_error IS NOT NULL) AS fallidos,
                SUM(reveal_notified_at IS NULL AND reveal_error IS NULL) AS pendientes
         FROM assignments WHERE event_id = ?`,
      )
      .bind(eventoId)
      .first<{ avisados: number | null; fallidos: number | null; pendientes: number | null }>(),
  ]);
  return {
    ronda,
    avisados: conteo?.avisados ?? 0,
    fallidos: conteo?.fallidos ?? 0,
    pendientes: conteo?.pendientes ?? 0,
  };
}

export async function cerrarEvento(db: D1Database, eventoId: number): Promise<void> {
  await db.prepare(`UPDATE events SET status = 'cerrado' WHERE id = ? AND status = 'revelado'`).bind(eventoId).run();
}

// ---------- Entregas ----------

/** Un "recibido" no vuelve atrás aunque después llegue un /enviado o /entregar. */
export async function registrarEntrega(
  db: D1Database,
  eventoId: number,
  regaladorId: number,
  estado: EstadoEntrega,
  virtual: boolean,
): Promise<void> {
  const recibido = estado === 'recibido';
  await db
    .prepare(
      `INSERT INTO deliveries (event_id, giver_id, status, virtual, sent_at, received_at)
       VALUES (?1, ?2, ?3, ?4, CASE WHEN ?5 THEN NULL ELSE CURRENT_TIMESTAMP END, CASE WHEN ?5 THEN CURRENT_TIMESTAMP END)
       ON CONFLICT (event_id, giver_id) DO UPDATE SET
         status = CASE WHEN deliveries.status = 'recibido' THEN 'recibido' ELSE excluded.status END,
         virtual = MAX(deliveries.virtual, excluded.virtual),
         sent_at = COALESCE(deliveries.sent_at, excluded.sent_at),
         received_at = COALESCE(deliveries.received_at, excluded.received_at)`,
    )
    .bind(eventoId, regaladorId, estado, virtual ? 1 : 0, recibido ? 1 : 0)
    .run();
}

/**
 * Estado del regalo que le llega a cada participante, indexado por quien lo RECIBE.
 * Muestra cómo va cada uno sin decir quién se lo manda.
 */
export async function estadoEntregas(db: D1Database, eventoId: number): Promise<Map<number, EstadoEntrega>> {
  const { results } = await db
    .prepare(
      `SELECT a.receiver_id, d.status FROM deliveries d
       JOIN assignments a ON a.event_id = d.event_id AND a.giver_id = d.giver_id
       WHERE d.event_id = ?`,
    )
    .bind(eventoId)
    .all<{ receiver_id: number; status: EstadoEntrega }>();
  return new Map(results.map((r) => [r.receiver_id, r.status]));
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
