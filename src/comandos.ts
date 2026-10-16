// Definición de los comandos del bot. La usan el registro (scripts/registrar-comandos.ts)
// y el manejador de interacciones, para que los nombres no se desincronicen.

// Dónde se puede usar cada comando: 0 = en un server, 1 = en el privado con el bot.
const SERVER = 0;
const PRIVADO_CON_BOT = 1;
const INSTALADO_EN_SERVER = 0;
const SUBCOMANDO = 1;
const TEXTO = 3;
const ADJUNTO = 11;

/** Largo máximo de la lista de deseos: lo que entra en un campo de un mensaje de Discord. */
export const MAX_DESEOS = 1000;

const BOOLEANO = 5;
const TALLES_ROPA = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'].map((t) => ({ name: t, value: t }));

/** Cada prenda con la etiqueta que se muestra. El orden es el de la lista que ve quien regala. */
export const PRENDAS = {
  remera: 'Remera',
  buzo: 'Buzo / campera',
  pantalon: 'Pantalón',
  zapatillas: 'Zapatillas',
  otro: 'Otro',
} as const;
export type Prenda = keyof typeof PRENDAS;

export const TIPOS_REGALO = {
  steam: 'Key de Steam',
  codigo: 'Código o gift card',
  link: 'Link',
  otro: 'Otra cosa (texto o archivo)',
} as const;
export type TipoRegalo = keyof typeof TIPOS_REGALO;

export const COMANDOS = [
  {
    name: 'unirme',
    description: 'Vincula tu cuenta de Discord con el amigo invisible',
    contexts: [SERVER],
    integration_types: [INSTALADO_EN_SERVER],
    options: [
      {
        type: TEXTO,
        name: 'mail',
        description: 'Si no te encuentra por usuario: el mail que pusiste en el formulario',
        max_length: 200,
      },
    ],
  },
  {
    name: 'mi-amigo',
    description: 'Te recuerda a quién le regalás',
    contexts: [SERVER, PRIVADO_CON_BOT],
    integration_types: [INSTALADO_EN_SERVER],
  },
  {
    name: 'preguntar',
    description: 'Le manda una pregunta a tu amigo invisible sin decir quién sos',
    contexts: [SERVER, PRIVADO_CON_BOT],
    integration_types: [INSTALADO_EN_SERVER],
    options: [
      { type: TEXTO, name: 'mensaje', description: 'Lo que le querés preguntar', required: true, max_length: 1500 },
    ],
  },
  {
    name: 'responder',
    description: 'Le contesta a quien te regala, sin saber quién es',
    contexts: [SERVER, PRIVADO_CON_BOT],
    integration_types: [INSTALADO_EN_SERVER],
    options: [{ type: TEXTO, name: 'mensaje', description: 'Tu respuesta', required: true, max_length: 1500 }],
  },
  {
    name: 'direccion',
    description: 'La dirección para mandarle el regalo a tu amigo invisible',
    contexts: [SERVER, PRIVADO_CON_BOT],
    integration_types: [INSTALADO_EN_SERVER],
  },
  {
    name: 'deseos',
    description: 'Tu lista de deseos: la ve quien te regala',
    contexts: [SERVER, PRIVADO_CON_BOT],
    integration_types: [INSTALADO_EN_SERVER],
    options: [
      {
        type: SUBCOMANDO,
        name: 'agregar',
        description: 'Suma algo a tu lista de deseos',
        options: [
          { type: TEXTO, name: 'texto', description: 'Qué te gustaría que te regalen', required: true, max_length: 300 },
        ],
      },
      { type: SUBCOMANDO, name: 'ver', description: 'Muestra tu lista de deseos' },
      { type: SUBCOMANDO, name: 'borrar', description: 'Vacía tu lista para empezar de nuevo' },
    ],
  },
  {
    name: 'talles',
    description: 'Tus talles, por si te regalan ropa. Sin opciones, te muestra los que cargaste',
    contexts: [SERVER, PRIVADO_CON_BOT],
    integration_types: [INSTALADO_EN_SERVER],
    options: [
      { type: TEXTO, name: 'remera', description: 'Talle de remera', choices: TALLES_ROPA },
      { type: TEXTO, name: 'buzo', description: 'Talle de buzo o campera', choices: TALLES_ROPA },
      { type: TEXTO, name: 'pantalon', description: 'Talle de pantalón (ej. 42, M)', max_length: 20 },
      { type: TEXTO, name: 'zapatillas', description: 'Número de zapatillas (ej. 41, 42.5)', max_length: 20 },
      { type: TEXTO, name: 'otro', description: 'Algo más: gorra, anillo, calza… (ej. "Gorra: 58")', max_length: 100 },
      { type: BOOLEANO, name: 'borrar', description: 'Borra todos tus talles para cargarlos de nuevo' },
    ],
  },
  {
    name: 'entregar',
    description: 'Le pasa un regalo virtual a tu amigo invisible sin decir quién sos',
    contexts: [PRIVADO_CON_BOT],
    integration_types: [INSTALADO_EN_SERVER],
    options: [
      {
        type: TEXTO,
        name: 'tipo',
        description: 'Qué le regalás',
        required: true,
        choices: Object.entries(TIPOS_REGALO).map(([value, name]) => ({ name, value })),
      },
      {
        type: TEXTO,
        name: 'contenido',
        description: 'La key, el código, el link o lo que le quieras pasar',
        required: true,
        max_length: 1000,
      },
      { type: TEXTO, name: 'mensaje', description: 'Unas palabras para acompañar el regalo', max_length: 1000 },
      { type: ADJUNTO, name: 'archivo', description: 'Un archivo: una entrada, un voucher, un dibujo…' },
    ],
  },
  {
    name: 'enviado',
    description: 'Avisa que despachaste el regalo físico',
    contexts: [SERVER, PRIVADO_CON_BOT],
    integration_types: [INSTALADO_EN_SERVER],
    options: [
      {
        type: TEXTO,
        name: 'seguimiento',
        description: 'Código de seguimiento (ojo: en algunos correos se ve quién envía)',
        max_length: 200,
      },
      { type: TEXTO, name: 'mensaje', description: 'Algo que le quieras decir', max_length: 1000 },
    ],
  },
  {
    name: 'recibido',
    description: 'Confirma que te llegó el regalo',
    contexts: [SERVER, PRIVADO_CON_BOT],
    integration_types: [INSTALADO_EN_SERVER],
    options: [{ type: TEXTO, name: 'mensaje', description: 'Un agradecimiento para quien te regaló', max_length: 1000 }],
  },
  {
    name: 'ayuda',
    description: 'Cómo funciona el amigo invisible',
    contexts: [SERVER, PRIVADO_CON_BOT],
    integration_types: [INSTALADO_EN_SERVER],
  },
] as const;

export type NombreComando = (typeof COMANDOS)[number]['name'];
