import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearSesion, sesionValida, contrasenaCorrecta, DURACION_SESION_SEG } from '../src/sesion.ts';

test('una sesión recién creada es válida', async () => {
  const s = await crearSesion('secreto', 1000);
  assert.equal(await sesionValida(s, 'secreto', 1001), true);
});

test('una sesión vencida, adulterada o con otro secreto no es válida', async () => {
  const s = await crearSesion('secreto', 1000);
  assert.equal(await sesionValida(s, 'secreto', 1000 + DURACION_SESION_SEG + 1), false);
  assert.equal(await sesionValida(s, 'otro', 1001), false);
  const [vence, firma] = s.split('.');
  assert.equal(await sesionValida(`${Number(vence) + 999}.${firma}`, 'secreto', 1001), false);
  assert.equal(await sesionValida('basura', 'secreto', 1001), false);
  assert.equal(await sesionValida(undefined, 'secreto', 1001), false);
});

test('contrasenaCorrecta compara bien y rechaza contraseña vacía configurada', async () => {
  assert.equal(await contrasenaCorrecta('furendos', 'furendos'), true);
  assert.equal(await contrasenaCorrecta('furendo', 'furendos'), false);
  assert.equal(await contrasenaCorrecta('', ''), false);
});
