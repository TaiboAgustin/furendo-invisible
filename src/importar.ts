// Importación de respuestas del Google Form (vía su Google Sheet).
// Las columnas se reconocen por el texto de la pregunta, así el form se puede
// armar con las preguntas en cualquier orden y con otras palabras parecidas.

import { parseCsv } from './csv.ts';

export type Campo =
  | 'name'
  | 'email'
  | 'discord_username'
  | 'address'
  | 'city'
  | 'province'
  | 'postal_code'
  | 'wishlist'
  | 'sizes'
  | 'notes';

export const NOMBRES_CAMPO: Record<Campo, string> = {
  name: 'Nombre',
  email: 'Mail',
  discord_username: 'Discord',
  address: 'Dirección',
  city: 'Ciudad',
  province: 'Provincia',
  postal_code: 'Código postal',
  wishlist: 'Lista de deseos',
  sizes: 'Talles',
  notes: 'Observaciones',
};

// El orden importa: gana la primera regla que coincide.
const REGLAS: [Campo, RegExp][] = [
  ['email', /\b(e-?mail|mail|correo)\b/],
  ['discord_username', /\bdiscord\b/],
  ['postal_code', /\b(cp|codigo postal|cod postal|postal)\b/],
  ['province', /\bprovincia\b/],
  ['city', /\b(ciudad|localidad|partido|barrio)\b/],
  ['address', /\b(direccion|domicilio|calle)\b/],
  ['sizes', /\btalles?\b/],
  ['wishlist', /\b(deseos?|gustos?|lista|regalo|te gustaria|quisieras|wishlist)\b/],
  ['notes', /\b(observaciones?|comentarios?|notas?|aclaraciones?)\b/],
  ['name', /\b(nombre|apellido|name)\b/],
];

export function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Para cada columna del CSV devuelve el campo que representa, o null si se ignora. */
export function mapearColumnas(encabezados: string[]): (Campo | null)[] {
  const usados = new Set<Campo>();
  return encabezados.map((h) => {
    const n = normalizar(h);
    if (!n || /\b(marca temporal|timestamp)\b/.test(n)) return null;
    for (const [campo, re] of REGLAS) {
      if (re.test(n) && !usados.has(campo)) {
        usados.add(campo);
        return campo;
      }
    }
    return null;
  });
}

export type FilaImportada = {
  name: string;
  email: string | null;
  discord_username: string | null;
  address: string | null;
  wishlist: string | null;
  sizes: string | null;
  notes: string | null;
};

export type ResultadoImportacion = {
  columnas: { encabezado: string; campo: Campo | null }[];
  filas: FilaImportada[];
  descartadas: number; // filas sin nombre
};

export function interpretarCsv(texto: string): ResultadoImportacion {
  const [encabezados = [], ...datos] = parseCsv(texto);
  const campos = mapearColumnas(encabezados);
  const filas: FilaImportada[] = [];
  let descartadas = 0;

  for (const fila of datos) {
    const v: Partial<Record<Campo, string>> = {};
    campos.forEach((campo, i) => {
      const valor = (fila[i] ?? '').trim();
      if (campo && valor) v[campo] = valor;
    });
    if (!v.name) {
      descartadas++;
      continue;
    }
    const direccion = [v.address, v.city, v.province, v.postal_code && `CP ${v.postal_code}`]
      .filter(Boolean)
      .join(', ');
    filas.push({
      name: v.name,
      email: v.email?.toLowerCase() ?? null,
      discord_username: v.discord_username ? limpiarDiscord(v.discord_username) : null,
      address: direccion || null,
      wishlist: v.wishlist ?? null,
      sizes: v.sizes ?? null,
      notes: v.notes ?? null,
    });
  }

  return {
    columnas: encabezados.map((encabezado, i) => ({ encabezado, campo: campos[i] })),
    filas: deduplicar(filas),
    descartadas,
  };
}

/** Saca la @ y el #1234 viejo, que Discord ya no usa. */
export function limpiarDiscord(u: string): string {
  return u.trim().replace(/^@/, '').replace(/#\d{4}$/, '').toLowerCase();
}

/** Si alguien respondió el form dos veces, queda su última respuesta. */
function deduplicar(filas: FilaImportada[]): FilaImportada[] {
  const porClave = new Map<string, FilaImportada>();
  for (const f of filas) {
    const clave = f.email ?? (f.discord_username && `d:${f.discord_username}`) ?? `n:${normalizar(f.name)}`;
    porClave.set(clave, f);
  }
  return [...porClave.values()];
}

/**
 * Convierte el link de un Google Sheet (el de edición o uno publicado) en el link
 * que descarga el CSV. Devuelve null si no es un link de Google Sheets.
 */
export function urlCsvDeGoogleSheet(link: string): string | null {
  let u: URL;
  try {
    u = new URL(link.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.hostname !== 'docs.google.com') return null;

  // Publicado en la web: .../spreadsheets/d/e/<id>/pub?output=csv
  const pub = u.pathname.match(/^\/spreadsheets\/d\/e\/([\w-]+)\/pub(?:html)?$/);
  if (pub) {
    const gid = u.searchParams.get('gid');
    return `https://docs.google.com/spreadsheets/d/e/${pub[1]}/pub?output=csv${gid ? `&gid=${gid}` : ''}`;
  }

  // Link de edición o compartido: .../spreadsheets/d/<id>/edit#gid=123
  const edit = u.pathname.match(/^\/spreadsheets\/d\/([\w-]+)/);
  if (edit) {
    const gid = u.searchParams.get('gid') ?? u.hash.match(/gid=(\d+)/)?.[1];
    return `https://docs.google.com/spreadsheets/d/${edit[1]}/export?format=csv${gid ? `&gid=${gid}` : ''}`;
  }
  return null;
}
