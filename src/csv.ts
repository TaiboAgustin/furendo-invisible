/**
 * Parser de CSV (RFC 4180) suficiente para lo que exporta Google Sheets:
 * comillas dobles, comillas escapadas ("") y saltos de línea dentro de una celda.
 * Detecta solo si el separador es coma o punto y coma (Excel en español usa ;).
 */
export function parseCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, '');
  const sep = detectarSeparador(t);
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = '';
  let entreComillas = false;

  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (entreComillas) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          celda += '"';
          i++;
        } else {
          entreComillas = false;
        }
      } else {
        celda += c;
      }
    } else if (c === '"') {
      entreComillas = true;
    } else if (c === sep) {
      fila.push(celda);
      celda = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = '';
    } else {
      celda += c;
    }
  }
  if (celda !== '' || fila.length > 0) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas.filter((f) => f.some((c) => c.trim() !== ''));
}

function detectarSeparador(t: string): ',' | ';' {
  const primera = t.split(/\r?\n/, 1)[0] ?? '';
  const comas = primera.split(',').length;
  const puntoYComa = primera.split(';').length;
  return puntoYComa > comas ? ';' : ',';
}
