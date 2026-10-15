# Furendo Invisible

Sorteo de amigo invisible para un grupo de amigos, con un bot de Discord que hace de puente anónimo entre cada persona y su amigo invisible. Nadie, ni siquiera quien organiza, ve quién le regala a quién.

Corre en [Cloudflare Workers](https://developers.cloudflare.com/workers/) con una base [D1](https://developers.cloudflare.com/d1/). Entra en el plan gratuito.

## Qué hace hoy

- Panel del organizador protegido con contraseña.
- Eventos con presupuesto, fecha de entrega y de revelación.
- Participantes cargados a mano o importados desde las respuestas de un Google Form.
- Directorio de personas que se reutiliza entre eventos.

Lo que viene: el sorteo, los avisos por Discord y mail, los mensajes anónimos, las entregas y la revelación.

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
