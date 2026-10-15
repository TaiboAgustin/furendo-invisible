import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avisar, contenidoSorteo, type Canales } from '../src/avisos.ts';
import { buscarMiembro, mandarDM, ErrorDiscord } from '../src/discord.ts';
import type { DatosAviso } from '../src/mensajes.ts';

const datos: DatosAviso = {
  evento: 'Navidad 2026',
  budgetMin: 50000,
  budgetMax: 70000,
  revelacion: '2026-12-24',
  entrega: null,
  quienRegala: 'Ana',
  aQuien: 'Beto <b>',
  wishlist: 'Juegos indie',
  sizes: 'L',
  notes: null,
  address: 'Calle Falsa 123',
};
const contenido = contenidoSorteo(datos);

function canalesFalsos(opts: { discordFalla?: boolean; mailFalla?: boolean; sinMail?: boolean } = {}) {
  const llamadas: string[] = [];
  const canales: Canales = {
    discord: async (id) => {
      llamadas.push(`discord:${id}`);
      if (opts.discordFalla) throw new Error('DMs cerrados');
    },
    mail: opts.sinMail
      ? undefined
      : async (para) => {
          llamadas.push(`mail:${para.email}`);
          if (opts.mailFalla) throw new Error('rebotó');
        },
  };
  return { canales, llamadas };
}

test('con Discord vinculado avisa por Discord y no manda mail', async () => {
  const { canales, llamadas } = canalesFalsos();
  const r = await avisar({ nombre: 'Ana', discordUserId: '1', email: 'a@x.com' }, contenido, canales);
  assert.deepEqual(r, { ok: true, canal: 'discord' });
  assert.deepEqual(llamadas, ['discord:1']);
});

test('si Discord falla, usa el mail de respaldo y deja anotado por qué', async () => {
  const { canales, llamadas } = canalesFalsos({ discordFalla: true });
  const r = await avisar({ nombre: 'Ana', discordUserId: '1', email: 'a@x.com' }, contenido, canales);
  assert.deepEqual(r, { ok: true, canal: 'mail', nota: 'Discord: DMs cerrados' });
  assert.deepEqual(llamadas, ['discord:1', 'mail:a@x.com']);
});

test('sin Discord ni mail configurado, queda el error explicado', async () => {
  const { canales } = canalesFalsos({ sinMail: true });
  assert.deepEqual(await avisar({ nombre: 'Ana', discordUserId: null, email: 'a@x.com' }, contenido, canales), {
    ok: false,
    error: 'No tiene Discord vinculado y el mail no está configurado.',
  });
  assert.deepEqual(await avisar({ nombre: 'Ana', discordUserId: null, email: null }, contenido, canales), {
    ok: false,
    error: 'No tiene Discord vinculado ni mail.',
  });
});

test('si fallan los dos canales, el error junta ambos motivos', async () => {
  const { canales } = canalesFalsos({ discordFalla: true, mailFalla: true });
  const r = await avisar({ nombre: 'Ana', discordUserId: '1', email: 'a@x.com' }, contenido, canales);
  assert.deepEqual(r, { ok: false, error: 'Discord: DMs cerrados Mail: rebotó' });
});

test('el aviso dice a quién regalar, el presupuesto y escapa el HTML del mail', () => {
  assert.equal(contenido.embed.title, 'Te tocó regalarle a Beto <b>');
  assert.match(contenido.embed.description!, /entre \$50\.000 y \$70\.000/);
  assert.equal(contenido.mail.subject, 'Tu amigo invisible de Navidad 2026');
  assert.ok(!contenido.mail.subject.includes('Beto'), 'el asunto no revela el nombre');
  assert.match(contenido.mail.html, /Beto &lt;b&gt;/);
  assert.match(contenido.mail.text, /Dirección para el envío: Calle Falsa 123/);
});

function fetchFalso(respuestas: { status: number; body: unknown }[], pedidos: { url: string; init?: RequestInit }[]) {
  return (async (url: string, init?: RequestInit) => {
    pedidos.push({ url, init });
    const r = respuestas.shift()!;
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
}

test('buscarMiembro devuelve el id solo si el usuario coincide exacto', async () => {
  const pedidos: { url: string }[] = [];
  const f = fetchFalso(
    [
      {
        status: 200,
        body: [
          { user: { id: '9', username: 'mica.rl2' } },
          { user: { id: '7', username: 'Mica.RL' } },
        ],
      },
    ],
    pedidos,
  );
  assert.equal(await buscarMiembro('tok', '123', 'mica.rl', f), '7');
  assert.match(pedidos[0].url, /\/guilds\/123\/members\/search\?query=mica.rl&limit=20$/);
});

test('mandarDM abre el canal privado y manda el embed; los errores se explican', async () => {
  const pedidos: { url: string; init?: RequestInit }[] = [];
  const f = fetchFalso(
    [
      { status: 200, body: { id: 'canal1' } },
      { status: 200, body: { id: 'msg1' } },
    ],
    pedidos,
  );
  await mandarDM('tok', '42', contenido.embed, f);
  assert.ok(pedidos[0].url.endsWith('/users/@me/channels'));
  assert.equal(JSON.parse(String(pedidos[0].init?.body)).recipient_id, '42');
  assert.ok(pedidos[1].url.endsWith('/channels/canal1/messages'));

  const f2 = fetchFalso([{ status: 403, body: { code: 50007, message: 'Cannot send messages to this user' } }], []);
  await assert.rejects(mandarDM('tok', '42', contenido.embed, f2), (e: ErrorDiscord) => {
    assert.equal(e.message, 'Tiene cerrados los mensajes privados de miembros del server.');
    return true;
  });
});
