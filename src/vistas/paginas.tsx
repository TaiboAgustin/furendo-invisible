import type { EstadoAviso, Evento, Participante } from '../tipos.ts';
import type { EstadoEntrega } from '../interacciones.ts';
import type { EstadoRevelacion, PedidoVinculo } from '../db.ts';
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

/** Si hay algún canal configurado que llegue a esta persona. */
export function alcanzable(p: Pick<Participante, 'discord_user_id' | 'email'>, config: Config): boolean {
  return (!!p.discord_user_id && config.discord) || (!!p.email && config.mail);
}

function chequeosSorteo(activos: Participante[], config: Config) {
  return {
    suficientes: activos.length >= 3,
    // Bloquean el sorteo: con lo configurado hoy no habría forma de avisarles.
    sinContacto: activos.filter((p) => !alcanzable(p, config)),
    // Tienen usuario de Discord cargado pero todavía no se buscó su cuenta.
    porVincular: activos.filter((p) => p.discord_username && !p.discord_user_id),
    soloMail: activos.filter((p) => !p.discord_user_id && p.email),
  };
}

export type Config = { discord: boolean; mail: boolean; canalRevelacion: boolean };

export function PaginaEvento(props: {
  evento: Evento;
  participantes: Participante[];
  avisos: Map<number, EstadoAviso>;
  entregas: Map<number, EstadoEntrega>;
  revelacion: EstadoRevelacion | null;
  pedidos: PedidoVinculo[];
  config: Config;
  aviso?: Aviso | null;
}) {
  const { evento: e, participantes, avisos, entregas, revelacion, pedidos, config } = props;
  const activos = participantes.filter((p) => p.status === 'activo');
  const rango = presupuesto(e.budget_min, e.budget_max);
  const { sinContacto, porVincular, soloMail, suficientes } = chequeosSorteo(activos, config);
  const editable = e.status === 'borrador';
  const revelado = !!revelacion;
  // Sellados entre el sorteo y la revelación; después se vuelven a abrir.
  const sorteado = !editable && !revelado;
  const leRegaloA = new Map(revelacion?.ronda.map((r) => [r.giver, r.para]));
  const listo = suficientes && sinContacto.length === 0;

  const estados = [...avisos.values()];
  const enviados = estados.filter((a) => a.notified_at).length;
  const fallidos = estados.filter((a) => !a.notified_at && a.notify_error).length;
  const pendientes = estados.length - enviados - fallidos;

  const estadosRegalo = [...entregas.values()];
  const recibidos = estadosRegalo.filter((s) => s === 'recibido').length;
  const enCamino = estadosRegalo.filter((s) => s === 'en_camino').length;
  const virtuales = estadosRegalo.filter((s) => s === 'entregado').length;

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
                  <a
                    class={sorteado ? 'sobre sobre--cerrado' : 'sobre'}
                    href={`/eventos/${e.id}/participantes/${p.participant_id}`}
                  >
                    {sorteado && (
                      <span class="sello" aria-hidden="true">
                        F
                      </span>
                    )}
                    <span class="sobre-nombre">{p.name}</span>
                    <span class="sobre-discord">{p.discord_username ? `@${p.discord_username}` : p.email ?? ''}</span>
                    {revelado ? (
                      <span class="sobre-estado">Le regaló a {leRegaloA.get(p.participant_id) ?? '—'}</span>
                    ) : sorteado ? (
                      <EstadoAvisoSobre a={avisos.get(p.participant_id)} />
                    ) : (
                      <EstadoContacto p={p} />
                    )}
                    {!editable && <EstadoRegaloSobre estado={entregas.get(p.participant_id)} />}
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
            {pedidos.length > 0 && !revelado && (
              <div class="tarjeta tarjeta--atencion">
                <h3>Pedidos para vincular</h3>
                <p class="texto-2">
                  Usaron <code>/unirme mail:</code>. Confirmá solo si reconocés la cuenta de Discord.
                </p>
                <ul class="pedidos">
                  {pedidos.map((p) => (
                    <li>
                      <span>
                        <b>{p.name}</b> <span class="mono">({p.email})</span>
                        <br />
                        quiere vincular <span class="mono">@{p.discord_pending_username}</span>
                      </span>
                      <span class="pedido-acciones">
                        <form method="post" action={`/eventos/${e.id}/vinculos/${p.person_id}/confirmar`}>
                          <button class="boton" type="submit">
                            Confirmar
                          </button>
                        </form>
                        <form method="post" action={`/eventos/${e.id}/vinculos/${p.person_id}/rechazar`}>
                          <button class="boton-texto boton-texto--peligro" type="submit">
                            Rechazar
                          </button>
                        </form>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {editable && (
              <div class="tarjeta">
                <h3>Antes de sortear</h3>
                <ul class="chequeos">
                  <li class={suficientes ? 'ok' : 'falta'}>
                    {suficientes ? `${activos.length} participantes` : 'Hacen falta al menos 3 participantes'}
                  </li>
                  {activos.length > 0 && (
                    <li class={sinContacto.length === 0 ? 'ok' : 'falta'}>
                      {sinContacto.length === 0
                        ? 'A todos les puede llegar el aviso'
                        : `Sin forma de avisarles: ${sinContacto.map((p) => p.name).join(', ')}`}
                    </li>
                  )}
                  {soloMail.length > 0 && (
                    <li class="aviso-suave">
                      {soloMail.length === 1 ? '1 persona recibe' : `${soloMail.length} personas reciben`} el aviso
                      por mail.
                    </li>
                  )}
                  {!config.discord && <li class="falta">El bot de Discord no está configurado.</li>}
                  {!config.mail && soloMail.length > 0 && <li class="falta">El mail no está configurado.</li>}
                </ul>

                {porVincular.length > 0 && config.discord && (
                  <form method="post" action={`/eventos/${e.id}/vincular`}>
                    <button class="boton boton--ancho" type="submit">
                      Buscar {porVincular.length === 1 ? '1 cuenta' : `${porVincular.length} cuentas`} en Discord
                    </button>
                  </form>
                )}

                {listo && (
                  <form
                    method="post"
                    action={`/eventos/${e.id}/sortear`}
                    onsubmit="return confirm('¿Sortear ahora? Los sobres se sellan y no se puede deshacer.')"
                  >
                    <button class="boton boton--principal boton--sortear" type="submit">
                      Sortear
                    </button>
                  </form>
                )}
              </div>
            )}

            {sorteado && (
              <div class="tarjeta">
                <h3>Sorteo hecho</h3>
                <p class="texto-2">Nadie puede ver quién le regala a quién, ni siquiera desde acá.</p>
                <div
                  class="progreso"
                  role="progressbar"
                  aria-label="Avisos enviados"
                  aria-valuemin={0}
                  aria-valuemax={estados.length}
                  aria-valuenow={enviados}
                >
                  <i style={`width:${estados.length ? (enviados / estados.length) * 100 : 0}%`}></i>
                </div>
                <div class="kv">
                  <span>Avisos enviados</span>
                  <span>
                    {enviados} de {estados.length}
                  </span>
                </div>
                {fallidos > 0 && (
                  <div class="kv kv--error">
                    <span>Fallaron</span>
                    <span>{fallidos}</span>
                  </div>
                )}
                {pendientes > 0 && (
                  <p class="enviando" id="enviando-avisos" data-url={`/eventos/${e.id}/avisar`} aria-live="polite">
                    Enviando avisos…
                  </p>
                )}
                {fallidos > 0 && pendientes === 0 && (
                  <form method="post" action={`/eventos/${e.id}/avisos/reintentar`}>
                    <p class="texto-2 nota">Tocá cada sobre en rojo para ver qué pasó y corregir el contacto.</p>
                    <button class="boton boton--ancho" type="submit">
                      Reintentar los que fallaron
                    </button>
                  </form>
                )}
              </div>
            )}

            {sorteado && (
              <div class="tarjeta">
                <h3>Revelación</h3>
                <p class="texto-2">
                  {e.reveal_date
                    ? `Se revela sola el ${fechaCorta(e.reveal_date)} a las 00 (hora argentina): a cada uno le llega quién era su amigo invisible.`
                    : 'Cargá la fecha de revelación en Datos del evento, o revelá cuando quieras.'}
                  {config.canalRevelacion && ' La ronda completa se publica en el canal del server.'}
                </p>
                <form
                  method="post"
                  action={`/eventos/${e.id}/revelar`}
                  onsubmit="return confirm('¿Revelar ahora? A cada uno le llega quién era su amigo invisible y los sobres se abren.')"
                >
                  <button class="boton boton--ancho" type="submit">
                    Revelar ahora
                  </button>
                </form>
              </div>
            )}

            {revelacion && (
              <div class="tarjeta">
                <h3>{e.status === 'cerrado' ? 'Evento cerrado' : 'Revelado'}</h3>
                <div class="kv">
                  <span>Avisos de revelación</span>
                  <span>
                    {revelacion.avisados} de {revelacion.ronda.length}
                  </span>
                </div>
                {revelacion.fallidos > 0 && (
                  <div class="kv kv--error">
                    <span>Fallaron</span>
                    <span>{revelacion.fallidos}</span>
                  </div>
                )}
                {revelacion.pendientes > 0 && e.status === 'revelado' && (
                  <p
                    class="enviando"
                    id="enviando-avisos"
                    data-url={`/eventos/${e.id}/avisar-revelacion`}
                    aria-live="polite"
                  >
                    Enviando la revelación…
                  </p>
                )}
                {revelacion.fallidos > 0 && revelacion.pendientes === 0 && (
                  <form method="post" action={`/eventos/${e.id}/revelacion/reintentar`}>
                    <button class="boton boton--ancho" type="submit">
                      Reintentar los que fallaron
                    </button>
                  </form>
                )}
                <h3 class="subtitulo-ronda">La ronda</h3>
                <ol class="ronda">
                  {revelacion.ronda.map((r) => (
                    <li>
                      <b>{r.de}</b> <span aria-hidden="true">→</span>
                      <span class="sr-only">le regaló a</span> {r.para}
                    </li>
                  ))}
                </ol>
                {e.status === 'revelado' && revelacion.pendientes === 0 && (
                  <form
                    method="post"
                    action={`/eventos/${e.id}/cerrar`}
                    onsubmit="return confirm('¿Cerrar el evento? El bot deja de responder por este evento.')"
                  >
                    <button class="boton boton--fantasma boton--ancho" type="submit">
                      Cerrar evento
                    </button>
                  </form>
                )}
              </div>
            )}

            {!editable && (
              <div class="tarjeta">
                <h3>Regalos</h3>
                <p class="texto-2">Cuántos van llegando, sin decir de quién.</p>
                <div
                  class="progreso"
                  role="progressbar"
                  aria-label="Regalos recibidos"
                  aria-valuemin={0}
                  aria-valuemax={activos.length}
                  aria-valuenow={recibidos}
                >
                  <i style={`width:${activos.length ? (recibidos / activos.length) * 100 : 0}%`}></i>
                </div>
                <div class="kv">
                  <span>Recibidos</span>
                  <span>
                    {recibidos} de {activos.length}
                  </span>
                </div>
                <div class="kv">
                  <span>En camino</span>
                  <span>{enCamino}</span>
                </div>
                <div class="kv">
                  <span>Virtuales entregados</span>
                  <span>{virtuales}</span>
                </div>
              </div>
            )}

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
      {((sorteado && pendientes > 0) || (revelacion && revelacion.pendientes > 0 && e.status === 'revelado')) && (
        <script src="/avisos.js" defer></script>
      )}
    </Layout>
  );
}

function EstadoContacto({ p }: { p: Participante }) {
  if (p.discord_user_id) return <span class="sobre-estado">Discord vinculado</span>;
  if (p.discord_username && p.email) return <span class="sobre-estado sobre-estado--pendiente">Falta vincular</span>;
  if (p.discord_username) return <span class="sobre-estado sobre-estado--falta">Falta vincular</span>;
  if (p.email) return <span class="sobre-estado sobre-estado--pendiente">Solo mail</span>;
  return <span class="sobre-estado sobre-estado--falta">Sin contacto</span>;
}

/** El regalo que le llega a esta persona. No dice de quién viene. */
function EstadoRegaloSobre({ estado }: { estado: EstadoEntrega | undefined }) {
  if (estado === 'recibido') return <span class="sobre-regalo sobre-regalo--ok">Recibió su regalo</span>;
  if (estado === 'entregado') return <span class="sobre-regalo">Le llegó un regalo virtual</span>;
  if (estado === 'en_camino') return <span class="sobre-regalo">Su regalo está en camino</span>;
  return null;
}

function EstadoAvisoSobre({ a }: { a: EstadoAviso | undefined }) {
  if (a?.notified_at) {
    return <span class="sobre-estado">Aviso por {a.notify_channel === 'discord' ? 'Discord' : 'mail'}</span>;
  }
  if (a?.notify_error) return <span class="sobre-estado sobre-estado--falta">El aviso falló</span>;
  return <span class="sobre-estado sobre-estado--pendiente">Aviso pendiente</span>;
}

// ---------- Participante ----------

export function PaginaParticipante(props: {
  evento: Evento;
  participante: Participante | null;
  estadoAviso?: EstadoAviso;
  error?: string;
  aviso?: Aviso | null;
}) {
  const { evento: e, participante: p, estadoAviso: a } = props;
  const nuevo = !p;
  const accion = nuevo ? `/eventos/${e.id}/participantes` : `/eventos/${e.id}/participantes/${p.participant_id}`;
  return (
    <Layout titulo={nuevo ? 'Agregar participante' : p.name} seccion="eventos" aviso={props.aviso}>
      <a class="volver" href={`/eventos/${e.id}`}>
        ← {e.name}
      </a>
      <div class="hoja">
        <div class="hoja-solapa" aria-hidden="true"></div>
        <h1 class="titulo-display titulo-display--chico">{nuevo ? 'Agregar participante' : p.name}</h1>

        {!nuevo && (
          <div class="estado-contacto">
            <p>
              <span class="meta">Discord</span>
              {p.discord_user_id
                ? 'Vinculado. El bot le puede escribir.'
                : p.discord_username
                  ? 'Todavía no se buscó su cuenta en el server.'
                  : 'Sin usuario cargado.'}
            </p>
            {a && (
              <p>
                <span class="meta">Aviso del sorteo</span>
                {a.notified_at
                  ? `Enviado por ${a.notify_channel === 'discord' ? 'Discord' : 'mail'}.`
                  : a.notify_error
                    ? 'Falló.'
                    : 'Pendiente.'}
                {a.notify_error && <span class="detalle-error">{a.notify_error}</span>}
              </p>
            )}
            {(p.discord_user_id || p.email) && (
              <form method="post" action={`/eventos/${e.id}/participantes/${p.participant_id}/probar`}>
                <button class="boton boton--fantasma" type="submit">
                  Mandarle un mensaje de prueba
                </button>
              </form>
            )}
          </div>
        )}
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
        {!nuevo && e.status === 'sorteado' && p.status === 'activo' && (
          <form
            method="post"
            action={`/eventos/${e.id}/participantes/${p.participant_id}/baja`}
            onsubmit="return confirm('¿Dar de baja? Quien le regalaba pasa a regalarle a otra persona y le avisamos. No se puede deshacer.')"
          >
            <button class="boton-texto boton-texto--peligro" type="submit">
              Dar de baja del evento
            </button>
            <small class="ayuda-baja">
              Se reacomoda solo lo mínimo: quien le regalaba pasa a regalarle a quien tenía esta persona.
            </small>
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
