// La lista de deseos se guarda como texto, un ítem por línea ("• una webcam").
// Lo que viene del formulario o del panel puede no tener viñeta: cada línea cuenta igual.

import { normalizar } from './importar.ts';

export function itemsDeseos(deseos: string | null): string[] {
  return (deseos ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
}

/** El ítem sin la viñeta, para mostrarlo en una lista. */
export function textoItem(item: string): string {
  return item.replace(/^[•\-*]\s*/, '');
}

/** Discord muestra hasta 25 sugerencias, con hasta 100 caracteres cada una. */
const MAX_SUGERENCIAS = 25;
const MAX_LARGO_SUGERENCIA = 100;

/**
 * Sugerencias para el autocompletado de /deseos quitar: los ítems que contienen lo que
 * se viene escribiendo. El valor es la posición del ítem en la lista.
 */
export function sugerenciasDeseos(deseos: string | null, escrito: string): { name: string; value: string }[] {
  const buscado = normalizar(escrito);
  return itemsDeseos(deseos)
    .map((item, i) => ({ item: textoItem(item), i }))
    .filter(({ item }) => !buscado || normalizar(item).includes(buscado))
    .slice(0, MAX_SUGERENCIAS)
    .map(({ item, i }) => ({
      name: item.length > MAX_LARGO_SUGERENCIA ? `${item.slice(0, MAX_LARGO_SUGERENCIA - 1)}…` : item,
      value: String(i),
    }));
}

/**
 * Encuentra qué ítem quitar. Lo normal es que llegue la posición elegida en el
 * autocompletado; si la persona escribió texto sin elegir, se acepta solo si
 * coincide con un único ítem.
 */
export function buscarItem(deseos: string | null, elegido: string): number | null {
  const items = itemsDeseos(deseos);
  if (/^\d+$/.test(elegido)) {
    const i = Number(elegido);
    return i < items.length ? i : null;
  }
  const buscado = normalizar(elegido);
  if (!buscado) return null;
  const exactos = items.map((it, i) => [normalizar(textoItem(it)), i] as const).filter(([t]) => t === buscado);
  if (exactos.length === 1) return exactos[0][1];
  const parecidos = items.map((it, i) => [normalizar(textoItem(it)), i] as const).filter(([t]) => t.includes(buscado));
  return parecidos.length === 1 ? parecidos[0][1] : null;
}

export function quitarItem(deseos: string | null, indice: number): { nueva: string | null; quitado: string } {
  const items = itemsDeseos(deseos);
  const quitado = textoItem(items[indice]);
  const resto = items.filter((_, i) => i !== indice);
  return { nueva: resto.length ? resto.join('\n') : null, quitado };
}
