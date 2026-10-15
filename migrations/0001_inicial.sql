-- Eventos: cada sorteo (Navidad 2026, Navidad 2027, ...).
CREATE TABLE events (
  id            INTEGER PRIMARY KEY,
  name          TEXT    NOT NULL,
  budget_min    INTEGER,
  budget_max    INTEGER,
  currency      TEXT    NOT NULL DEFAULT 'ARS',
  deadline      TEXT,                -- fecha límite para entregar (YYYY-MM-DD)
  reveal_date   TEXT,                -- fecha de la revelación (YYYY-MM-DD)
  form_csv_url  TEXT,                -- link del Google Sheet con las respuestas del form
  status        TEXT    NOT NULL DEFAULT 'borrador'
                CHECK (status IN ('borrador', 'sorteado', 'revelado', 'cerrado')),
  created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Personas: se reutilizan entre eventos.
CREATE TABLE people (
  id                INTEGER PRIMARY KEY,
  name              TEXT NOT NULL,
  email             TEXT COLLATE NOCASE,
  discord_username  TEXT COLLATE NOCASE,
  discord_user_id   TEXT,              -- lo completa el bot con /unirme
  address           TEXT,
  created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX people_email ON people (email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX people_discord_user ON people (discord_user_id) WHERE discord_user_id IS NOT NULL;

-- Participantes: una persona dentro de un evento, con lo propio de ese evento.
CREATE TABLE participants (
  id          INTEGER PRIMARY KEY,
  event_id    INTEGER NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  person_id   INTEGER NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  wishlist    TEXT,
  sizes       TEXT,
  notes       TEXT,
  status      TEXT NOT NULL DEFAULT 'activo' CHECK (status IN ('activo', 'baja')),
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (event_id, person_id)
);

-- Asignaciones del sorteo. La interfaz nunca las muestra.
CREATE TABLE assignments (
  event_id     INTEGER NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  giver_id     INTEGER NOT NULL REFERENCES participants (id) ON DELETE CASCADE,
  receiver_id  INTEGER NOT NULL REFERENCES participants (id) ON DELETE CASCADE,
  notified_at  TEXT,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, giver_id),
  UNIQUE (event_id, receiver_id),
  CHECK (giver_id <> receiver_id)
);
