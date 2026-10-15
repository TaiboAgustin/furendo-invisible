import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Env, Evento } from './tipos.ts';
import * as db from './db.ts';
import { interpretarCsv, limpiarDiscord, urlCsvDeGoogleSheet } from './importar.ts';
import { COOKIE_SESION, DURACION_SESION_SEG, contrasenaCorrecta, crearSesion, sesionValida } from './sesion.ts';
import { sortear } from './sorteo.ts';
import { avisar, contenidoSorteo } from './avisos.ts';
import { buscarMiembro, completarRespuesta, mandarDM } from './discord.ts';
import { embedCambio, embedPrueba, embedVinculado, mailCambio, mailPrueba } from './mensajes.ts';
import { canales, configuracion } from './canales.ts';
import { avisarRevelacion, revelarLoQueToca } from './revelacion.ts';
import { firmaValida } from './firma.ts';
import { MAX_ARCHIVO, manejarInteraccion, type Interaccion } from './interacciones.ts';
import type { Aviso } from './vistas/layout.tsx';
import {
  PaginaEvento,
  PaginaEventos,
  PaginaImportar,
  PaginaLogin,
  PaginaParticipante,
  PaginaPersonas,
  alcanzable,
} from './vistas/paginas.tsx';

const app = new Hono<{ Bindings: Env }>();

// ---------- Utilidades de formularios ----------

type Form = Record<string, string | File>;

