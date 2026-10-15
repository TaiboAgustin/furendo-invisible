-- Revelación: cuándo se hizo y si ya se publicó el resumen en el canal del server.
ALTER TABLE events ADD COLUMN revealed_at TEXT;
ALTER TABLE events ADD COLUMN reveal_posted INTEGER NOT NULL DEFAULT 0;

-- Aviso de revelación a quien RECIBE ("tu amigo invisible era…").
ALTER TABLE assignments ADD COLUMN reveal_notified_at TEXT;
ALTER TABLE assignments ADD COLUMN reveal_error TEXT;
