import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actualizarTalles } from '../src/talles.ts';

test('carga talles desde cero en el orden de las prendas', () => {
  assert.equal(
    actualizarTalles(null, { zapatillas: '42', remera: 'M' }),
    'Remera: M\nZapatillas: 42',
  );
});

test('actualiza solo lo que cambia y conserva el resto', () => {
  const antes = 'Remera: M\nZapatillas: 42';
  assert.equal(actualizarTalles(antes, { remera: 'L' }), 'Remera: L\nZapatillas: 42');
  assert.equal(actualizarTalles(antes, { buzo: 'XL' }), 'Remera: M\nBuzo / campera: XL\nZapatillas: 42');
});

test('respeta lo cargado a mano en el panel que no sigue el formato', () => {
  assert.equal(
    actualizarTalles('Remera M, zapatillas 42', { pantalon: '40' }),
    'Pantalón: 40\nRemera M, zapatillas 42',
  );
});

test('reconoce las etiquetas sin importar mayúsculas y limpia espacios', () => {
  assert.equal(actualizarTalles('remera:   s', { otro: '  Gorra:  58 ' }), 'Remera: s\nOtro: Gorra: 58');
});

test('sin talles devuelve null y los valores vacíos no pisan nada', () => {
  assert.equal(actualizarTalles(null, {}), null);
  assert.equal(actualizarTalles('Remera: M', { remera: '   ' }), 'Remera: M');
});
