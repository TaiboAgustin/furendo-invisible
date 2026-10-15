import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../src/csv.ts';
import { interpretarCsv, mapearColumnas, urlCsvDeGoogleSheet, limpiarDiscord } from '../src/importar.ts';

test('parseCsv respeta comillas, comillas escapadas y saltos de línea en celdas', () => {
  const csv = 'a,b,c\r\n"hola, che","dijo ""sí""","línea 1\nlínea 2"\r\n\r\n';
  assert.deepEqual(parseCsv(csv), [
    ['a', 'b', 'c'],
    ['hola, che', 'dijo "sí"', 'línea 1\nlínea 2'],
  ]);
});

test('parseCsv detecta punto y coma como separador', () => {
  assert.deepEqual(parseCsv('nombre;mail\nAna;ana@x.com'), [
    ['nombre', 'mail'],
    ['Ana', 'ana@x.com'],
  ]);
});

test('mapearColumnas reconoce las preguntas típicas de un Google Form', () => {
  const campos = mapearColumnas([
    'Marca temporal',
    'Nombre y apellido',
    'Dirección de correo electrónico',
    'Usuario de Discord',
    'Dirección (calle y número)',
    'Ciudad',
    'Provincia',
    'Código postal',
    '¿Qué te gustaría que te regalen?',
    'Talles (remera, buzo, zapatillas)',
    'Observaciones',
  ]);
  assert.deepEqual(campos, [
    null,
    'name',
    'email',
    'discord_username',
    'address',
    'city',
    'province',
    'postal_code',
    'wishlist',
    'sizes',
    'notes',
  ]);
});

test('interpretarCsv arma la dirección, limpia Discord y se queda con la última respuesta', () => {
  const csv = [
    'Marca temporal,Nombre,Email,Discord,Calle,Ciudad,Provincia,CP,Lista de deseos',
    '1/11/2026,Mica,MICA@x.com,@Mica.RL,Av. Siempreviva 742,Lanús,Buenos Aires,1824,Algo de Rocket League',
    '1/11/2026,,sin@nombre.com,,,,,,',
    '2/11/2026,Mica,mica@x.com,mica.rl,Av. Siempreviva 742,Lanús,Buenos Aires,1824,Buzo talle M',
  ].join('\n');
  const r = interpretarCsv(csv);
  assert.equal(r.descartadas, 1);
  assert.equal(r.filas.length, 1);
  assert.deepEqual(r.filas[0], {
    name: 'Mica',
    email: 'mica@x.com',
    discord_username: 'mica.rl',
    address: 'Av. Siempreviva 742, Lanús, Buenos Aires, CP 1824',
    wishlist: 'Buzo talle M',
    sizes: null,
    notes: null,
  });
});

test('limpiarDiscord saca la @ y el discriminador viejo', () => {
  assert.equal(limpiarDiscord('@Agus.TRN'), 'agus.trn');
  assert.equal(limpiarDiscord('agus#1234'), 'agus');
});

test('urlCsvDeGoogleSheet convierte links de edición y publicados', () => {
  assert.equal(
    urlCsvDeGoogleSheet('https://docs.google.com/spreadsheets/d/abc_123/edit?usp=sharing#gid=99'),
    'https://docs.google.com/spreadsheets/d/abc_123/export?format=csv&gid=99',
  );
  assert.equal(
    urlCsvDeGoogleSheet('https://docs.google.com/spreadsheets/d/e/2PACX-xyz/pubhtml'),
    'https://docs.google.com/spreadsheets/d/e/2PACX-xyz/pub?output=csv',
  );
  assert.equal(urlCsvDeGoogleSheet('https://evil.example.com/spreadsheets/d/abc'), null);
  assert.equal(urlCsvDeGoogleSheet('no es un link'), null);
});
