// Definición de los comandos del bot. La usan el registro (scripts/registrar-comandos.ts)
// y el manejador de interacciones, para que los nombres no se desincronicen.

// Dónde se puede usar cada comando: 0 = en un server, 1 = en el privado con el bot.
const SERVER = 0;
const PRIVADO_CON_BOT = 1;
const INSTALADO_EN_SERVER = 0;
const TEXTO = 3;

export const COMANDOS = [
  {
    name: 'unirme',
    description: 'Vincula tu cuenta de Discord con el amigo invisible',
    contexts: [SERVER],
    integration_types: [INSTALADO_EN_SERVER],
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
    name: 'ayuda',
    description: 'Cómo funciona el amigo invisible',
    contexts: [SERVER, PRIVADO_CON_BOT],
    integration_types: [INSTALADO_EN_SERVER],
  },
] as const;

export type NombreComando = (typeof COMANDOS)[number]['name'];
