import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Env } from './tipos.ts';
import * as db from './db.ts';
import { interpretarCsv, limpiarDiscord, urlCsvDeGoogleSheet } from './importar.ts';
import { COOKIE_SESION, DURACION_SESION_SEG, contrasenaCorrecta, crearSesion, sesionValida } from './sesion.ts';
import type { Aviso } from './vistas/layout.tsx';
import {
  PaginaEvento,
  PaginaEventos,
  PaginaImportar,
  PaginaLogin,
  PaginaParticipante,
  PaginaPersonas,
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
};

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
  const participantes = await db.listarParticipantes(c.env.DB, evento.id);
  return c.html(<PaginaEvento evento={evento} participantes={participantes} aviso={avisoDe(c)} />);
});

app.post('/eventos/:id', async (c) => {
  const evento = await cargarEvento(c);
  if (!evento) return c.notFound();
  const d = datosEvento(await c.req.parseBody());
  if (typeof d === 'string') {
    const participantes = await db.listarParticipantes(c.env.DB, evento.id);
    return c.html(
      <PaginaEvento evento={evento} participantes={participantes} aviso={{ tipo: 'error', texto: d }} />,
      400,
    );
  }
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
  return c.html(<PaginaParticipante evento={evento} participante={participante} />);
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
  // Después del sorteo, sacar a alguien es una baja con reacomodo (etapa 5).
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

// ---------- Personas ----------

app.get('/personas', async (c) => {
  return c.html(<PaginaPersonas personas={await db.listarPersonas(c.env.DB)} />);
});

app.notFound((c) => c.text('No existe esa página.', 404));

export default app;
