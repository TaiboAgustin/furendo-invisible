// Comandos del bot. Discord manda cada uso de un comando como un POST firmado;
// la respuesta va en el mismo pedido. Todas las respuestas son efímeras (solo las
// ve quien usó el comando), así nada se filtra si alguien lo usa en un canal.

import type { Destinatario, ResultadoAviso } from './avisos.ts';
import type { NombreComando } from './comandos.ts';
import {
  NARANJA,
  embedPregunta,
  embedRespuesta,
  embedSorteo,
  mailReenvio,
  type Embed,
  type Mail,
} from './mensajes.ts';

// ---------- Tipos de Discord (solo lo que usamos) ----------

type UsuarioDiscord = { id: string; username: string };

export type Interaccion = {
  type: number; // 1 = ping, 2 = comando
  data?: { name: string; options?: { name: string; value: unknown }[] };
  user?: UsuarioDiscord; // en privado
  member?: { user: UsuarioDiscord }; // en un server
  guild_id?: string;
};

export type Respuesta =
  | { type: 1 }
  | { type: 4; data: { content?: string; embeds?: Embed[]; flags: number; allowed_mentions: { parse: [] } } };

const EFIMERO = 64;

function responder(contenido: string | Embed): Respuesta {
  return {
    type: 4,
    data: {
      ...(typeof contenido === 'string' ? { content: contenido } : { embeds: [contenido] }),
      flags: EFIMERO,
      allowed_mentions: { parse: [] },
    },
  };
}

// ---------- Lo que el manejador necesita de la base y de los canales ----------

export type PersonaBot = { id: number; name: string };

export type Contexto = {
  evento: {
    name: string;
    budget_min: number | null;
    budget_max: number | null;
    deadline: string | null;
    reveal_date: string | null;
  };
  yo: { name: string };
  /** A quién le regalo. */
  receptor: Destinatario & {
    address: string | null;
    wishlist: string | null;
    sizes: string | null;
    notes: string | null;
  };
  /** Quién me regala. Nunca se muestra su nombre. */
  regalador: Destinatario;
};

export type Deps = {
  /** Busca a la persona por id de Discord; si no está, por usuario (y la vincula). */
  persona(usuario: UsuarioDiscord): Promise<PersonaBot | null>;
  /** El sorteo más reciente en el que participa y que todavía no se reveló. */
  contexto(personaId: number): Promise<Contexto | null | 'sin-sortear'>;
  enviar(a: Destinatario, contenido: { embed: Embed; mail: Mail }): Promise<ResultadoAviso>;
};

// ---------- Textos ----------

const AYUDA = [
  '**Cómo funciona Furendo Invisible**',
  '',
  '`/unirme` — vincula tu cuenta (usalo en el server).',
  '`/mi-amigo` — te recuerda a quién le regalás y qué le gusta.',
  '`/preguntar` — le manda una pregunta a tu amigo invisible sin decir quién sos.',
  '`/responder` — le contesta a quien te regala.',
  '`/direccion` — la dirección para mandarle el regalo.',
  '',
  'Todo lo que hagas con el bot lo ves solo vos.',
].join('\n');

const NO_TE_CONOZCO = (u: string) =>
  `No te encontré en la lista de participantes como **${u}**. Pedile al organizador que cargue tu usuario de Discord tal cual y probá de nuevo.`;

// ---------- Manejador ----------

function opcion(i: Interaccion, nombre: string): string {
  const v = i.data?.options?.find((o) => o.name === nombre)?.value;
  return typeof v === 'string' ? v.trim() : '';
}

export async function manejarInteraccion(i: Interaccion, deps: Deps): Promise<Respuesta> {
  if (i.type === 1) return { type: 1 };
  if (i.type !== 2 || !i.data) return responder('No entendí ese pedido.');

  const usuario = i.member?.user ?? i.user;
  if (!usuario) return responder('No pude saber quién sos.');
  const comando = i.data.name as NombreComando;

  if (comando === 'ayuda') return responder(AYUDA);

  const persona = await deps.persona(usuario);
  if (!persona) return responder(NO_TE_CONOZCO(usuario.username));

  if (comando === 'unirme') {
    return responder(
      `Listo, ${persona.name}: tu cuenta quedó vinculada. Cuando se haga el sorteo te escribo por privado.`,
    );
  }

  const ctx = await deps.contexto(persona.id);
  if (ctx === 'sin-sortear') return responder('Todavía no se hizo el sorteo. Cuando esté, te aviso por privado.');
  if (!ctx) return responder('No estás en ningún amigo invisible en curso.');

  switch (comando) {
    case 'mi-amigo':
      return responder(
        embedSorteo({
          evento: ctx.evento.name,
          budgetMin: ctx.evento.budget_min,
          budgetMax: ctx.evento.budget_max,
          entrega: ctx.evento.deadline,
          revelacion: ctx.evento.reveal_date,
          quienRegala: ctx.yo.name,
          aQuien: ctx.receptor.nombre,
          wishlist: ctx.receptor.wishlist,
          sizes: ctx.receptor.sizes,
          notes: ctx.receptor.notes,
          address: null,
        }),
      );

    case 'direccion':
      return responder(
        ctx.receptor.address
          ? { title: `Dirección de ${ctx.receptor.nombre}`, description: ctx.receptor.address, color: NARANJA }
          : `${ctx.receptor.nombre} no cargó una dirección. Preguntale con /preguntar cómo le hacés llegar el regalo.`,
      );

    case 'preguntar': {
      const texto = opcion(i, 'mensaje');
      if (!texto) return responder('Escribí la pregunta en `mensaje`.');
      const r = await deps.enviar(ctx.receptor, {
        embed: embedPregunta(ctx.evento.name, texto),
        mail: mailReenvio(
          ctx.evento.name,
          'Tu amigo invisible te pregunta',
          texto,
          'Para contestarle necesitás el bot de Discord del server.',
        ),
      });
      return responder(
        r.ok
          ? `Listo, le llegó a ${ctx.receptor.nombre}${r.canal === 'mail' ? ' por mail' : ''}. No sabe que fuiste vos.`
          : `No le pude hacer llegar la pregunta. ${r.error}`,
      );
    }

    case 'responder': {
      const texto = opcion(i, 'mensaje');
      if (!texto) return responder('Escribí la respuesta en `mensaje`.');
      const r = await deps.enviar(ctx.regalador, {
        embed: embedRespuesta(ctx.evento.name, ctx.yo.name, texto),
        // El asunto del mail no nombra a nadie: queda en registros de terceros.
        mail: mailReenvio(ctx.evento.name, 'Te respondieron', `${ctx.yo.name} te respondió:\n\n${texto}`, ''),
      });
      return responder(r.ok ? 'Listo, tu respuesta le llegó a quien te regala.' : `No se pudo mandar. ${r.error}`);
    }

    default:
      return responder('Ese comando todavía no existe.');
  }
}
