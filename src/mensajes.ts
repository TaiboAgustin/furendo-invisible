// Textos de los avisos. Funciones puras para poder testearlas sin Discord ni mail.

export const NARANJA = 0xf26b1d;

/** Archivo que acompaña un regalo virtual (una entrada, un voucher, un dibujo…). */
export type Archivo = { nombre: string; tipo: string; datos: Uint8Array };

export type DatosAviso = {
  evento: string;
  budgetMin: number | null;
  budgetMax: number | null;
  revelacion: string | null; // YYYY-MM-DD
  entrega: string | null; // YYYY-MM-DD
  quienRegala: string;
  aQuien: string;
  wishlist: string | null;
  sizes: string | null;
  notes: string | null;
  address: string | null;
};

const pesos = (n: number) => `$${n.toLocaleString('es-AR')}`;

export function textoPresupuesto(min: number | null, max: number | null): string | null {
  if (min != null && max != null) return `entre ${pesos(min)} y ${pesos(max)}`;
  if (min != null) return `desde ${pesos(min)}`;
  if (max != null) return `hasta ${pesos(max)}`;
  return null;
}

function fecha(iso: string | null): string | null {
  if (!iso) return null;
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

function recortar(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

// ---------- Discord ----------

export type Embed = {
  title?: string;
  description?: string;
  color?: number;
  author?: { name: string };
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
};

export function embedSorteo(d: DatosAviso): Embed {
  const rango = textoPresupuesto(d.budgetMin, d.budgetMax);
  const fields: Embed['fields'] = [];
  if (d.wishlist) fields.push({ name: 'Lista de deseos', value: recortar(d.wishlist, 1024) });
  if (d.sizes) fields.push({ name: 'Talles', value: recortar(d.sizes, 1024), inline: true });
  if (d.notes) fields.push({ name: 'Observaciones', value: recortar(d.notes, 1024) });

  const pie = ['Esto lo sabés solo vos.'];
  if (d.entrega) pie.push(`Entrega: ${fecha(d.entrega)}.`);
  if (d.revelacion) pie.push(`Revelación: ${fecha(d.revelacion)}.`);

  return {
    author: { name: recortar(d.evento, 256) },
    title: recortar(`Te tocó regalarle a ${d.aQuien}`, 256),
    description: [
      rango ? `Presupuesto ${rango}. Puede ser físico o virtual.` : 'Puede ser un regalo físico o virtual.',
      'Si necesitás preguntarle algo, hacelo por acá: el bot se lo pasa sin decir quién sos.',
    ].join('\n\n'),
    color: NARANJA,
    fields,
    footer: { text: pie.join(' ') },
  };
}

export function embedPrueba(nombre: string): Embed {
  return {
    title: `¡Hola, ${recortar(nombre, 200)}!`,
    description:
      'Este es un mensaje de prueba de **Furendo Invisible**. Cuando se haga el sorteo, por acá te va a llegar a quién le regalás.',
    color: NARANJA,
  };
}

/** Pregunta de quien regala a quien recibe. No dice quién pregunta. */
export function embedPregunta(evento: string, texto: string): Embed {
  return {
    author: { name: recortar(evento, 256) },
    title: 'Tu amigo invisible te pregunta',
    description: recortar(texto, 4000),
    color: NARANJA,
    footer: { text: 'Para contestarle usá /responder. Quién te pregunta sigue siendo un secreto.' },
  };
}

/** Respuesta de quien recibe a quien le regala. Quien regala ya sabe a quién le regala. */
export function embedRespuesta(evento: string, quienResponde: string, texto: string): Embed {
  return {
    author: { name: recortar(evento, 256) },
    title: recortar(`${quienResponde} te respondió`, 256),
    description: recortar(texto, 4000),
    color: NARANJA,
    footer: { text: 'Para seguir la charla, usá /preguntar.' },
  };
}

// ---------- Lista de deseos ----------

export function embedDeseos(evento: string, deseos: string): Embed {
  return {
    author: { name: recortar(evento, 256) },
    title: 'Tu lista de deseos',
    description: recortar(deseos, 4000),
    color: NARANJA,
  };
}

/** A quien regala: su amigo invisible cambió la lista. */
export function embedDeseosActualizados(evento: string, quien: string, deseos: string | null): Embed {
  return {
    author: { name: recortar(evento, 256) },
    title: recortar(`${quien} actualizó su lista de deseos`, 256),
    description: deseos ? recortar(deseos, 4000) : 'La dejó vacía por ahora.',
    color: NARANJA,
    footer: { text: 'La tenés siempre a mano con /mi-amigo.' },
  };
}

// ---------- Bajas y revelación ----------

/** A quien le regalaba a alguien que se dio de baja: su nuevo amigo invisible. */
export function embedCambio(d: DatosAviso, quienSeFue: string): Embed {
  const base = embedSorteo(d);
  return {
    ...base,
    title: recortar(`Hubo un cambio: ahora le regalás a ${d.aQuien}`, 256),
    description: [
      `${quienSeFue} no va a participar, así que te toca otra persona.`,
      base.description,
    ].join('\n\n'),
  };
}

export function mailCambio(d: DatosAviso, quienSeFue: string): Mail {
  const m = mailSorteo(d);
  const aviso = `${quienSeFue} no va a participar, así que te toca otra persona.`;
  return {
    subject: `Cambio en tu amigo invisible de ${d.evento}`,
    text: `${aviso}\n\n${m.text}`,
    html: m.html.replace('<p style="margin:0 0 16px">', `<p style="margin:0 0 16px">${escapar(aviso)}<br><br>`),
  };
}

export function embedRevelacion(evento: string, quienTeRegalo: string, aQuienRegalaste: string | null): Embed {
  return {
    author: { name: recortar(evento, 256) },
    title: recortar(`Tu amigo invisible era ${quienTeRegalo}`, 256),
    description: aQuienRegalaste
      ? `Y vos le regalaste a ${aQuienRegalaste}. ¡Gracias por jugar!`
      : '¡Gracias por jugar!',
    color: NARANJA,
  };
}

export function mailRevelacion(evento: string, quienTeRegalo: string): Mail {
  const text = `En «${evento}», tu amigo invisible era ${quienTeRegalo}. ¡Gracias por jugar!`;
  return { subject: `Revelación de ${evento}`, text, html: `<p>${escapar(text)}</p>` };
}

/** Resumen para el canal del server: la ronda completa, en orden. */
export function embedResumenRevelacion(evento: string, ronda: { de: string; para: string }[]): Embed {
  const lineas = ronda.map((r) => `**${r.de}** → ${r.para}`);
  return {
    title: recortar(`Revelación: ${evento}`, 256),
    description: recortar(['Así quedó la ronda del amigo invisible:', '', ...lineas].join('\n'), 4000),
    color: NARANJA,
  };
}

// ---------- Entregas ----------

/** Link que abre Steam con la key ya cargada para activarla. */
export function linkActivarSteam(key: string): string {
  return `https://store.steampowered.com/account/registerkey?key=${encodeURIComponent(key.trim())}`;
}

export function embedRegaloVirtual(
  evento: string,
  tipo: 'steam' | 'codigo' | 'link' | 'otro',
  contenido: string,
  mensaje: string | null,
  conArchivo: boolean,
): Embed {
  const fields: NonNullable<Embed['fields']> = [];
  let description: string;
  // Las keys y códigos van tapados (spoiler) para que no se vean de reojo en pantalla.
  const tapado = `||\`${recortar(contenido.replace(/`/g, "'"), 990)}\`||`;

  switch (tipo) {
    case 'steam':
      description =
        'Es un juego de Steam. Activalo desde Steam en **Juegos → Activar un producto en Steam**, o con el link de abajo.';
      fields.push({ name: 'Key', value: tapado }, { name: 'Activar', value: linkActivarSteam(contenido) });
      break;
    case 'codigo':
      description = 'Es un código: tocá el recuadro para verlo.';
      fields.push({ name: 'Código', value: tapado });
      break;
    case 'link':
      description = 'Es un link:';
      fields.push({ name: 'Link', value: recortar(contenido, 1024) });
      break;
    default:
      description = recortar(contenido, 4000);
  }
  if (conArchivo) fields.push({ name: 'Archivo', value: 'Va adjunto a este mensaje.' });
  if (mensaje) fields.push({ name: 'Unas palabras', value: recortar(mensaje, 1024) });

  return {
    author: { name: recortar(evento, 256) },
    title: 'Tu amigo invisible te dejó un regalo',
    description,
    color: NARANJA,
    fields,
    footer: { text: 'Si algo no anda, avisale con /responder. Cuando lo tengas, confirmalo con /recibido.' },
  };
}

