// Los talles se guardan como texto ("Remera: M\nZapatillas: 42") para que se lean
// igual en el panel, en /mi-amigo y en el aviso del sorteo. /talles actualiza solo
// las prendas que le pasan y respeta lo que se haya cargado a mano en el panel.

import { PRENDAS, type Prenda } from './comandos.ts';

const PRENDA_POR_ETIQUETA = new Map(Object.entries(PRENDAS).map(([k, v]) => [v.toLowerCase(), k as Prenda]));

export function actualizarTalles(actual: string | null, cambios: Partial<Record<Prenda, string>>): string | null {
  const porPrenda = new Map<Prenda, string>();
  const libres: string[] = [];

  for (const linea of (actual ?? '').split('\n').map((l) => l.trim()).filter(Boolean)) {
    const m = linea.match(/^([^:]+):\s*(.+)$/);
    const prenda = m && PRENDA_POR_ETIQUETA.get(m[1].trim().toLowerCase());
    if (prenda) porPrenda.set(prenda, m[2].trim());
    else libres.push(linea);
  }

  for (const [prenda, valor] of Object.entries(cambios) as [Prenda, string][]) {
    const limpio = valor.replace(/\s+/g, ' ').trim();
    if (limpio) porPrenda.set(prenda, limpio);
  }

  const lineas = [
    ...(Object.keys(PRENDAS) as Prenda[])
      .filter((p) => porPrenda.has(p))
      .map((p) => `${PRENDAS[p]}: ${porPrenda.get(p)}`),
    ...libres,
  ];
  return lineas.length ? lineas.join('\n') : null;
}
