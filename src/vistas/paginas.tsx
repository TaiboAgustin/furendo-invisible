import type { Evento, Participante } from '../tipos.ts';
import type { ResumenEvento, ResumenPersona } from '../db.ts';
import { NOMBRES_CAMPO, type ResultadoImportacion } from '../importar.ts';
import { Campo, Layout, Logo, fechaCorta, presupuesto, type Aviso } from './layout.tsx';

const ESTADOS: Record<Evento['status'], string> = {
  borrador: 'Armando',
  sorteado: 'Sorteado',
  revelado: 'Revelado',
  cerrado: 'Cerrado',
};

// ---------- Login ----------

export function PaginaLogin({ error }: { error?: string }) {
  return (
    <Layout titulo="Entrar" sinNav>
      <section class="login">
        <div class="login-banner" aria-hidden="true"></div>
        <div class="login-cuerpo">
          <Logo grande />
          <h1 class="titulo-display">
            Furendo <em>Invisible</em>
          </h1>
          <p class="texto-2">Panel del organizador.</p>
          <form method="post" action="/entrar" class="pila">
            <Campo etiqueta="Contraseña" nombre="password" tipo="password" requerido />
            {error && (
              <p class="error" role="alert">
                {error}
              </p>
            )}
            <button class="boton boton--principal" type="submit">
              Entrar
            </button>
          </form>
        </div>
      </section>
    </Layout>
  );
}

// ---------- Eventos ----------

export function PaginaEventos({ eventos, aviso }: { eventos: ResumenEvento[]; aviso?: Aviso | null }) {
  return (
    <Layout titulo="Eventos" seccion="eventos" aviso={aviso}>
      <div class="encabezado">
        <div>
          <span class="meta">Amigo invisible</span>
          <h1 class="titulo-display">Eventos</h1>
        </div>
      </div>

      <div class="grilla-eventos">
        {eventos.map((e) => (
          <a class="tarjeta-evento" href={`/eventos/${e.id}`}>
            <span class="tarjeta-evento-banda" aria-hidden="true"></span>
            <span class="meta">{ESTADOS[e.status]}</span>
            <strong>{e.name}</strong>
            <span class="chips">
              <span class="chip">
                {e.participantes} {e.participantes === 1 ? 'furendo' : 'furendos'}
              </span>
              {presupuesto(e.budget_min, e.budget_max) && (
                <span class="chip chip--naranja">{presupuesto(e.budget_min, e.budget_max)}</span>
              )}
            </span>
          </a>
        ))}

        <details class="tarjeta-nuevo" open={eventos.length === 0}>
          <summary>
            <span class="mas" aria-hidden="true">
              +
            </span>
            Nuevo evento
          </summary>
          <form method="post" action="/eventos" class="pila">
            <Campo etiqueta="Nombre" nombre="name" requerido placeholder="Navidad 2026" />
            <div class="fila-campos">
              <Campo etiqueta="Presupuesto mínimo" nombre="budget_min" tipo="number" min={0} placeholder="50000" />
              <Campo etiqueta="Presupuesto máximo" nombre="budget_max" tipo="number" min={0} placeholder="70000" />
            </div>
            <button class="boton boton--principal" type="submit">
              Crear evento
            </button>
          </form>
        </details>
      </div>
    </Layout>
  );
}

// ---------- Evento ----------

function chequeosSorteo(activos: Participante[]) {
  const sinContacto = activos.filter((p) => !p.discord_username && !p.email);
  const sinDiscord = activos.filter((p) => !p.discord_username && p.email);
  return { sinContacto, sinDiscord, suficientes: activos.length >= 3 };
}

