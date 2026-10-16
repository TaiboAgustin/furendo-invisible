// Comandos del bot. Discord manda cada uso de un comando como un POST firmado;
// la respuesta va en el mismo pedido. Todas las respuestas son efímeras (solo las
// ve quien usó el comando), así nada se filtra si alguien lo usa en un canal.

import type { Contenido, Destinatario, ResultadoAviso } from './avisos.ts';
import { MAX_DESEOS, PRENDAS, TIPOS_REGALO, type NombreComando, type Prenda, type TipoRegalo } from './comandos.ts';
import { actualizarTalles } from './talles.ts';
import {
  NARANJA,
  embedDeseos,
  embedDeseosActualizados,
  embedTalles,
  embedTallesActualizados,
  embedEnCamino,
  embedPregunta,
  embedRecibido,
  embedRegaloVirtual,
  embedRespuesta,
  embedSorteo,
  linkActivarSteam,
  mailReenvio,
  type Archivo,
  type Embed,
} from './mensajes.ts';

// ---------- Tipos de Discord (solo lo que usamos) ----------

type UsuarioDiscord = { id: string; username: string };

type AdjuntoDiscord = { url: string; filename: string; size: number; content_type?: string };

export type Interaccion = {
  type: number; // 1 = ping, 2 = comando
  data?: {
    name: string;
    // Con subcomandos, el primero trae sus propias opciones adentro.
    options?: { name: string; value?: unknown; type?: number; options?: { name: string; value: unknown }[] }[];
    resolved?: { attachments?: Record<string, AdjuntoDiscord> };
  };
  user?: UsuarioDiscord; // en privado
  member?: { user: UsuarioDiscord }; // en un server
  guild_id?: string;
  application_id?: string;
  token?: string; // para completar una respuesta diferida
};

type DatosRespuesta = { content?: string; embeds?: Embed[]; flags: number; allowed_mentions: { parse: [] } };

export type RespuestaInmediata = { type: 4; data: DatosRespuesta };

export type Respuesta =
  | { type: 1 }
  | RespuestaInmediata
  // "Pensando…": Discord da 3 segundos para contestar. Si hay que bajar y reenviar un
  // archivo, se contesta esto y el resultado se completa después con `trabajo`.
  | { type: 5; data: { flags: number }; trabajo: () => Promise<RespuestaInmediata> };

const EFIMERO = 64;

/** Discord deja a los bots mandar hasta 10 MB por mensaje sin boost en el server. */
export const MAX_ARCHIVO = 10 * 1024 * 1024;

function responder(contenido: string | Embed): RespuestaInmediata {
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
    id: number;
    name: string;
    budget_min: number | null;
    budget_max: number | null;
    deadline: string | null;
    reveal_date: string | null;
    /** Después de la revelación ya se puede decir quién te regaló. */
    status?: string;
  };
  yo: { name: string; participacion: number };
  /** A quién le regalo. */
  receptor: Destinatario & {
    address: string | null;
    wishlist: string | null;
    sizes: string | null;
    notes: string | null;
  };
  /** Quién me regala. Nunca se muestra su nombre. */
  regalador: Destinatario & { participacion: number };
};

export type EstadoEntrega = 'en_camino' | 'entregado' | 'recibido';

export type Deps = {
  /** Busca a la persona por id de Discord; si no está, por usuario (y la vincula). */
  persona(usuario: UsuarioDiscord): Promise<PersonaBot | null>;
  /** El sorteo más reciente en el que participa y que todavía no se reveló. */
  contexto(personaId: number): Promise<Contexto | null | 'sin-sortear'>;
  enviar(a: Destinatario, contenido: Contenido): Promise<ResultadoAviso>;
  /** Anota cómo va el regalo de `regaladorId`. Nunca guarda el contenido. */
  registrarEntrega(eventoId: number, regaladorId: number, estado: EstadoEntrega, virtual: boolean): Promise<void>;
  descargar(url: string): Promise<Uint8Array>;
  /** El evento en armado o sorteado en el que participa, con su lista de deseos. */
  participacion(personaId: number): Promise<Participacion | null>;
  guardarDeseos(participacionId: number, deseos: string | null): Promise<void>;
  guardarTalles(participacionId: number, talles: string | null): Promise<void>;
  /** Deja pendiente de confirmación el vínculo de esta cuenta con la persona de ese mail. */
  pedirVinculo(usuario: UsuarioDiscord, mail: string): Promise<ResultadoPedido>;
};

