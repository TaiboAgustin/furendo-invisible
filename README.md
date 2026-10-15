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

Lo que viene: los mensajes anónimos, las entregas y la revelación.

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
