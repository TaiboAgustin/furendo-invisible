import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  manejarInteraccion,
  type Contexto,
  type Deps,
  type Interaccion,
  type Participacion,
  type Respuesta,
  type ResultadoPedido,
} from '../src/interacciones.ts';
import { firmaValida } from '../src/firma.ts';
import { COMANDOS } from '../src/comandos.ts';

const ctx: Contexto = {
  evento: { id: 7, name: 'Navidad 2026', budget_min: 50000, budget_max: 70000, deadline: null, reveal_date: '2026-12-24' },
  yo: { name: 'Ana', participacion: 1 },
  receptor: {
    nombre: 'Beto',
    discordUserId: '222',
    email: null,
    address: 'Calle Falsa 123',
    wishlist: 'Juegos',
    sizes: null,
    notes: null,
  },
  regalador: { nombre: 'Caro', discordUserId: '333', email: 'caro@ejemplo.com', participacion: 3 },
};

type Enviado = {
  a: string;
  titulo?: string;
  descripcion?: string;
  campos: string;
  asunto: string;
  archivo?: string;
};

function deps(
  opts: {
    persona?: boolean;
    contexto?: Contexto | null | 'sin-sortear';
    falla?: boolean;
    participacion?: Participacion | null;
    pedido?: ResultadoPedido;
  } = {},
) {
  const pedidos: string[] = [];
  const enviados: Enviado[] = [];
  const entregas: string[] = [];
  const deseosGuardados: (string | null)[] = [];
  const tallesGuardados: (string | null)[] = [];
  const d: Deps = {
    persona: async () => (opts.persona === false ? null : { id: 1, name: 'Ana' }),
    contexto: async () => (opts.contexto === undefined ? ctx : opts.contexto),
    enviar: async (a, c) => {
      enviados.push({
        a: a.nombre,
        titulo: c.embed.title,
        descripcion: c.embed.description,
        campos: JSON.stringify(c.embed.fields ?? []),
        asunto: c.mail.subject,
        archivo: c.archivo?.nombre,
      });
      return opts.falla ? { ok: false, error: 'DMs cerrados.' } : { ok: true, canal: 'discord' };
    },
    registrarEntrega: async (ev, giver, estado, virtual) => {
      entregas.push(`${ev}:${giver}:${estado}:${virtual}`);
    },
    descargar: async () => new Uint8Array([1, 2, 3]),
    participacion: async () =>
      opts.participacion === undefined
        ? { id: 1, evento: 'Navidad 2026', sorteado: false, deseos: null, talles: null, regalador: null }
        : opts.participacion,
    guardarDeseos: async (_id, deseos) => {
      deseosGuardados.push(deseos);
    },
    guardarTalles: async (_id, talles) => {
      tallesGuardados.push(talles);
    },
    pedirVinculo: async (_u, mail) => {
      pedidos.push(mail);
      return opts.pedido ?? 'pedido';
    },
  };
  return { d, enviados, entregas, deseosGuardados, tallesGuardados, pedidos };
}

const deseos = (sub: string, texto?: string): Interaccion => ({
  type: 2,
  data: {
    name: 'deseos',
    options: [{ type: 1, name: sub, options: texto === undefined ? [] : [{ name: 'texto', value: texto }] }],
  },
  user: { id: '111', username: 'ana' },
});