export function PaginaEvento(props: { evento: Evento; participantes: Participante[]; aviso?: Aviso | null }) {
  const { evento: e, participantes } = props;
  const activos = participantes.filter((p) => p.status === 'activo');
  const rango = presupuesto(e.budget_min, e.budget_max);
  const { sinContacto, sinDiscord, suficientes } = chequeosSorteo(activos);
  const editable = e.status === 'borrador';

  return (
    <Layout titulo={e.name} seccion="eventos" aviso={props.aviso}>
      <article class="app">
        <div class="banner" aria-hidden="true"></div>
        <div class="app-head">
          <Logo grande />
          <div class="app-title">
            <span class="meta">Amigo invisible · {ESTADOS[e.status]}</span>
            <h1>{e.name}</h1>
            <div class="chips">
              {rango && <span class="chip chip--naranja">{rango}</span>}
              <span class="chip">
                {activos.length} {activos.length === 1 ? 'furendo' : 'furendos'}
              </span>
              {e.deadline && <span class="chip">Entrega {fechaCorta(e.deadline)}</span>}
              {e.reveal_date && <span class="chip">Revelación {fechaCorta(e.reveal_date)}</span>}
            </div>
          </div>
        </div>

        <div class="app-body">
          <section aria-labelledby="titulo-participantes">
            <div class="barra">
              <h2 id="titulo-participantes">Participantes</h2>
              {editable && (
                <a class="boton boton--fantasma" href={`/eventos/${e.id}/importar`}>
                  Importar del formulario
                </a>
              )}
            </div>

            <ul class="sobres">
              {activos.map((p) => (
                <li>
                  <a class="sobre" href={`/eventos/${e.id}/participantes/${p.participant_id}`}>
                    <span class="sobre-nombre">{p.name}</span>
                    <span class="sobre-discord">{p.discord_username ? `@${p.discord_username}` : p.email ?? ''}</span>
                    <EstadoContacto p={p} />
                  </a>
                </li>
              ))}
              {editable && (
                <li>
                  <a class="sobre sobre--nuevo" href={`/eventos/${e.id}/participantes/nuevo`}>
                    <span class="mas" aria-hidden="true">
                      +
                    </span>
                    Agregar a mano
                  </a>
                </li>
              )}
            </ul>
            {activos.length === 0 && (
              <p class="texto-2 vacio">
                Importá las respuestas del Google Form o agregá a cada furendo a mano.
              </p>
            )}
          </section>

          <aside class="lateral">
            <div class="tarjeta">
              <h3>Antes de sortear</h3>
              <ul class="chequeos">
                <li class={suficientes ? 'ok' : 'falta'}>
                  {suficientes ? `${activos.length} participantes` : 'Hacen falta al menos 3 participantes'}
                </li>
                {activos.length > 0 && (
                  <li class={sinContacto.length === 0 ? 'ok' : 'falta'}>
                    {sinContacto.length === 0
                      ? 'Todos tienen Discord o mail'
                      : `Sin Discord ni mail: ${sinContacto.map((p) => p.name).join(', ')}`}
                  </li>
                )}
                {sinDiscord.length > 0 && (
                  <li class="aviso-suave">
                    {sinDiscord.length === 1 ? '1 persona' : `${sinDiscord.length} personas`} sin Discord: les
                    avisamos por mail.
                  </li>
                )}
              </ul>
              <p class="texto-2 nota">El sorteo se habilita en la próxima etapa.</p>
            </div>

            <details class="tarjeta" open={!rango}>
              <summary>
                <h3>Datos del evento</h3>
              </summary>
              <form method="post" action={`/eventos/${e.id}`} class="pila">
                <Campo etiqueta="Nombre" nombre="name" valor={e.name} requerido />
                <div class="fila-campos">
                  <Campo etiqueta="Mínimo" nombre="budget_min" tipo="number" min={0} valor={e.budget_min} />
                  <Campo etiqueta="Máximo" nombre="budget_max" tipo="number" min={0} valor={e.budget_max} />
                </div>
                <Campo etiqueta="Fecha límite de entrega" nombre="deadline" tipo="date" valor={e.deadline} />
                <Campo etiqueta="Fecha de revelación" nombre="reveal_date" tipo="date" valor={e.reveal_date} />
                <Campo
                  etiqueta="Link del Google Sheet"
                  nombre="form_csv_url"
                  tipo="url"
                  valor={e.form_csv_url}
                  ayuda="El de las respuestas del form, compartido como «Cualquier persona con el enlace»."
                />
                <button class="boton" type="submit">
                  Guardar cambios
                </button>
              </form>
            </details>

            {editable && (
              <form
                method="post"
                action={`/eventos/${e.id}/borrar`}
                class="borrar-evento"
                onsubmit="return confirm('¿Borrar el evento y sus participantes? No se puede deshacer.')"
              >
                <button class="boton-texto boton-texto--peligro" type="submit">
                  Borrar evento
                </button>
              </form>
            )}
          </aside>
        </div>
      </article>
    </Layout>
  );
}