export type ResultadoPedido = 'pedido' | 'ya-pedido' | 'no-existe' | 'ya-vinculado';

export type Participacion = {
  id: number;
  evento: string;
  sorteado: boolean;
  deseos: string | null;
  talles: string | null;
  /** Solo después del sorteo: a quién avisarle que cambió la lista. */
  regalador: Destinatario | null;
};

// ---------- Textos ----------

const AYUDA = [
  '**Cómo funciona Furendo Invisible**',
  '',
  '`/unirme` — vincula tu cuenta (usalo en el server). Si no te encuentra, `/unirme mail:` con el mail del formulario.',
  '`/mi-amigo` — te recuerda a quién le regalás y qué le gusta.',
  '`/deseos` — armá tu lista de deseos (`agregar`, `ver`, `borrar`). La ve quien te regala.',
  '`/talles` — cargá tus talles de remera, buzo, pantalón, zapatillas u otro, por si te regalan ropa.',
  '`/preguntar` — le manda una pregunta a tu amigo invisible sin decir quién sos.',
  '`/responder` — le contesta a quien te regala.',
  '`/direccion` — la dirección para mandarle el regalo.',
  '`/entregar` — le pasa un regalo virtual (una key de Steam, un código, un link o un archivo). Solo por privado con el bot.',
  '`/enviado` — avisa que despachaste el regalo físico.',
  '`/recibido` — confirma que te llegó el tuyo.',
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

const SUBCOMANDO = 1;

function subcomando(i: Interaccion): { nombre: string; opcion: (n: string) => string } {
  const sub = i.data?.options?.find((o) => o.type === SUBCOMANDO);
  return {
    nombre: sub?.name ?? '',
    opcion: (n) => {
      const v = sub?.options?.find((o) => o.name === n)?.value;
      return typeof v === 'string' ? v.trim() : '';
    },
  };
}

async function manejarTalles(i: Interaccion, persona: PersonaBot, deps: Deps): Promise<RespuestaInmediata> {
  const p = await deps.participacion(persona.id);
  if (!p) return responder('No estás anotado en ningún amigo invisible en curso.');

  const borrar = i.data?.options?.find((o) => o.name === 'borrar')?.value === true;
  const cambios: Partial<Record<Prenda, string>> = {};
  for (const prenda of Object.keys(PRENDAS) as Prenda[]) {
    const v = opcion(i, prenda);
    if (v) cambios[prenda] = v;
  }

  if (!borrar && Object.keys(cambios).length === 0) {
    return responder(
      p.talles
        ? embedTalles(p.evento, p.talles)
        : 'Todavía no cargaste talles. Usá `/talles` y elegí remera, buzo, pantalón, zapatillas u otro.',
    );
  }

  // Con borrar y talles nuevos a la vez, se empieza de cero con los nuevos.
  const nuevos = actualizarTalles(borrar ? null : p.talles, cambios);
  if (nuevos === p.talles) return responder(nuevos ? embedTalles(p.evento, nuevos) : 'No tenías talles cargados.');
  await deps.guardarTalles(p.id, nuevos);

  let extra = '';
  if (p.sorteado && p.regalador) {
    const r = await deps.enviar(p.regalador, {
      embed: embedTallesActualizados(p.evento, persona.name, nuevos),
      mail: mailReenvio(
        p.evento,
        'Tu amigo invisible actualizó sus talles',
        nuevos ? `${persona.name}:\n\n${nuevos}` : `${persona.name} borró sus talles.`,
        '',
      ),
    });
    extra = r.ok ? ' Le avisé a quien te regala.' : ' No le pude avisar a quien te regala, pero lo va a ver con /mi-amigo.';
  }

  if (!nuevos) return responder(`Listo, borré tus talles.${extra}`);
  const embed = embedTalles(p.evento, nuevos);
  embed.footer = { text: `Listo, quedaron guardados.${extra}` };
  return responder(embed);
}

async function manejarDeseos(i: Interaccion, persona: PersonaBot, deps: Deps): Promise<RespuestaInmediata> {
  const p = await deps.participacion(persona.id);
  if (!p) return responder('No estás anotado en ningún amigo invisible en curso.');
  const sub = subcomando(i);

  if (sub.nombre === 'ver') {
    return responder(
      p.deseos
        ? embedDeseos(p.evento, p.deseos)
        : 'Tu lista está vacía. Sumá cosas con `/deseos agregar`.',
    );
  }

  let nueva: string | null;
  if (sub.nombre === 'agregar') {
    const texto = sub.opcion('texto').replace(/\s*\n+\s*/g, ' ');
    if (!texto) return responder('Escribí qué te gustaría que te regalen.');
    nueva = [p.deseos, `• ${texto}`].filter(Boolean).join('\n');
    if (nueva.length > MAX_DESEOS) {
      return responder(`Tu lista ya es muy larga (máximo ${MAX_DESEOS} caracteres). Usá \`/deseos borrar\` y armala de nuevo más corta.`);
    }
  } else if (sub.nombre === 'borrar') {
    if (!p.deseos) return responder('Tu lista ya estaba vacía.');
    nueva = null;
  } else {
    return responder('Usá `/deseos agregar`, `/deseos ver` o `/deseos borrar`.');
  }

  await deps.guardarDeseos(p.id, nueva);
  const confirmacion = nueva ? embedDeseos(p.evento, nueva) : null;

  // Después del sorteo, quien te regala se entera del cambio (sin que vos sepas quién es).
  let extra = '';
  if (p.sorteado && p.regalador) {
    const r = await deps.enviar(p.regalador, {
      embed: embedDeseosActualizados(p.evento, persona.name, nueva),
      mail: mailReenvio(
        p.evento,
        'Tu amigo invisible actualizó su lista de deseos',
        nueva ? `${persona.name} ahora quiere:\n\n${nueva}` : `${persona.name} borró su lista de deseos.`,
        '',
      ),
    });
    extra = r.ok ? ' Le avisé a quien te regala.' : ' No le pude avisar a quien te regala, pero lo va a ver con /mi-amigo.';
  }

  if (!confirmacion) return responder(`Listo, tu lista quedó vacía.${extra}`);
  confirmacion.footer = { text: `Listo, quedó guardada.${extra}` };
  return responder(confirmacion);
}

export async function manejarInteraccion(i: Interaccion, deps: Deps): Promise<Respuesta> {
  if (i.type === 1) return { type: 1 };
  if (i.type !== 2 || !i.data) return responder('No entendí ese pedido.');

  const usuario = i.member?.user ?? i.user;
  if (!usuario) return responder('No pude saber quién sos.');
  const comando = i.data.name as NombreComando;

  if (comando === 'ayuda') return responder(AYUDA);

  const persona = await deps.persona(usuario);

  if (comando === 'unirme') {
    if (persona) {
      return responder(
        `Listo, ${persona.name}: tu cuenta quedó vinculada. Cuando se haga el sorteo te escribo por privado.`,
      );
    }
    const mail = opcion(i, 'mail').toLowerCase();
    if (!mail) {
      return responder(
        `${NO_TE_CONOZCO(usuario.username)}\n\nSi en el formulario no pusiste tu usuario, probá con \`/unirme mail:\` y el mail que cargaste.`,
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return responder('Ese mail no parece válido. Revisalo y probá de nuevo.');
    const r = await deps.pedirVinculo(usuario, mail);
    if (r === 'no-existe') {
      return responder('No encontré a nadie con ese mail en la lista. Fijate que sea el mismo que pusiste en el formulario.');
    }
    if (r === 'ya-vinculado') {
      return responder('Ese mail ya está vinculado a otra cuenta de Discord. Si es tuyo, hablá con el organizador.');
    }
    return responder(
      r === 'ya-pedido'
        ? 'Ya tenías un pedido hecho. Falta que el organizador lo confirme.'
        : 'Listo, pedido hecho. Cuando el organizador lo confirme, quedás vinculado y te escribo por privado.',
    );
  }

  if (!persona) return responder(NO_TE_CONOZCO(usuario.username));

  // Funciona antes y después del sorteo.
  if (comando === 'deseos') return manejarDeseos(i, persona, deps);
  if (comando === 'talles') return manejarTalles(i, persona, deps);

  const ctx = await deps.contexto(persona.id);
  if (ctx === 'sin-sortear') return responder('Todavía no se hizo el sorteo. Cuando esté, te aviso por privado.');
  if (!ctx) return responder('No estás en ningún amigo invisible en curso.');

  switch (comando) {
    case 'mi-amigo': {
      const embed = embedSorteo({
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
      });
      if (ctx.evento.status === 'revelado') {
        embed.fields = [...(embed.fields ?? []), { name: 'Quién te regaló a vos', value: ctx.regalador.nombre }];
        embed.footer = { text: 'Ya pasó la revelación.' };
      }
      return responder(embed);
    }

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

    case 'entregar': {
      const tipo = opcion(i, 'tipo') as TipoRegalo;
      const contenido = opcion(i, 'contenido');
      const mensaje = opcion(i, 'mensaje') || null;
      if (!(tipo in TIPOS_REGALO)) return responder('Elegí qué tipo de regalo es.');
      if (!contenido) return responder('Falta el contenido del regalo.');

      const idAdjunto = opcion(i, 'archivo');
      const adjunto = idAdjunto ? i.data.resolved?.attachments?.[idAdjunto] : undefined;
      if (adjunto && adjunto.size > MAX_ARCHIVO) {
        return responder('El archivo pesa más de 10 MB. Subilo a Drive o similar y mandá el link.');
      }

      const entregar = async (archivo?: Archivo): Promise<RespuestaInmediata> => {
        const extraMail = tipo === 'steam' ? `\n\nPara activarla: ${linkActivarSteam(contenido)}` : '';
        const r = await deps.enviar(ctx.receptor, {
          embed: embedRegaloVirtual(ctx.evento.name, tipo, contenido, mensaje, !!archivo),
          mail: mailReenvio(
            ctx.evento.name,
            'Tu amigo invisible te dejó un regalo',
            [contenido + extraMail, mensaje].filter(Boolean).join('\n\n'),
            'Cuando lo tengas, avisale al organizador que te llegó.',
          ),
          archivo,
        });
        if (!r.ok) return responder(`No se pudo entregar. ${r.error} Tu regalo no se guardó: probá de nuevo.`);
        await deps.registrarEntrega(ctx.evento.id, ctx.yo.participacion, 'entregado', true);
        return responder(
          `Listo, ${ctx.receptor.nombre} ya tiene tu regalo${r.canal === 'mail' ? ' (le llegó por mail)' : ''}. El bot no guardó una copia.`,
        );
      };

      if (!adjunto) return entregar();
      return {
        type: 5,
        data: { flags: EFIMERO },
        trabajo: async () => {
          let datos: Uint8Array;
          try {
            datos = await deps.descargar(adjunto.url);
          } catch {
            return responder('No pude leer el archivo que subiste. Probá de nuevo.');
          }
          return entregar({
            nombre: adjunto.filename,
            tipo: adjunto.content_type ?? 'application/octet-stream',
            datos,
          });
        },
      };
    }

    case 'enviado': {
      const seguimiento = opcion(i, 'seguimiento') || null;
      const mensaje = opcion(i, 'mensaje') || null;
      const r = await deps.enviar(ctx.receptor, {
        embed: embedEnCamino(ctx.evento.name, seguimiento, mensaje),
        mail: mailReenvio(
          ctx.evento.name,
          'Tu regalo está en camino',
          [seguimiento && `Seguimiento: ${seguimiento}`, mensaje].filter(Boolean).join('\n\n') ||
            'Tu amigo invisible ya lo despachó.',
          '',
        ),
      });
      await deps.registrarEntrega(ctx.evento.id, ctx.yo.participacion, 'en_camino', false);
      return responder(
        r.ok
          ? `Anotado. Le avisé a ${ctx.receptor.nombre} que su regalo está en camino.`
          : `Lo anoté como enviado, pero no le pude avisar. ${r.error}`,
      );
    }

    case 'recibido': {
      const mensaje = opcion(i, 'mensaje') || null;
      await deps.registrarEntrega(ctx.evento.id, ctx.regalador.participacion, 'recibido', false);
      const r = await deps.enviar(ctx.regalador, {
        embed: embedRecibido(ctx.evento.name, ctx.yo.name, mensaje),
        mail: mailReenvio(ctx.evento.name, 'Tu regalo llegó', `${ctx.yo.name} recibió tu regalo.${mensaje ? `\n\n${mensaje}` : ''}`, ''),
      });
      return responder(
        r.ok
          ? '¡Qué bueno! Le avisé a quien te regaló que te llegó.'
          : `Lo anoté como recibido, pero no le pude avisar a quien te regaló. ${r.error}`,
      );
    }

    default:
      return responder('Ese comando todavía no existe.');
  }
}
