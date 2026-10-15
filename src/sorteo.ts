// El sorteo arma una sola ronda: A → B → C → … → A.
// Así nadie se toca a sí mismo, no quedan parejas cerradas (A↔B) y, si alguien
// se da de baja, alcanza con que quien le regalaba pase a regalarle a quien
// esa persona tenía asignado.

export type Asignacion = { giver: number; receiver: number };

/** Entero uniforme en [0, max) con números aleatorios criptográficos. */
export function enteroAleatorio(max: number, aleatorio: (buf: Uint32Array) => Uint32Array): number {
  if (max <= 0 || max > 2 ** 32) throw new RangeError('max fuera de rango');
  // Se descartan los valores del último tramo incompleto para no sesgar el resultado.
  const limite = Math.floor(2 ** 32 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    aleatorio(buf);
    if (buf[0] < limite) return buf[0] % max;
  }
}

const cripto = (buf: Uint32Array) => crypto.getRandomValues(buf);

/** Ordena las asignaciones siguiendo la ronda: A → B, B → C, … */
export function ordenarRonda(asignaciones: Asignacion[]): Asignacion[] {
  if (asignaciones.length === 0) return [];
  const siguiente = new Map(asignaciones.map((a) => [a.giver, a.receiver]));
  const ronda: Asignacion[] = [];
  let actual = asignaciones[0].giver;
  for (let i = 0; i < asignaciones.length; i++) {
    const receiver = siguiente.get(actual);
    if (receiver === undefined) break;
    ronda.push({ giver: actual, receiver });
    actual = receiver;
  }
  return ronda;
}

/**
 * Si `baja` deja el evento: quien le regalaba pasa a regalarle a quien `baja`
 * tenía asignado. Es el único cambio y la ronda sigue siendo una sola.
 */
export function reacomodar(
  asignaciones: Asignacion[],
  baja: number,
): { regalador: number; nuevoReceptor: number; resto: Asignacion[] } {
  const haciaBaja = asignaciones.find((a) => a.receiver === baja);
  const desdeBaja = asignaciones.find((a) => a.giver === baja);
  if (!haciaBaja || !desdeBaja) throw new Error('Esa persona no está en el sorteo.');
  if (asignaciones.length - 1 < 3) throw new Error('Quedarían menos de 3 participantes.');
  const resto = asignaciones
    .filter((a) => a.giver !== baja)
    .map((a) => (a.giver === haciaBaja.giver ? { giver: a.giver, receiver: desdeBaja.receiver } : a));
  return { regalador: haciaBaja.giver, nuevoReceptor: desdeBaja.receiver, resto };
}

export function sortear(ids: number[], aleatorio = cripto): Asignacion[] {
  if (new Set(ids).size !== ids.length) throw new Error('Hay participantes repetidos.');
  if (ids.length < 3) throw new Error('Hacen falta al menos 3 participantes.');

  // Fisher-Yates: orden al azar uniforme. Cada uno le regala al siguiente.
  const orden = [...ids];
  for (let i = orden.length - 1; i > 0; i--) {
    const j = enteroAleatorio(i + 1, aleatorio);
    [orden[i], orden[j]] = [orden[j], orden[i]];
  }
  return orden.map((giver, i) => ({ giver, receiver: orden[(i + 1) % orden.length] }));
}