function EstadoContacto({ p }: { p: Participante }) {
  if (p.discord_user_id) return <span class="sobre-estado">Discord vinculado</span>;
  if (p.discord_username) return <span class="sobre-estado sobre-estado--pendiente">Falta /unirme</span>;
  if (p.email) return <span class="sobre-estado sobre-estado--pendiente">Solo mail</span>;
  return <span class="sobre-estado sobre-estado--falta">Sin contacto</span>;
}

// ---------- Participante ----------

export function PaginaParticipante(props: {
  evento: Evento;
  participante: Participante | null;
  error?: string;
}) {
  const { evento: e, participante: p } = props;
  const nuevo = !p;
  const accion = nuevo ? `/eventos/${e.id}/participantes` : `/eventos/${e.id}/participantes/${p.participant_id}`;
  return (
    <Layout titulo={nuevo ? 'Agregar participante' : p.name} seccion="eventos">
      <a class="volver" href={`/eventos/${e.id}`}>
        ← {e.name}
      </a>
      <div class="hoja">
        <div class="hoja-solapa" aria-hidden="true"></div>
        <h1 class="titulo-display titulo-display--chico">{nuevo ? 'Agregar participante' : p.name}</h1>
        <form method="post" action={accion} class="pila">
          <fieldset>
            <legend>Contacto</legend>
            <Campo etiqueta="Nombre" nombre="name" valor={p?.name} requerido />
            <div class="fila-campos">
              <Campo etiqueta="Usuario de Discord" nombre="discord_username" valor={p?.discord_username} placeholder="mica.rl" />
              <Campo etiqueta="Mail" nombre="email" tipo="email" valor={p?.email} placeholder="mica@ejemplo.com" />
            </div>
            <Campo
              etiqueta="Dirección"
              nombre="address"
              valor={p?.address}
              placeholder="Av. Siempreviva 742, Lanús, Buenos Aires"
              ayuda="Solo la ve quien le regala, y solo si la pide."
            />
          </fieldset>
          <fieldset>
            <legend>Para este evento</legend>
            <Campo etiqueta="Lista de deseos" nombre="wishlist" valor={p?.wishlist} multilinea />
            <Campo etiqueta="Talles" nombre="sizes" valor={p?.sizes} placeholder="Remera M, zapatillas 42" />
            <Campo etiqueta="Observaciones" nombre="notes" valor={p?.notes} multilinea />
          </fieldset>
          {props.error && (
            <p class="error" role="alert">
              {props.error}
            </p>
          )}
          <div class="acciones">
            <button class="boton boton--principal" type="submit">
              {nuevo ? 'Agregar' : 'Guardar cambios'}
            </button>
            <a class="boton boton--fantasma" href={`/eventos/${e.id}`}>
              Cancelar
            </a>
          </div>
        </form>
        {!nuevo && e.status === 'borrador' && (
          <form
            method="post"
            action={`/eventos/${e.id}/participantes/${p.participant_id}/quitar`}
            onsubmit="return confirm('¿Sacar a esta persona del evento? Sus datos quedan en Personas.')"
          >
            <button class="boton-texto boton-texto--peligro" type="submit">
              Sacar del evento
            </button>
          </form>
        )}
      </div>
    </Layout>
  );
}

// ---------- Importar ----------