function texto(f: Form, k: string): string | null {
  const v = f[k];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function entero(f: Form, k: string): number | null {
  const v = texto(f, k);
  if (v == null) return null;
  const n = Number(v.replace(/[.$\s]/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function fecha(f: Form, k: string): string | null {
  const v = texto(f, k);
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function id(c: Context, nombre: string): number | null {
  const n = Number(c.req.param(nombre));
  return Number.isInteger(n) && n > 0 ? n : null;
}

type C = Context<{ Bindings: Env }>;

async function cargarEvento(c: C) {
  const eventoId = id(c, 'id');
  return eventoId ? db.obtenerEvento(c.env.DB, eventoId) : null;
}

async function cargarParticipante(c: C, eventoId: number) {
  const pid = id(c, 'pid');
  return pid ? db.obtenerParticipante(c.env.DB, eventoId, pid) : null;
}

// Mensajes de confirmación que viajan en la URL después de un POST (?ok=...).
const AVISOS: Record<string, Aviso> = {
  creado: { tipo: 'ok', texto: 'Evento creado.' },
  guardado: { tipo: 'ok', texto: 'Cambios guardados.' },
  agregado: { tipo: 'ok', texto: 'Participante agregado.' },
  quitado: { tipo: 'ok', texto: 'Participante quitado del evento.' },
  borrado: { tipo: 'ok', texto: 'Evento borrado.' },
  sorteado: { tipo: 'ok', texto: 'Sorteo hecho. Los sobres quedaron sellados.' },
  revelado: { tipo: 'ok', texto: 'Revelación en marcha: los sobres se abrieron.' },
  cerrado: { tipo: 'ok', texto: 'Evento cerrado. Queda guardado como recuerdo.' },
};

async function paginaEvento(c: C, evento: Evento, aviso: Aviso | null, status: 200 | 400 | 409 = 200) {
  const revelado = evento.status === 'revelado' || evento.status === 'cerrado';
  const [participantes, avisos, entregas, revelacion, pedidos] = await Promise.all([
    db.listarParticipantes(c.env.DB, evento.id),
    db.estadoAvisos(c.env.DB, evento.id),
    db.estadoEntregas(c.env.DB, evento.id),
    // Las parejas solo se leen para mostrarlas una vez revelado el evento.
    revelado ? db.estadoRevelacion(c.env.DB, evento.id) : null,
    db.pedidosDeVinculo(c.env.DB, evento.id),
  ]);
  return c.html(
    <PaginaEvento
      evento={evento}
      participantes={participantes}
      avisos={avisos}
      entregas={entregas}
      revelacion={revelacion}
      pedidos={pedidos}
      config={configuracion(c.env)}
      aviso={aviso}
    />,
    status,
  );
}

function avisoDe(c: Context): Aviso | null {
  const ok = c.req.query('ok');
  if (ok === 'importado') {
    const n = Number(c.req.query('n') ?? 0);
    const a = Number(c.req.query('a') ?? 0);
    return { tipo: 'ok', texto: `Importación lista: ${n} nuevos y ${a} actualizados.` };
  }
  return (ok && AVISOS[ok]) || null;
}

// ---------- Sesión ----------

app.get('/entrar', (c) => c.html(<PaginaLogin />));

app.post('/entrar', async (c) => {
  const f = await c.req.parseBody();
  if (!(await contrasenaCorrecta(String(f.password ?? ''), c.env.ADMIN_PASSWORD))) {
    return c.html(<PaginaLogin error="Esa no es la contraseña. Probá de nuevo." />, 401);
  }
  setCookie(c, COOKIE_SESION, await crearSesion(c.env.SESSION_SECRET), {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: DURACION_SESION_SEG,
  });
  return c.redirect('/');
});

app.post('/salir', (c) => {
  deleteCookie(c, COOKIE_SESION, { path: '/', secure: true });
  return c.redirect('/entrar');
});

// ---------- Bot de Discord ----------
// Va antes del control de sesión: lo llama Discord, y se autentica con la firma.

app.post('/discord/interacciones', async (c) => {
  const clave = c.env.DISCORD_PUBLIC_KEY;
  if (!clave) return c.text('Falta configurar DISCORD_PUBLIC_KEY.', 500);
  const cuerpo = await c.req.text();
  const ok = await firmaValida(
    clave,
    c.req.header('X-Signature-Ed25519'),
    c.req.header('X-Signature-Timestamp'),
    cuerpo,
  );
  if (!ok) return c.text('Firma inválida.', 401);

  const interaccion = JSON.parse(cuerpo) as Interaccion;
  const can = canales(c.env);
  const respuesta = await manejarInteraccion(interaccion, {
    persona: (u) => db.personaDeDiscord(c.env.DB, u),
    contexto: (id) => db.contextoBot(c.env.DB, id),
    enviar: (a, contenido) => avisar(a, contenido, can),
    registrarEntrega: (ev, giver, estado, virtual) => db.registrarEntrega(c.env.DB, ev, giver, estado, virtual),
    descargar: descargarAdjunto,
    participacion: (id) => db.participacionBot(c.env.DB, id),
    guardarDeseos: (id, deseos) => db.guardarDeseos(c.env.DB, id, deseos),
    pedirVinculo: (u, mail) => db.pedirVinculo(c.env.DB, u, mail),
  });

  if (respuesta.type === 5) {
    const { trabajo, ...pensando } = respuesta;
    const { application_id: appId, token } = interaccion;
    if (appId && token) {
      c.executionCtx.waitUntil(
        trabajo()
          .catch(() => ({ data: { content: 'Algo falló del lado del bot. Probá de nuevo.' } }))
          .then((r) => completarRespuesta(appId, token, r.data)),
      );
    }
    return c.json(pensando);
  }
  return c.json(respuesta);
});

/** Baja un adjunto que alguien subió a Discord, para reenviarlo. Solo desde el CDN de Discord. */
async function descargarAdjunto(url: string): Promise<Uint8Array> {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !/(^|\.)discordapp\.(com|net)$/.test(u.hostname)) {
    throw new Error('El adjunto no viene de Discord.');
  }
  const r = await fetch(u);
  if (!r.ok) throw new Error(`No se pudo bajar el adjunto (${r.status}).`);
  const datos = new Uint8Array(await r.arrayBuffer());
  if (datos.byteLength > MAX_ARCHIVO) throw new Error('El archivo es demasiado grande.');
  return datos;
}

// Todo lo demás requiere sesión.
app.use('*', async (c, next) => {
  if (!c.env.ADMIN_PASSWORD || !c.env.SESSION_SECRET) {
    return c.text('Falta configurar ADMIN_PASSWORD y SESSION_SECRET (ver .dev.vars.example).', 500);
  }
  if (!(await sesionValida(getCookie(c, COOKIE_SESION), c.env.SESSION_SECRET))) {
    return c.redirect('/entrar');
  }
  await next();
});

// ---------- Eventos ----------

function datosEvento(f: Form): db.DatosEvento | string {
  const name = texto(f, 'name');
  if (!name) return 'El evento necesita un nombre.';
  const budget_min = entero(f, 'budget_min');
  const budget_max = entero(f, 'budget_max');
  if (budget_min != null && budget_max != null && budget_min > budget_max) {
    return 'El presupuesto mínimo no puede ser mayor que el máximo.';
  }
  const url = texto(f, 'form_csv_url');
  if (url && !urlCsvDeGoogleSheet(url)) return 'El link tiene que ser de una hoja de Google Sheets.';
  return {
    name,
    budget_min,
    budget_max,
    deadline: fecha(f, 'deadline'),
    reveal_date: fecha(f, 'reveal_date'),
    form_csv_url: url,
  };
}

app.get('/', async (c) => {
  const eventos = await db.listarEventos(c.env.DB);
  return c.html(<PaginaEventos eventos={eventos} aviso={avisoDe(c)} />);
});

app.post('/eventos', async (c) => {
  const d = datosEvento(await c.req.parseBody());
  if (typeof d === 'string') {
    const eventos = await db.listarEventos(c.env.DB);
    return c.html(<PaginaEventos eventos={eventos} aviso={{ tipo: 'error', texto: d }} />, 400);
  }
  const nuevo = await db.crearEvento(c.env.DB, d);
  return c.redirect(`/eventos/${nuevo}?ok=creado`);
});

app.get('/eventos/:id', async (c) => {
  const evento = await cargarEvento(c);
  if (!evento) return c.notFound();
  return paginaEvento(c, evento, avisoDe(c));
});

app.post('/eventos/:id', async (c) => {
  const evento = await cargarEvento(c);
  if (!evento) return c.notFound();
  const d = datosEvento(await c.req.parseBody());
  if (typeof d === 'string') return paginaEvento(c, evento, { tipo: 'error', texto: d }, 400);
  await db.actualizarEvento(c.env.DB, evento.id, d);
  return c.redirect(`/eventos/${evento.id}?ok=guardado`);
});

app.post('/eventos/:id/borrar', async (c) => {
  const evento = await cargarEvento(c);
  if (!evento) return c.notFound();
  if (evento.status !== 'borrador') return c.text('Un evento ya sorteado no se puede borrar.', 409);
  await db.borrarEvento(c.env.DB, evento.id);
  return c.redirect('/?ok=borrado');
});

// ---------- Participantes ----------

function datosParticipante(f: Form) {
  const name = texto(f, 'name');
  const discord = texto(f, 'discord_username');
  return {
    error: name ? null : 'Falta el nombre.',
    persona: {
      name: name ?? '',
      email: texto(f, 'email')?.toLowerCase() ?? null,
      discord_username: discord ? limpiarDiscord(discord) : null,
      address: texto(f, 'address'),
    },
    datos: { wishlist: texto(f, 'wishlist'), sizes: texto(f, 'sizes'), notes: texto(f, 'notes') },
  };
}

function mensajeDuplicado(e: unknown): string | null {
  const dup = db.esDuplicado(e);
  if (dup === 'email') return 'Ese mail ya lo tiene otra persona.';
  if (dup === 'discord') return 'Esa cuenta de Discord ya está vinculada a otra persona.';
  return null;
}

app.get('/eventos/:id/participantes/nuevo', async (c) => {
  const evento = await cargarEvento(c);
  if (!evento) return c.notFound();
  return c.html(<PaginaParticipante evento={evento} participante={null} />);
});

app.post('/eventos/:id/participantes', async (c) => {
  const evento = await cargarEvento(c);
  if (!evento) return c.notFound();
  if (evento.status !== 'borrador') return c.text('El evento ya se sorteó.', 409);
  const { error, persona, datos } = datosParticipante(await c.req.parseBody());
  if (error) return c.html(<PaginaParticipante evento={evento} participante={null} error={error} />, 400);
  await db.sumarParticipante(c.env.DB, evento.id, persona, datos);
  return c.redirect(`/eventos/${evento.id}?ok=agregado`);
});

app.get('/eventos/:id/participantes/:pid', async (c) => {
  const evento = await cargarEvento(c);
  const participante = evento && (await cargarParticipante(c, evento.id));
  if (!evento || !participante) return c.notFound();
  const estadoAviso = (await db.estadoAvisos(c.env.DB, evento.id)).get(participante.participant_id);
  return c.html(<PaginaParticipante evento={evento} participante={participante} estadoAviso={estadoAviso} />);
});

app.post('/eventos/:id/participantes/:pid', async (c) => {
  const evento = await cargarEvento(c);
  const participante = evento && (await cargarParticipante(c, evento.id));
  if (!evento || !participante) return c.notFound();
  const { error, persona, datos } = datosParticipante(await c.req.parseBody());
  if (error) {
    return c.html(<PaginaParticipante evento={evento} participante={participante} error={error} />, 400);
  }
  try {
    await db.editarParticipante(c.env.DB, participante, persona, datos);
  } catch (e) {
    const msg = mensajeDuplicado(e);
    if (!msg) throw e;
    return c.html(<PaginaParticipante evento={evento} participante={participante} error={msg} />, 409);
  }
  return c.redirect(`/eventos/${evento.id}?ok=guardado`);
});

app.post('/eventos/:id/participantes/:pid/quitar', async (c) => {
  const evento = await cargarEvento(c);
  const pid = id(c, 'pid');
  if (!evento || !pid) return c.notFound();
  // Después del sorteo, sacar a alguien es una baja con reacomodo (ver /baja).
  if (evento.status !== 'borrador') return c.text('El evento ya se sorteó.', 409);
  await db.quitarParticipante(c.env.DB, evento.id, pid);
  return c.redirect(`/eventos/${evento.id}?ok=quitado`);
});

// ---------- Importar del form ----------

const MAX_CSV_BYTES = 1_000_000;

async function descargarCsv(url: string): Promise<string> {
  const csvUrl = urlCsvDeGoogleSheet(url);
  if (!csvUrl) throw new Error('El link tiene que ser de una hoja de Google Sheets.');
  const r = await fetch(csvUrl, { redirect: 'follow' });
  const tipo = r.headers.get('content-type') ?? '';
  // Si la hoja no está compartida, Google responde con la página de login en HTML.
  if (!r.ok || tipo.includes('text/html')) {
    throw new Error('No se pudo leer la hoja. Revisá que esté compartida como «Cualquier persona con el enlace».');
  }
  const t = await r.text();
  if (t.length > MAX_CSV_BYTES) throw new Error('La hoja es demasiado grande para importarla.');
  return t;
}

app.get('/eventos/:id/importar', async (c) => {
  const evento = await cargarEvento(c);
  if (!evento) return c.notFound();
  return c.html(<PaginaImportar evento={evento} />);
});

app.post('/eventos/:id/importar/vista-previa', async (c) => {
  const evento = await cargarEvento(c);
  if (!evento) return c.notFound();
  const f = await c.req.parseBody();

  let csv: string;
  try {
    const archivo = f.archivo;
    if (archivo instanceof File && archivo.size > 0) {
      if (archivo.size > MAX_CSV_BYTES) throw new Error('El archivo es demasiado grande.');
      csv = await archivo.text();
    } else {
      const url = texto(f, 'url');
      if (!url) throw new Error('Pegá el link de la hoja o subí un archivo CSV.');
      csv = await descargarCsv(url);
      if (url !== evento.form_csv_url) {
        await db.actualizarEvento(c.env.DB, evento.id, { ...evento, form_csv_url: url });
        evento.form_csv_url = url;
      }
    }
  } catch (e) {
    return c.html(<PaginaImportar evento={evento} error={(e as Error).message} />, 400);
  }

  const resultado = interpretarCsv(csv);
  if (!resultado.columnas.some((col) => col.campo === 'name')) {
    return c.html(
      <PaginaImportar
        evento={evento}
        error="No encontré una columna de nombre. La pregunta del form tiene que decir «Nombre»."
      />,
      400,
    );
  }
  const existentes = new Set(
    (await db.listarParticipantes(c.env.DB, evento.id)).flatMap((p) =>
      [p.email, p.discord_username && `d:${p.discord_username}`].filter((x): x is string => !!x),
    ),
  );
  return c.html(<PaginaImportar evento={evento} vistaPrevia={{ ...resultado, csv, existentes }} />);
});

app.post('/eventos/:id/importar', async (c) => {
  const evento = await cargarEvento(c);
  if (!evento) return c.notFound();
  if (evento.status !== 'borrador') return c.text('El evento ya se sorteó.', 409);
  const csv = texto(await c.req.parseBody(), 'csv');
  if (!csv || csv.length > MAX_CSV_BYTES) return c.redirect(`/eventos/${evento.id}/importar`);
  try {
    const { nuevos, actualizados } = await db.importarFilas(c.env.DB, evento.id, interpretarCsv(csv).filas);
    return c.redirect(`/eventos/${evento.id}?ok=importado&n=${nuevos}&a=${actualizados}`);
  } catch (e) {
    const msg = mensajeDuplicado(e);
    if (!msg) throw e;
    return c.html(<PaginaImportar evento={evento} error={`No se pudo importar: ${msg}`} />, 409);
  }
});

// ---------- Vincular Discord ----------

// Cada búsqueda es una llamada a Discord; el plan gratis permite 50 por pedido.
const MAX_BUSQUEDAS = 40;

app.post('/eventos/:id/vincular', async (c) => {
  const evento = await cargarEvento(c);
  if (!evento) return c.notFound();
  const { DISCORD_BOT_TOKEN: token, DISCORD_GUILD_ID: guild } = c.env;
  if (!token || !guild) {
    return paginaEvento(c, evento, { tipo: 'error', texto: 'Falta configurar el bot de Discord.' }, 409);
  }

  const sinVincular = (await db.listarParticipantes(c.env.DB, evento.id))
    .filter((p) => p.status === 'activo' && p.discord_username && !p.discord_user_id)
    .slice(0, MAX_BUSQUEDAS);
  const vinculados: string[] = [];
  const problemas: string[] = [];
  for (const p of sinVincular) {
    try {
      const userId = await buscarMiembro(token, guild, p.discord_username!);
      if (!userId) {
        problemas.push(`${p.name} (no está en el server como @${p.discord_username})`);
        continue;
      }
      await db.vincularDiscord(c.env.DB, p.person_id, userId);
      vinculados.push(p.name);
    } catch (e) {
      const msg = db.esDuplicado(e) ? 'esa cuenta ya es de otra persona' : (e as Error).message;
      problemas.push(`${p.name} (${msg})`);
    }
  }

  const partes = [`Vinculados: ${vinculados.length}.`];
  if (problemas.length) partes.push(`Revisá a ${problemas.join(', ')}.`);
  return paginaEvento(c, evento, { tipo: problemas.length ? 'error' : 'ok', texto: partes.join(' ') });
});

// ---------- Pedidos de /unirme mail:… ----------

app.post('/eventos/:id/vinculos/:persona/confirmar', async (c) => {
  const evento = await cargarEvento(c);
  const personId = id(c, 'persona');
  if (!evento || !personId) return c.notFound();
  let discordId: string | null;
  try {
    discordId = await db.confirmarVinculo(c.env.DB, evento.id, personId);
  } catch (e) {
    const msg = mensajeDuplicado(e);
    if (!msg) throw e;
    return paginaEvento(c, evento, { tipo: 'error', texto: msg }, 409);
  }
  if (!discordId) return paginaEvento(c, evento, { tipo: 'error', texto: 'Ese pedido ya no estaba.' }, 409);

  // Le confirmamos por privado. Si falla, el vínculo igual quedó hecho.
  const token = c.env.DISCORD_BOT_TOKEN;
  if (token) await mandarDM(token, discordId, embedVinculado(evento.name)).catch(() => {});
  return paginaEvento(c, evento, { tipo: 'ok', texto: 'Cuenta vinculada.' });
});

app.post('/eventos/:id/vinculos/:persona/rechazar', async (c) => {
  const evento = await cargarEvento(c);
  const personId = id(c, 'persona');
  if (!evento || !personId) return c.notFound();
  await db.rechazarVinculo(c.env.DB, personId);
  return paginaEvento(c, evento, { tipo: 'ok', texto: 'Pedido rechazado.' });
});

// ---------- Sorteo ----------

app.post('/eventos/:id/sortear', async (c) => {
  const evento = await cargarEvento(c);
  if (!evento) return c.notFound();
  if (evento.status !== 'borrador') return c.redirect(`/eventos/${evento.id}`);

  const activos = (await db.listarParticipantes(c.env.DB, evento.id)).filter((p) => p.status === 'activo');
  const sinContacto = activos.filter((p) => !alcanzable(p, configuracion(c.env)));
  if (activos.length < 3 || sinContacto.length > 0) {
    const texto =
      activos.length < 3
        ? 'Hacen falta al menos 3 participantes.'
        : `Antes de sortear, revisá cómo avisarles a: ${sinContacto.map((p) => p.name).join(', ')}.`;
    return paginaEvento(c, evento, { tipo: 'error', texto }, 409);
  }

  await db.guardarSorteo(c.env.DB, evento.id, sortear(activos.map((p) => p.participant_id)));
  return c.redirect(`/eventos/${evento.id}?ok=sorteado`);
});

// Manda una tanda de avisos. La página lo llama hasta que no quedan pendientes,
// así ningún pedido supera el límite de llamadas externas del plan gratis.
const AVISOS_POR_TANDA = 5;

app.post('/eventos/:id/avisar', async (c) => {
  const evento = await cargarEvento(c);
  if (!evento) return c.notFound();
  if (evento.status === 'borrador') return c.json({ error: 'El evento todavía no se sorteó.' }, 409);

  const tanda = await db.avisosPendientes(c.env.DB, evento, AVISOS_POR_TANDA);
  const can = canales(c.env);
  for (const p of tanda) {
    const r = await avisar(
      { nombre: p.giver_name, discordUserId: p.giver_discord_user_id, email: p.giver_email },
      contenidoSorteo(p.datos),
      can,
    );
    await db.registrarAviso(c.env.DB, evento.id, p.giver_id, r.ok ? r : { error: r.error });
  }

  const estados = [...(await db.estadoAvisos(c.env.DB, evento.id)).values()];
  return c.json({
    enviados: estados.filter((e) => e.notified_at).length,
    fallidos: estados.filter((e) => !e.notified_at && e.notify_error).length,
    pendientes: estados.filter((e) => !e.notified_at && !e.notify_error).length,
  });
});

app.post('/eventos/:id/avisos/reintentar', async (c) => {
  const evento = await cargarEvento(c);
  if (!evento) return c.notFound();
  await db.reintentarAvisos(c.env.DB, evento.id);
  return c.redirect(`/eventos/${evento.id}`);
});

app.post('/eventos/:id/participantes/:pid/probar', async (c) => {
  const evento = await cargarEvento(c);
  const participante = evento && (await cargarParticipante(c, evento.id));
  if (!evento || !participante) return c.notFound();
  const r = await avisar(
    { nombre: participante.name, discordUserId: participante.discord_user_id, email: participante.email },
    { embed: embedPrueba(participante.name), mail: mailPrueba(participante.name) },
    canales(c.env),
  );
  const aviso: Aviso = r.ok
    ? {
        tipo: 'ok',
        texto: `Mensaje de prueba enviado por ${r.canal === 'discord' ? 'Discord' : 'mail'}.${r.nota ? ` (${r.nota})` : ''}`,
      }
    : { tipo: 'error', texto: `No se pudo mandar la prueba. ${r.error}` };
  const estadoAviso = (await db.estadoAvisos(c.env.DB, evento.id)).get(participante.participant_id);
  return c.html(
    <PaginaParticipante evento={evento} participante={participante} estadoAviso={estadoAviso} aviso={aviso} />,
  );
});

// ---------- Bajas ----------

app.post('/eventos/:id/participantes/:pid/baja', async (c) => {
  const evento = await cargarEvento(c);
  const participante = evento && (await cargarParticipante(c, evento.id));
  if (!evento || !participante) return c.notFound();
  if (evento.status !== 'sorteado' || participante.status !== 'activo') {
    return paginaEvento(c, evento, { tipo: 'error', texto: 'Solo se puede dar de baja durante el evento.' }, 409);
  }

  let r: db.ResultadoBaja;
  try {
    r = await db.darDeBaja(c.env.DB, evento.id, participante.participant_id);
  } catch (e) {
    return paginaEvento(c, evento, { tipo: 'error', texto: `No se pudo dar de baja: ${(e as Error).message}` }, 409);
  }

  // Aviso del cambio a quien le regalaba. No se muestra quién es.
  const [p] = await db.avisosPendientes(c.env.DB, evento, 1, r.regalador);
  let avisado = false;
  if (p) {
    const res = await avisar(
      { nombre: p.giver_name, discordUserId: p.giver_discord_user_id, email: p.giver_email },
      { embed: embedCambio(p.datos, participante.name), mail: mailCambio(p.datos, participante.name) },
      canales(c.env),
    );
    await db.registrarAviso(c.env.DB, evento.id, p.giver_id, res.ok ? res : { error: res.error });
    avisado = res.ok;
  }

  const partes = [
    `${participante.name} quedó afuera y se reacomodó el sorteo.`,
    avisado
      ? 'Le avisamos del cambio a quien le regalaba.'
      : 'No pudimos avisarle del cambio a quien le regalaba: reintentá desde el panel.',
  ];
  if (r.regaladorYaHabiaEnviado) {
    partes.push('Ojo: quien le regalaba ya había mandado su regalo, y ahora le toca regalarle a otra persona.');
  }
  if (r.bajaYaHabiaEnviado) {
    partes.push(`${participante.name} ya había mandado su regalo: esa persona va a recibir dos.`);
  }
  const actualizado = (await db.obtenerEvento(c.env.DB, evento.id))!;
  return paginaEvento(c, actualizado, { tipo: avisado ? 'ok' : 'error', texto: partes.join(' ') });
});

// ---------- Revelación ----------

const REVELACIONES_POR_TANDA = 5;

app.post('/eventos/:id/revelar', async (c) => {
  const evento = await cargarEvento(c);
  if (!evento) return c.notFound();
  await db.empezarRevelacion(c.env.DB, evento.id);
  return c.redirect(`/eventos/${evento.id}?ok=revelado`);
});

app.post('/eventos/:id/avisar-revelacion', async (c) => {
  const evento = await cargarEvento(c);
  if (!evento) return c.notFound();
  if (evento.status !== 'revelado') return c.json({ error: 'El evento no está revelado.' }, 409);
  const p = await avisarRevelacion(c.env, evento, REVELACIONES_POR_TANDA);
  return c.json({ enviados: p.avisados, fallidos: p.fallidos, pendientes: p.pendientes, resumen: p.resumen });
});

app.post('/eventos/:id/revelacion/reintentar', async (c) => {
  const evento = await cargarEvento(c);
  if (!evento) return c.notFound();
  await db.reintentarRevelacion(c.env.DB, evento.id);
  return c.redirect(`/eventos/${evento.id}`);
});

app.post('/eventos/:id/cerrar', async (c) => {
  const evento = await cargarEvento(c);
  if (!evento) return c.notFound();
  await db.cerrarEvento(c.env.DB, evento.id);
  return c.redirect(`/eventos/${evento.id}?ok=cerrado`);
});

// ---------- Personas ----------

app.get('/personas', async (c) => {
  return c.html(<PaginaPersonas personas={await db.listarPersonas(c.env.DB)} />);
});

app.notFound((c) => c.text('No existe esa página.', 404));

export default {
  fetch: app.fetch,
  // Cada hora: revela los eventos cuya fecha llegó y sigue mandando los avisos pendientes.
  async scheduled(_evento: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(revelarLoQueToca(env).then((log) => log.forEach((l) => console.log(l))));
  },
} satisfies ExportedHandler<Env>;