export function embedEnCamino(evento: string, seguimiento: string | null, mensaje: string | null): Embed {
  const fields: NonNullable<Embed['fields']> = [];
  if (seguimiento) fields.push({ name: 'Seguimiento', value: recortar(seguimiento, 1024) });
  if (mensaje) fields.push({ name: 'Unas palabras', value: recortar(mensaje, 1024) });
  return {
    author: { name: recortar(evento, 256) },
    title: 'Tu regalo está en camino',
    description: 'Tu amigo invisible ya lo despachó. Cuando te llegue, confirmalo con /recibido.',
    color: NARANJA,
    fields,
  };
}

export function embedRecibido(evento: string, quien: string, mensaje: string | null): Embed {
  return {
    author: { name: recortar(evento, 256) },
    title: recortar(`${quien} recibió tu regalo`, 256),
    description: mensaje ? recortar(mensaje, 4000) : 'Ya lo tiene. Misión cumplida.',
    color: NARANJA,
  };
}

// ---------- Mail ----------

export type Mail = { subject: string; text: string; html: string };

const escapar = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** El asunto no dice a quién le tocó: los mails quedan en registros de terceros. */
export function mailSorteo(d: DatosAviso): Mail {
  const rango = textoPresupuesto(d.budgetMin, d.budgetMax);
  const lineas: [string, string | null][] = [
    ['Presupuesto', rango],
    ['Lista de deseos', d.wishlist],
    ['Talles', d.sizes],
    ['Observaciones', d.notes],
    ['Dirección para el envío', d.address],
    ['Fecha de entrega', fecha(d.entrega)],
    ['Revelación', fecha(d.revelacion)],
  ];
  const presentes = lineas.filter((l): l is [string, string] => !!l[1]);

  const text = [
    `¡Hola, ${d.quienRegala}!`,
    '',
    `En el amigo invisible «${d.evento}» te tocó regalarle a:`,
    '',
    `    ${d.aQuien}`,
    '',
    ...presentes.map(([k, v]) => `${k}: ${v}`),
    '',
    'Esto lo sabés solo vos. Guardá este mail y no se lo reenvíes a nadie.',
    '— Furendo Invisible',
  ].join('\n');

  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#141519;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#f4eee6">
<div style="max-width:520px;margin:0 auto;background:#1e1f25;border-radius:18px;overflow:hidden">
  <div style="height:72px;background:#f26b1d;background:linear-gradient(180deg,#e8611a,#ffc071)"></div>
  <div style="padding:24px 28px 28px">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#a9a6b0">${escapar(d.evento)}</p>
    <p style="margin:0 0 16px">¡Hola, ${escapar(d.quienRegala)}! Te tocó regalarle a:</p>
    <div style="background:#fff1df;color:#141519;border-radius:14px;padding:20px;margin:0 0 20px">
      <p style="margin:0;font-size:28px;font-weight:800;letter-spacing:-.02em">${escapar(d.aQuien)}</p>
    </div>
    ${presentes
      .map(
        ([k, v]) =>
          `<p style="margin:0 0 12px"><span style="display:block;font-size:12px;color:#a9a6b0">${escapar(k)}</span>${escapar(v).replace(/\n/g, '<br>')}</p>`,
      )
      .join('\n    ')}
    <p style="margin:20px 0 0;font-size:13px;color:#a9a6b0">Esto lo sabés solo vos. Guardá este mail y no se lo reenvíes a nadie.</p>
  </div>
</div></body></html>`;

  return { subject: `Tu amigo invisible de ${d.evento}`, text, html };
}

/** Mensaje del bot reenviado por mail, para quien no tiene Discord. */
export function mailReenvio(evento: string, titulo: string, texto: string, pie: string): Mail {
  const plano = `${titulo}\n\n${texto}\n\n${pie}\n— Furendo Invisible`;
  return {
    subject: `${evento}: ${titulo}`,
    text: plano,
    html: `<p><b>${escapar(titulo)}</b></p><p>${escapar(texto).replace(/\n/g, '<br>')}</p><p style="color:#777">${escapar(pie)}</p>`,
  };
}

export function mailPrueba(nombre: string): Mail {
  const text = `¡Hola, ${nombre}!\n\nEste es un mail de prueba de Furendo Invisible. Cuando se haga el sorteo, por acá te va a llegar a quién le regalás.`;
  return {
    subject: 'Prueba de Furendo Invisible',
    text,
    html: `<p>${escapar(text).replace(/\n/g, '<br>')}</p>`,
  };
}
