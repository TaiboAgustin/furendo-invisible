import { test } from 'node:test';
import assert from 'node:assert/strict';
import { manejarInteraccion, type Contexto, type Deps, type Interaccion, type Respuesta } from '../src/interacciones.ts';
import { firmaValida } from '../src/firma.ts';
import { COMANDOS } from '../src/comandos.ts';

const ctx: Contexto = {
  evento: { name: 'Navidad 2026', budget_min: 50000, budget_max: 70000, deadline: null, reveal_date: '2026-12-24' },
  yo: { name: 'Ana' },
  receptor: {
    nombre: 'Beto',
    discordUserId: '222',
    email: null,
    address: 'Calle Falsa 123',
    wishlist: 'Juegos',
    sizes: null,
    notes: null,
  },
  regalador: { nombre: 'Caro', discordUserId: '333', email: 'caro@ejemplo.com' },
};

function deps(opts: { persona?: boolean; contexto?: Contexto | null | 'sin-sortear' } = {}) {
  const enviados: { a: string; titulo?: string; descripcion?: string; asunto: string }[] = [];
  const d: Deps = {
    persona: async () => (opts.persona === false ? null : { id: 1, name: 'Ana' }),
    contexto: async () => (opts.contexto === undefined ? ctx : opts.contexto),
    enviar: async (a, c) => {
      enviados.push({ a: a.nombre, titulo: c.embed.title, descripcion: c.embed.description, asunto: c.mail.subject });
      return { ok: true, canal: 'discord' };
    },
  };
  return { d, enviados };
}

const comando = (name: string, mensaje?: string, enServer = false): Interaccion => ({
  type: 2,
  data: { name, options: mensaje === undefined ? [] : [{ name: 'mensaje', value: mensaje }] },
  ...(enServer ? { member: { user: { id: '111', username: 'ana' } }, guild_id: '9' } : { user: { id: '111', username: 'ana' } }),
});

function texto(r: Respuesta): string {
  assert.equal(r.type, 4);
  if (r.type !== 4) return '';
  assert.equal(r.data.flags, 64, 'toda respuesta tiene que ser efímera');
  return [r.data.content, ...(r.data.embeds ?? []).flatMap((e) => [e.title, e.description])].filter(Boolean).join(' ');
}

test('responde el ping de Discord', async () => {
  assert.deepEqual(await manejarInteraccion({ type: 1 }, deps().d), { type: 1 });
});

test('/preguntar le llega a quien recibe sin decir quién pregunta', async () => {
  const { d, enviados } = deps();
  const r = await manejarInteraccion(comando('preguntar', '¿Qué talle usás?', true), d);
  assert.match(texto(r), /le llegó a Beto/);
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].a, 'Beto');
  assert.equal(enviados[0].descripcion, '¿Qué talle usás?');
  assert.ok(!JSON.stringify(enviados[0]).includes('Ana'), 'el mensaje no puede nombrar a quien pregunta');
});

test('/responder le llega a quien me regala y el asunto del mail no nombra a nadie', async () => {
  const { d, enviados } = deps();
  const r = await manejarInteraccion(comando('responder', 'Talle M'), d);
  assert.match(texto(r), /le llegó a quien te regala/);
  assert.ok(!texto(r).includes('Caro'), 'nunca se revela quién me regala');
  assert.equal(enviados[0].a, 'Caro');
  assert.equal(enviados[0].titulo, 'Ana te respondió');
  assert.ok(!enviados[0].asunto.includes('Ana') && !enviados[0].asunto.includes('Caro'));
});

test('/mi-amigo y /direccion muestran los datos de a quién le regalo', async () => {
  const { d } = deps();
  assert.match(texto(await manejarInteraccion(comando('mi-amigo'), d)), /Te tocó regalarle a Beto/);
  assert.match(texto(await manejarInteraccion(comando('direccion'), d)), /Calle Falsa 123/);
});

test('si no está en la lista, antes del sorteo o sin evento, lo explica', async () => {
  assert.match(texto(await manejarInteraccion(comando('mi-amigo'), deps({ persona: false }).d)), /No te encontré/);
  assert.match(
    texto(await manejarInteraccion(comando('preguntar', 'hola'), deps({ contexto: 'sin-sortear' }).d)),
    /Todavía no se hizo el sorteo/,
  );
  assert.match(texto(await manejarInteraccion(comando('direccion'), deps({ contexto: null }).d)), /ningún amigo invisible/);
});

test('/preguntar sin texto no manda nada', async () => {
  const { d, enviados } = deps();
  assert.match(texto(await manejarInteraccion(comando('preguntar', '   '), d)), /Escribí la pregunta/);
  assert.equal(enviados.length, 0);
});

test('todos los comandos definidos tienen manejador', async () => {
  for (const c of COMANDOS) {
    const r = texto(await manejarInteraccion(comando(c.name, 'x'), deps().d));
    assert.ok(!r.includes('todavía no existe'), `/${c.name} no está manejado`);
  }
});

test('firmaValida acepta la firma correcta y rechaza cualquier cambio', async () => {
  const par = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const publica = Buffer.from(await crypto.subtle.exportKey('raw', par.publicKey)).toString('hex');
  const cuerpo = '{"type":1}';
  const ts = '1700000000';
  const firma = Buffer.from(
    await crypto.subtle.sign('Ed25519', par.privateKey, new TextEncoder().encode(ts + cuerpo)),
  ).toString('hex');

  assert.equal(await firmaValida(publica, firma, ts, cuerpo), true);
  assert.equal(await firmaValida(publica, firma, ts, '{"type":2}'), false);
  assert.equal(await firmaValida(publica, firma, '1700000001', cuerpo), false);
  assert.equal(await firmaValida(publica, null, ts, cuerpo), false);
  assert.equal(await firmaValida(publica, 'zz', ts, cuerpo), false);
});