const comando = (
  name: string,
  mensaje?: string,
  enServer = false,
  extra: { name: string; value: unknown }[] = [],
): Interaccion => ({
  type: 2,
  data: { name, options: [...(mensaje === undefined ? [] : [{ name: 'mensaje', value: mensaje }]), ...extra] },
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

test('/entregar una key de Steam: la tapa, arma el link para activarla y anota la entrega', async () => {
  const { d, enviados, entregas } = deps();
  const r = await manejarInteraccion(
    comando('entregar', 'Feliz navidad', false, [
      { name: 'tipo', value: 'steam' },
      { name: 'contenido', value: 'AAAAA-BBBBB-CCCCC' },
    ]),
    d,
  );
  assert.match(texto(r), /Beto ya tiene tu regalo/);
  assert.equal(enviados[0].a, 'Beto');
  assert.match(enviados[0].campos, /\|\|`AAAAA-BBBBB-CCCCC`\|\|/, 'la key va como spoiler');
  assert.match(enviados[0].campos, /registerkey\?key=AAAAA-BBBBB-CCCCC/);
  assert.ok(!JSON.stringify(enviados[0]).includes('Ana'), 'no revela quién regala');
  assert.deepEqual(entregas, ['7:1:entregado:true']);
});

test('/entregar con archivo contesta "pensando" y después reenvía el archivo', async () => {
  const { d, enviados, entregas } = deps();
  const i = comando('entregar', undefined, false, [
    { name: 'tipo', value: 'otro' },
    { name: 'contenido', value: 'Una entrada para el recital' },
    { name: 'archivo', value: 'adj1' },
  ]);
  i.data!.resolved = { attachments: { adj1: { url: 'https://cdn.discordapp.com/x.pdf', filename: 'entrada.pdf', size: 3 } } };
  const r = await manejarInteraccion(i, d);
  assert.equal(r.type, 5);
  assert.equal(enviados.length, 0, 'todavía no mandó nada');
  if (r.type !== 5) return;
  assert.equal(r.data.flags, 64);
  const final = await r.trabajo();
  assert.match(texto(final), /Beto ya tiene tu regalo/);
  assert.equal(enviados[0].archivo, 'entrada.pdf');
  assert.deepEqual(entregas, ['7:1:entregado:true']);
});

test('/entregar rechaza archivos de más de 10 MB y no anota nada si falla el envío', async () => {
  const grande = deps();
  const i = comando('entregar', undefined, false, [
    { name: 'tipo', value: 'otro' },
    { name: 'contenido', value: 'x' },
    { name: 'archivo', value: 'a' },
  ]);
  i.data!.resolved = { attachments: { a: { url: 'https://cdn.discordapp.com/a', filename: 'a', size: 11 * 1024 * 1024 } } };
  assert.match(texto(await manejarInteraccion(i, grande.d)), /más de 10 MB/);

  const falla = deps({ falla: true });
  const r = await manejarInteraccion(
    comando('entregar', undefined, false, [
      { name: 'tipo', value: 'codigo' },
      { name: 'contenido', value: 'XYZ' },
    ]),
    falla.d,
  );
  assert.match(texto(r), /No se pudo entregar/);
  assert.deepEqual(falla.entregas, []);
});

test('/enviado avisa a quien recibe y /recibido avisa a quien regala, cada uno anotado al regalador correcto', async () => {
  const env = deps();
  const r1 = await manejarInteraccion(comando('enviado', 'Va por Andreani', false, [{ name: 'seguimiento', value: 'AR123' }]), env.d);
  assert.match(texto(r1), /Le avisé a Beto/);
  assert.equal(env.enviados[0].a, 'Beto');
  assert.equal(env.enviados[0].titulo, 'Tu regalo está en camino');
  assert.match(env.enviados[0].campos, /AR123/);
  assert.deepEqual(env.entregas, ['7:1:en_camino:false']);

  const rec = deps();
  const r2 = await manejarInteraccion(comando('recibido', '¡Me encantó!'), rec.d);
  assert.match(texto(r2), /Le avisé a quien te regaló/);
  assert.ok(!texto(r2).includes('Caro'), 'no revela quién le regaló');
  assert.equal(rec.enviados[0].a, 'Caro');
  assert.equal(rec.enviados[0].titulo, 'Ana recibió tu regalo');
  assert.deepEqual(rec.entregas, ['7:3:recibido:false']);
});

test('/mi-amigo dice quién te regaló solo después de la revelación', async () => {
  const antes = texto(await manejarInteraccion(comando('mi-amigo'), deps().d));
  assert.ok(!antes.includes('Caro'));
  const revelado = { ...ctx, evento: { ...ctx.evento, status: 'revelado' } };
  const r = await manejarInteraccion(comando('mi-amigo'), deps({ contexto: revelado }).d);
  assert.equal(r.type, 4);
  if (r.type === 4) assert.match(JSON.stringify(r.data.embeds), /Quién te regaló a vos.*Caro/);
});

test('/deseos agregar suma a la lista antes del sorteo sin avisarle a nadie', async () => {
  const { d, enviados, deseosGuardados } = deps({
    participacion: { id: 1, evento: 'Navidad 2026', sorteado: false, deseos: '• Libros', regalador: null },
  });
  const r = await manejarInteraccion(deseos('agregar', 'Un buzo\nnegro'), d);
  assert.deepEqual(deseosGuardados, ['• Libros\n• Un buzo negro']);
  assert.match(texto(r), /Un buzo negro/);
  assert.equal(enviados.length, 0);
});

test('/deseos después del sorteo le avisa a quien regala, sin decirle a quien la cambió quién es', async () => {
  const { d, enviados } = deps({
    participacion: {
      id: 1,
      evento: 'Navidad 2026',
      sorteado: true,
      deseos: null,
      regalador: { nombre: 'Caro', discordUserId: '333', email: null },
    },
  });
  const r = await manejarInteraccion(deseos('agregar', 'Hollow Knight'), d);
  assert.equal(enviados[0].a, 'Caro');
  assert.equal(enviados[0].titulo, 'Ana actualizó su lista de deseos');
  assert.match(enviados[0].descripcion!, /Hollow Knight/);
  assert.ok(!texto(r).includes('Caro') && !JSON.stringify(r).includes('Caro'));
  assert.ok(!enviados[0].asunto.includes('Ana'), 'el asunto del mail no nombra a nadie');
});

test('/deseos ver, borrar y los límites', async () => {
  assert.match(texto(await manejarInteraccion(deseos('ver'), deps().d)), /Tu lista está vacía/);
  const conLista = deps({
    participacion: { id: 1, evento: 'N', sorteado: false, deseos: '• Libros', regalador: null },
  });
  assert.match(texto(await manejarInteraccion(deseos('ver'), conLista.d)), /Libros/);
  assert.match(texto(await manejarInteraccion(deseos('borrar'), conLista.d)), /quedó vacía/);
  assert.deepEqual(conLista.deseosGuardados, [null]);

  const llena = deps({
    participacion: { id: 1, evento: 'N', sorteado: false, deseos: 'x'.repeat(995), regalador: null },
  });
  assert.match(texto(await manejarInteraccion(deseos('agregar', 'algo más'), llena.d)), /muy larga/);
  assert.deepEqual(llena.deseosGuardados, []);

  assert.match(
    texto(await manejarInteraccion(deseos('ver'), deps({ participacion: null }).d)),
    /No estás anotado/,
  );
});

const unirme = (mail?: string): Interaccion => ({
  type: 2,
  data: { name: 'unirme', options: mail === undefined ? [] : [{ name: 'mail', value: mail }] },
  member: { user: { id: '999', username: 'nueva' } },
  guild_id: '9',
});

test('/unirme sin estar en la lista sugiere usar el mail', async () => {
  const r = texto(await manejarInteraccion(unirme(), deps({ persona: false }).d));
  assert.match(r, /No te encontré/);
  assert.match(r, /\/unirme mail:/);
});

test('/unirme mail: deja un pedido pendiente, no vincula directo', async () => {
  const { d, pedidos } = deps({ persona: false });
  const r = texto(await manejarInteraccion(unirme('  Ana@Ejemplo.com '), d));
  assert.deepEqual(pedidos, ['ana@ejemplo.com']);
  assert.match(r, /pedido hecho/);
  assert.match(r, /organizador lo confirme/);
});

test('/unirme mail: explica cada caso y rechaza mails inválidos sin consultar', async () => {
  const casos: [ResultadoPedido, RegExp][] = [
    ['no-existe', /No encontré a nadie con ese mail/],
    ['ya-vinculado', /ya está vinculado a otra cuenta/],
    ['ya-pedido', /Ya tenías un pedido/],
  ];
  for (const [resultado, esperado] of casos) {
    assert.match(texto(await manejarInteraccion(unirme('a@b.com'), deps({ persona: false, pedido: resultado }).d)), esperado);
  }
  const invalido = deps({ persona: false });
  assert.match(texto(await manejarInteraccion(unirme('no-es-mail'), invalido.d)), /no parece válido/);
  assert.deepEqual(invalido.pedidos, []);
});

test('/unirme de alguien ya vinculado no hace un pedido', async () => {
  const { d, pedidos } = deps();
  assert.match(texto(await manejarInteraccion(unirme('ana@ejemplo.com'), d)), /tu cuenta quedó vinculada/);
  assert.deepEqual(pedidos, []);
});

const talles = (opciones: Record<string, unknown>): Interaccion => ({
  type: 2,
  data: { name: 'talles', options: Object.entries(opciones).map(([name, value]) => ({ name, value })) },
  user: { id: '111', username: 'ana' },
});

const participacion = (extra: Partial<Participacion> = {}): Participacion => ({
  id: 1,
  evento: 'Navidad 2026',
  sorteado: false,
  deseos: null,
  talles: null,
  regalador: null,
  ...extra,
});

test('/talles sin opciones muestra lo cargado o explica cómo cargar', async () => {
  assert.match(texto(await manejarInteraccion(talles({}), deps().d)), /Todavía no cargaste talles/);
  const r = await manejarInteraccion(talles({}), deps({ participacion: participacion({ talles: 'Remera: M' }) }).d);
  assert.match(texto(r), /Remera: M/);
});

test('/talles guarda solo lo que cambia, antes del sorteo sin avisar a nadie', async () => {
  const { d, tallesGuardados, enviados } = deps({ participacion: participacion({ talles: 'Remera: M' }) });
  const r = await manejarInteraccion(talles({ zapatillas: '42', buzo: 'L' }), d);
  assert.deepEqual(tallesGuardados, ['Remera: M\nBuzo / campera: L\nZapatillas: 42']);
  assert.match(texto(r), /Zapatillas: 42/);
  assert.equal(enviados.length, 0);
});

test('/talles después del sorteo le avisa a quien regala sin revelarlo', async () => {
  const { d, enviados } = deps({
    participacion: participacion({ sorteado: true, regalador: { nombre: 'Caro', discordUserId: '333', email: null } }),
  });
  const r = await manejarInteraccion(talles({ remera: 'XL' }), d);
  assert.equal(enviados[0].a, 'Caro');
  assert.equal(enviados[0].titulo, 'Ana actualizó sus talles');
  assert.match(enviados[0].descripcion!, /Remera: XL/);
  assert.ok(!JSON.stringify(r).includes('Caro'));
});

test('/talles borrar los vacía, y con talles nuevos empieza de cero', async () => {
  const solo = deps({ participacion: participacion({ talles: 'Remera: M' }) });
  assert.match(texto(await manejarInteraccion(talles({ borrar: true }), solo.d)), /borré tus talles/);
  assert.deepEqual(solo.tallesGuardados, [null]);

  const conNuevos = deps({ participacion: participacion({ talles: 'Remera: M' }) });
  await manejarInteraccion(talles({ borrar: true, zapatillas: '40' }), conNuevos.d);
  assert.deepEqual(conNuevos.tallesGuardados, ['Zapatillas: 40']);
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
