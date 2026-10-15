// Sesión del organizador: una cookie con la fecha de vencimiento firmada con HMAC.
// No hace falta guardar nada en la base.

export const COOKIE_SESION = 'fi_sesion';
export const DURACION_SESION_SEG = 60 * 60 * 24 * 30; // 30 días

const encoder = new TextEncoder();

async function clave(secreto: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function aHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function deHex(hex: string): Uint8Array | null {
  if (!/^(?:[0-9a-f]{2})+$/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function crearSesion(secreto: string, ahoraSeg = Math.floor(Date.now() / 1000)): Promise<string> {
  const vence = String(ahoraSeg + DURACION_SESION_SEG);
  const firma = await crypto.subtle.sign('HMAC', await clave(secreto), encoder.encode(vence));
  return `${vence}.${aHex(firma)}`;
}

export async function sesionValida(
  valor: string | undefined,
  secreto: string,
  ahoraSeg = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!valor) return false;
  const [vence, firmaHex] = valor.split('.');
  const firma = firmaHex ? deHex(firmaHex) : null;
  if (!vence || !/^\d+$/.test(vence) || !firma) return false;
  if (Number(vence) < ahoraSeg) return false;
  return crypto.subtle.verify('HMAC', await clave(secreto), firma, encoder.encode(vence));
}

/** Compara la contraseña sin filtrar por tiempo cuántos caracteres coinciden. */
export async function contrasenaCorrecta(ingresada: string, esperada: string): Promise<boolean> {
  if (!esperada) return false;
  const k = await clave('comparacion');
  const [a, b] = await Promise.all([
    crypto.subtle.sign('HMAC', k, encoder.encode(ingresada)),
    crypto.subtle.sign('HMAC', k, encoder.encode(esperada)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let dif = 0;
  for (let i = 0; i < x.length; i++) dif |= x[i] ^ y[i];
  return dif === 0;
}
