import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buscarItem, itemsDeseos, quitarItem, sugerenciasDeseos } from '../src/deseos.ts';

const lista = [
  '• el alpine de colapinto con sponsor de ML',
  '• una webcam',
  '• una funda para la switch',
  '• un Dock de carga para los joysticks de ps5',
].join('\n');

test('las sugerencias muestran los ítems sin viñeta, con su posición como valor', () => {
  assert.deepEqual(sugerenciasDeseos(lista, ''), [
    { name: 'el alpine de colapinto con sponsor de ML', value: '0' },
    { name: 'una webcam', value: '1' },
    { name: 'una funda para la switch', value: '2' },
    { name: 'un Dock de carga para los joysticks de ps5', value: '3' },
  ]);
});

test('las sugerencias se filtran por lo escrito, sin importar mayúsculas ni tildes', () => {
  assert.deepEqual(sugerenciasDeseos(lista, 'SWÍTCH'), [{ name: 'una funda para la switch', value: '2' }]);
  assert.deepEqual(sugerenciasDeseos(lista, 'nada que ver'), []);
  assert.deepEqual(sugerenciasDeseos(null, ''), []);
});

test('las sugerencias respetan los límites de Discord', () => {
  const larga = Array.from({ length: 30 }, (_, i) => `• ítem ${i} ${'x'.repeat(150)}`).join('\n');
  const s = sugerenciasDeseos(larga, '');
  assert.equal(s.length, 25);
  assert.ok(s.every((x) => x.name.length <= 100));
});

test('buscarItem acepta la posición elegida o un texto que coincida con un solo ítem', () => {
  assert.equal(buscarItem(lista, '1'), 1);
  assert.equal(buscarItem(lista, '9'), null);
  assert.equal(buscarItem(lista, 'una webcam'), 1);
  assert.equal(buscarItem(lista, 'switch'), 2);
  assert.equal(buscarItem(lista, 'una'), null, 'ambiguo: coincide con dos');
});

test('quitarItem saca solo ese ítem, y la lista vacía queda en null', () => {
  assert.deepEqual(quitarItem(lista, 1), {
    nueva: [
      '• el alpine de colapinto con sponsor de ML',
      '• una funda para la switch',
      '• un Dock de carga para los joysticks de ps5',
    ].join('\n'),
    quitado: 'una webcam',
  });
  assert.deepEqual(quitarItem('• única cosa', 0), { nueva: null, quitado: 'única cosa' });
});

test('las líneas sin viñeta (del form o del panel) cuentan como ítems', () => {
  assert.deepEqual(itemsDeseos('Le gustan los juegos indie\n\n• Hollow Knight'), [
    'Le gustan los juegos indie',
    '• Hollow Knight',
  ]);
});
