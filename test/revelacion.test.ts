import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hoyEnArgentina } from '../src/revelacion.ts';
import { ordenarRonda } from '../src/sorteo.ts';
import { embedCambio, embedResumenRevelacion, embedRevelacion, mailCambio, type DatosAviso } from '../src/mensajes.ts';

test('el día cambia a las 00 de Argentina (03:00 UTC), no a las 00 UTC', () => {
  assert.equal(hoyEnArgentina(new Date('2026-12-25T02:59:00Z')), '2026-12-24');
  assert.equal(hoyEnArgentina(new Date('2026-12-25T03:00:00Z')), '2026-12-25');
});

test('ordenarRonda sigue la cadena desde el primero', () => {
  const desordenadas = [
    { giver: 3, receiver: 1 },
    { giver: 1, receiver: 2 },
    { giver: 2, receiver: 3 },
  ];
  assert.deepEqual(ordenarRonda(desordenadas), [
    { giver: 3, receiver: 1 },
    { giver: 1, receiver: 2 },
    { giver: 2, receiver: 3 },
  ]);
  assert.deepEqual(ordenarRonda([]), []);
});

const datos: DatosAviso = {
  evento: 'Navidad 2026',
  budgetMin: 50000,
  budgetMax: 70000,
  entrega: null,
  revelacion: null,
  quienRegala: 'Ana',
  aQuien: 'Caro',
  wishlist: 'Libros',
  sizes: null,
  notes: null,
  address: 'Calle 1',
};

test('el aviso de cambio explica quién se fue y a quién le regalás ahora', () => {
  const e = embedCambio(datos, 'Beto');
  assert.equal(e.title, 'Hubo un cambio: ahora le regalás a Caro');
  assert.match(e.description!, /^Beto no va a participar/);
  assert.match(JSON.stringify(e.fields), /Libros/);
  const m = mailCambio(datos, 'Beto');
  assert.ok(!m.subject.includes('Caro'), 'el asunto no dice a quién le regala');
  assert.match(m.text, /Beto no va a participar/);
});

test('la revelación dice quién te regaló y el resumen muestra la ronda en orden', () => {
  assert.equal(embedRevelacion('Navidad 2026', 'Beto', 'Caro').title, 'Tu amigo invisible era Beto');
  const r = embedResumenRevelacion('Navidad 2026', [
    { de: 'Ana', para: 'Beto' },
    { de: 'Beto', para: 'Caro' },
    { de: 'Caro', para: 'Ana' },
  ]);
  assert.match(r.description!, /\*\*Ana\*\* → Beto\n\*\*Beto\*\* → Caro\n\*\*Caro\*\* → Ana/);
});
