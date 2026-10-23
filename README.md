# Furendo Invisible

Sorteo de amigo invisible para un grupo de amigos, con un bot de Discord que hace de puente anónimo entre cada persona y su amigo invisible. Nadie, ni siquiera quien organiza, ve quién le regala a quién.

Corre en [Cloudflare Workers](https://developers.cloudflare.com/workers/) con una base [D1](https://developers.cloudflare.com/d1/). Entra en el plan gratuito.

## Qué hace hoy

- Panel del organizador protegido con contraseña.
- Eventos con presupuesto, fecha de entrega y de revelación.
- Participantes cargados a mano o importados desde las respuestas de un Google Form.
- Directorio de personas que se reutiliza entre eventos.
- Vinculación automática de cada participante con su cuenta del server de Discord.
- Sorteo en una sola ronda (A → B → C → … → A): nadie se toca a sí mismo y no quedan parejas cerradas.
- Aviso a cada uno por mensaje privado de Discord, con mail de respaldo, y reintento de los que fallan.

- Comandos del bot para hablar con tu amigo invisible sin revelar quién sos.
- Entregas: regalos virtuales anónimos por el bot (keys de Steam, códigos, links o archivos) y seguimiento de los físicos.
- Bajas después del sorteo con el reacomodo mínimo: quien le regalaba a esa persona pasa a regalarle a quien ella tenía, y se le avisa del cambio.
- Revelación automática a las 00 (hora argentina) del día elegido, o a mano desde el panel: a cada uno le llega quién era su amigo invisible y, si configurás un canal, se publica la ronda completa en el server.

## La revelación

Un cron corre cada hora. Cuando llega la fecha de revelación de un evento sorteado, lo pasa a revelado y va mandando los avisos de a tandas. Si querés la revelación en Nochebuena a la medianoche, poné el **25/12** como fecha.

Para publicar la ronda en un canal, cargá `DISCORD_REVEAL_CHANNEL_ID` con el id del canal (clic derecho en el canal → Copiar ID) y asegurate de que el bot pueda escribir ahí.

Después de la revelación, el panel muestra quién le regaló a quién y `/mi-amigo` también dice quién te regaló a vos. Cuando terminás, **Cerrar evento** lo archiva y el bot deja de responder por él.

## Comandos del bot

| Comando | Qué hace |
|---|---|
| `/unirme` | Vincula tu cuenta de Discord con tu ficha (se usa en el server). Si no te encuentra por usuario, `/unirme mail:` con el mail del formulario deja un pedido que el organizador confirma desde el panel. |
| `/mi-amigo` | Te recuerda a quién le regalás, su lista de deseos y el presupuesto. |
| `/talles` | Tus talles de remera, buzo, pantalón, zapatillas u otro, por si te regalan ropa. Sin opciones muestra los cargados; `borrar` los vacía. Si los cambiás después del sorteo, a quien te regala le llega un aviso. |
| `/deseos` | Tu lista de deseos: `agregar`, `ver` o `borrar`. Funciona antes y después del sorteo; si la cambiás después, a quien te regala le llega un aviso. |
| `/preguntar` | Le manda una pregunta a tu amigo invisible sin decir quién sos. |
| `/responder` | Le contesta a quien te regala. |
| `/direccion` | La dirección para mandarle el regalo. |
| `/entregar` | Le pasa un regalo virtual a tu amigo invisible: una key de Steam (con link para activarla), un código, un link o un archivo de hasta 10 MB. Solo por privado con el bot. |
| `/enviado` | Avisa que despachaste el regalo físico, con código de seguimiento opcional. |
| `/recibido` | Confirma que te llegó tu regalo y le avisa a quien te lo mandó. |
| `/ayuda` | Cómo funciona todo. |

### Tono neutro

Lo que sale de quien regala (`/preguntar` y las palabras que acompañan `/entregar` y `/enviado`) se reescribe por defecto en tono neutro con [Workers AI](https://developers.cloudflare.com/workers-ai/), para que la forma de escribir no delate quién es. Antes de mandarlo, el bot muestra cómo va a quedar con dos botones, **Enviar** y **Cancelar**: nada sale sin confirmación. Con `tono: original` el mensaje va tal cual.

Mientras se espera la confirmación, el comando queda guardado (hasta 30 minutos) en `pending_messages`; se borra al tocar un botón o lo limpia el cron. El modelo por defecto es Mistral Small 3.1 y se puede cambiar con la variable `NEUTRAL_MODEL`.

Si alguien usa un comando en un canal del server, la respuesta es efímera: la ve solo esa persona. En el privado con el bot, el comando y la respuesta quedan en el historial. Los mensajes y los regalos virtuales no se guardan en ningún lado: el bot los reenvía y listo. Del regalo solo queda anotado su estado (en camino, entregado o recibido), que el panel muestra sin decir quién se lo mandó a quién.

**Sobre las keys de Steam:** comprá en tiendas oficiales (Humble, Fanatical, Green Man Gaming, Nuuvem…), fijate que la key sirva para Argentina y evitá los mercados grises, donde a veces se revocan.

Para activarlos, después de publicar:

```bash
npm run comandos
```

y en el [Developer Portal](https://discord.com/developers/applications), en **General Information → Interactions Endpoint URL**, poné `https://<tu-app>.workers.dev/discord/interacciones`. La clave pública de tu aplicación va en `DISCORD_PUBLIC_KEY`, en `wrangler.jsonc`.

## Configurar el bot de Discord

1. Entrá al [Developer Portal](https://discord.com/developers/applications), creá una aplicación y, en **Bot**, generá el token.
2. En **OAuth2 → URL Generator** tildá `bot`, generá el link y usalo para sumar el bot a tu server.
3. Copiá el id del server (modo desarrollador → clic derecho en el server → Copiar ID).
4. Cargá `DISCORD_BOT_TOKEN` y `DISCORD_GUILD_ID` en `.dev.vars` (o con `wrangler secret put` en producción).

El bot no necesita intents privilegiados: busca a cada persona por su usuario y le escribe por privado. Para que le llegue el mensaje, la persona tiene que tener habilitados los mensajes directos de miembros del server (viene así por defecto).

## Mail de respaldo

Para quien no tiene Discord, el aviso sale por mail con [Brevo](https://www.brevo.com/) (plan gratis, 300 mails por día). Cargá `BREVO_API_KEY` y `MAIL_FROM` con un remitente verificado. Sin un dominio propio autenticado, es posible que el mail llegue a spam: conviene avisarle a esa persona que lo busque ahí.

El asunto del mail no dice a quién le tocó, porque los mails quedan en los registros del servicio de envío.

## Probarlo en tu compu

Necesitás [Node.js](https://nodejs.org/) 22 o más nuevo.

```bash
npm install
cp .dev.vars.example .dev.vars   # y poné tu contraseña
npm run db:migrate:local
npm run dev
```

Abrí http://127.0.0.1:8787 y entrá con la contraseña de `.dev.vars`.

## El Google Form

La importación reconoce las columnas por el texto de la pregunta, así que el orden no importa. Estas son las que entiende:

| Pregunta (o algo parecido) | Para qué se usa |
|---|---|
| Nombre | Obligatoria |
| Mail / Correo | Aviso de respaldo si no tiene Discord |
| Usuario de Discord | Para vincular la cuenta con `/unirme` |
| Dirección, Ciudad, Provincia, Código postal | Solo la ve quien le regala, y solo si la pide |
| ¿Qué te gustaría que te regalen? / Lista de deseos | Va en el aviso del sorteo |
| Talles | Ídem |
| Observaciones | Ídem |

Para importar, pegá el link de la hoja de respuestas (compartida como «Cualquier persona con el enlace») o subí el CSV descargado. Si alguien respondió dos veces, queda su última respuesta.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Levanta la app en local |
| `npm test` | Corre los tests |
| `npm run typecheck` | Revisa los tipos |
| `npm run db:migrate:local` | Aplica las migraciones a la base local |
