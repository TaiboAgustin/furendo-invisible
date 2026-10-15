// Discord firma cada interacción con Ed25519. Si la firma no es válida hay que
// responder 401: Discord lo comprueba al configurar el endpoint y cada tanto después.

function deHex(hex: string): Uint8Array | null {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function firmaValida(
  clavePublicaHex: string,
  firmaHex: string | null | undefined,
  timestamp: string | null | undefined,
  cuerpo: string,
): Promise<boolean> {
  const clave = deHex(clavePublicaHex);
  const firma = firmaHex ? deHex(firmaHex) : null;
  if (!clave || clave.length !== 32 || !firma || firma.length !== 64 || !timestamp) return false;
  try {
    const k = await crypto.subtle.importKey('raw', clave, { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', k, firma, new TextEncoder().encode(timestamp + cuerpo));
  } catch {
    return false;
  }
}
