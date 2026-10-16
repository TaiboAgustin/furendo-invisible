// Reescribe en tono neutro los mensajes que salen de quien regala, para que la forma
// de escribir (muletillas, emojis, errores) no delate quién es. Usa Workers AI.

// Elegido comparando con Llama 3.3 70B y Gemma 4 26B sobre mensajes típicos del grupo:
// fue el que mejor sacó modismos sin cambiar el sentido. Se puede cambiar con NEUTRAL_MODEL.
export const MODELO_POR_DEFECTO = '@cf/mistralai/mistral-small-3.1-24b-instruct';

const INSTRUCCIONES = `Reescribís mensajes para un amigo invisible de un grupo de amigos argentinos.
Tu objetivo es que nadie pueda adivinar quién escribió el mensaje por su forma de escribir.

Reglas:
- Mantené exactamente el mismo significado, las mismas preguntas y los mismos datos. No agregues ni saques información.
- Conservá tal cual los nombres de juegos, marcas, consolas, plataformas y productos (Play, PC, Steam, Hollow Knight…). No los traduzcas ni los generalices.
- Escribí en español rioplatense neutro, con voseo ("¿qué preferís?", "¿tenés?", "¿usás?"), claro y amable, sin ser formal.
- Sacá saludos informales (qué onda, hola), emojis, risas (jaja, jsjs), muletillas (che, boludo, posta, re, x las dudas), apodos, insultos en broma, abreviaturas (q, xq, tmb, x) y signos repetidos (??, !!).
- Corregí ortografía, tildes y puntuación. Toda pregunta empieza con ¿ y termina con ?. Nunca termines una pregunta con !.
- No saludes, no te despidas y no firmes. No uses nombres propios de personas.
- Respondé solo con el mensaje reescrito, sin comillas ni explicaciones.

Ejemplos:
Entrada: che q talle de remera usas?? jaja
Salida: ¿Qué talle de remera usás?

Entrada: tenes switch o ps5? xq sino no se q te regalo jsjs
Salida: ¿Tenés Switch o PS5? Si no, no sé qué regalarte.

Entrada: qué onda!! sos más de café o de mate? 😂
Salida: ¿Sos más de café o de mate?

Entrada: espero q te guste muchoo, lo elegi re pensando en vos ❤️
Salida: Espero que te guste mucho, lo elegí pensando en vos.`;

export type Generador = (modelo: string, entrada: unknown) => Promise<unknown>;

export async function neutralizar(texto: string, generar: Generador, modelo = MODELO_POR_DEFECTO): Promise<string> {
  const salida = await generar(modelo, {
    messages: [
      { role: 'system', content: INSTRUCCIONES },
      { role: 'user', content: texto },
    ],
    max_tokens: 600,
    temperature: 0.2,
  });
  const crudo = extraerTexto(salida);
  const limpio = crudo
    .trim()
    .replace(/^["'«“]+|["'»”]+$/g, '')
    .trim();
  // Una respuesta vacía, o mucho más larga que el original, no es una reescritura.
  if (!limpio || limpio.length > texto.length * 3 + 200) throw new Error('La IA no devolvió una versión usable.');
  return limpio;
}

/** Workers AI devuelve { response } en la mayoría de los modelos y el formato de OpenAI en otros. */
function extraerTexto(salida: unknown): string {
  if (typeof salida === 'string') return salida;
  const s = salida as { response?: unknown; choices?: { message?: { content?: unknown } }[] };
  if (typeof s?.response === 'string') return s.response;
  const c = s?.choices?.[0]?.message?.content;
  return typeof c === 'string' ? c : '';
}
