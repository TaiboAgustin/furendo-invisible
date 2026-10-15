import type { Child } from 'hono/jsx';

type Seccion = 'eventos' | 'personas' | null;

export function Logo({ grande = false }: { grande?: boolean }) {
  return (
    <span class={grande ? 'logo logo--grande' : 'logo'} aria-hidden="true">
      <span>
        Furendos<sup>®</sup>
      </span>
    </span>
  );
}

export function Layout(props: {
  titulo: string;
  seccion?: Seccion;
  aviso?: Aviso | null;
  sinNav?: boolean;
  children: Child;
}) {
  return (
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`${props.titulo} · Furendo Invisible`}</title>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,800&family=Figtree:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap"
        />
        <link rel="stylesheet" href="/estilos.css" />
      </head>
      <body>
        {!props.sinNav && (
          <header class="topbar">
            <a class="marca" href="/">
              <Logo />
              <span>Furendo Invisible</span>
            </a>
            <nav class="nav" aria-label="Principal">
              <a href="/" aria-current={props.seccion === 'eventos' ? 'page' : undefined}>
                Eventos
              </a>
              <a href="/personas" aria-current={props.seccion === 'personas' ? 'page' : undefined}>
                Personas
              </a>
              <form method="post" action="/salir">
                <button type="submit" class="nav-salir">
                  Salir
                </button>
              </form>
            </nav>
          </header>
        )}
        <main class="contenedor">
          {props.aviso && (
            <p class={`aviso aviso--${props.aviso.tipo}`} role="status">
              {props.aviso.texto}
            </p>
          )}
          {props.children}
        </main>
      </body>
    </html>
  );
}

export type Aviso = { tipo: 'ok' | 'error'; texto: string };

/** Campo de formulario con etiqueta, para no repetir el mismo marcado en todas las pantallas. */
export function Campo(props: {
  etiqueta: string;
  nombre: string;
  valor?: string | number | null;
  tipo?: string;
  ayuda?: string;
  requerido?: boolean;
  placeholder?: string;
  multilinea?: boolean;
  min?: number;
}) {
  const id = `campo-${props.nombre}`;
  return (
    <div class="campo">
      <label for={id}>{props.etiqueta}</label>
      {props.multilinea ? (
        <textarea id={id} name={props.nombre} rows={3} placeholder={props.placeholder}>
          {props.valor ?? ''}
        </textarea>
      ) : (
        <input
          id={id}
          name={props.nombre}
          type={props.tipo ?? 'text'}
          value={props.valor ?? ''}
          required={props.requerido}
          placeholder={props.placeholder}
          min={props.min}
        />
      )}
      {props.ayuda && <small>{props.ayuda}</small>}
    </div>
  );
}

export function pesos(n: number | null): string {
  return n == null ? '' : `$${n.toLocaleString('es-AR')}`;
}

export function presupuesto(min: number | null, max: number | null): string | null {
  if (min != null && max != null) return `${pesos(min)} – ${pesos(max)}`;
  if (min != null) return `Desde ${pesos(min)}`;
  if (max != null) return `Hasta ${pesos(max)}`;
  return null;
}

export function fechaCorta(iso: string | null): string | null {
  if (!iso) return null;
  const [a, m, d] = iso.split('-');
  return a && m && d ? `${d}/${m}/${a}` : iso;
}