export function PaginaImportar(props: {
  evento: Evento;
  vistaPrevia?: ResultadoImportacion & { csv: string; existentes: Set<string> };
  error?: string;
}) {
  const { evento: e, vistaPrevia: v } = props;
  return (
    <Layout titulo="Importar" seccion="eventos">
      <a class="volver" href={`/eventos/${e.id}`}>
        ← {e.name}
      </a>
      <h1 class="titulo-display titulo-display--chico">Importar respuestas</h1>

      {!v && (
        <div class="grilla-importar">
          <form method="post" action={`/eventos/${e.id}/importar/vista-previa`} class="tarjeta pila">
            <h2>Desde el Google Sheet</h2>
            <p class="texto-2">
              En el form, abrí <b>Respuestas → Ver en Hojas de cálculo</b> y compartí la hoja como «Cualquier persona
              con el enlace».
            </p>
            <Campo
              etiqueta="Link de la hoja"
              nombre="url"
              tipo="url"
              valor={e.form_csv_url}
              placeholder="https://docs.google.com/spreadsheets/d/…"
            />
            <button class="boton boton--principal" type="submit">
              Ver vista previa
            </button>
          </form>
          <form
            method="post"
            action={`/eventos/${e.id}/importar/vista-previa`}
            class="tarjeta pila"
            enctype="multipart/form-data"
          >
            <h2>Desde un archivo</h2>
            <p class="texto-2">
              Si preferís no compartir la hoja: <b>Archivo → Descargar → CSV</b> y subilo acá.
            </p>
            <div class="campo">
              <label for="campo-archivo">Archivo CSV</label>
              <input id="campo-archivo" name="archivo" type="file" accept=".csv,text/csv" required />
            </div>
            <button class="boton" type="submit">
              Ver vista previa
            </button>
          </form>
        </div>
      )}

      {props.error && (
        <p class="error" role="alert">
          {props.error}
        </p>
      )}

      {v && (
        <div class="pila">
          <div class="tarjeta">
            <h2>Columnas reconocidas</h2>
            <ul class="columnas">
              {v.columnas.map((c) => (
                <li class={c.campo ? '' : 'ignorada'}>
                  <span>{c.encabezado || '(sin título)'}</span>
                  <span class="meta">{c.campo ? NOMBRES_CAMPO[c.campo] : 'No se usa'}</span>
                </li>
              ))}
            </ul>
          </div>

          <div class="tabla-envoltorio">
            <table class="tabla">
              <caption class="texto-2">
                {v.filas.length} {v.filas.length === 1 ? 'persona' : 'personas'}
                {v.descartadas > 0 && ` · ${v.descartadas} respuestas sin nombre se ignoran`}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col">Discord</th>
                  <th scope="col">Mail</th>
                  <th scope="col">Dirección</th>
                  <th scope="col"></th>
                </tr>
              </thead>
              <tbody>
                {v.filas.map((f) => (
                  <tr>
                    <td>{f.name}</td>
                    <td class="mono">{f.discord_username ?? '—'}</td>
                    <td class="mono">{f.email ?? '—'}</td>
                    <td>{f.address ?? '—'}</td>
                    <td>
                      <span class="chip">
                        {v.existentes.has(f.email ?? `d:${f.discord_username}`) ? 'Se actualiza' : 'Nuevo'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form method="post" action={`/eventos/${e.id}/importar`} class="acciones">
            <input type="hidden" name="csv" value={v.csv} />
            <button class="boton boton--principal" type="submit" disabled={v.filas.length === 0}>
              Importar {v.filas.length} {v.filas.length === 1 ? 'persona' : 'personas'}
            </button>
            <a class="boton boton--fantasma" href={`/eventos/${e.id}/importar`}>
              Elegir otro origen
            </a>
          </form>
        </div>
      )}
    </Layout>
  );
}

// ---------- Personas ----------

export function PaginaPersonas({ personas }: { personas: ResumenPersona[] }) {
  return (
    <Layout titulo="Personas" seccion="personas">
      <div class="encabezado">
        <div>
          <span class="meta">Directorio</span>
          <h1 class="titulo-display">Personas</h1>
        </div>
      </div>
      <p class="texto-2">Todos los que participaron de algún evento. Se editan desde cada evento.</p>
      {personas.length === 0 ? (
        <p class="vacio texto-2">Todavía no hay nadie. Creá un evento e importá las respuestas del form.</p>
      ) : (
        <div class="tabla-envoltorio">
          <table class="tabla">
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Discord</th>
                <th scope="col">Mail</th>
                <th scope="col">Eventos</th>
              </tr>
            </thead>
            <tbody>
              {personas.map((p) => (
                <tr>
                  <td>{p.name}</td>
                  <td class="mono">
                    {p.discord_username ? `@${p.discord_username}` : '—'}
                    {p.discord_user_id && <span class="punto-ok" title="Vinculado"></span>}
                  </td>
                  <td class="mono">{p.email ?? '—'}</td>
                  <td class="mono">{p.eventos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
