-- Estado del regalo de cada quien regala. No guarda el contenido (códigos, keys,
-- links): el bot lo reenvía y no queda en ningún lado.
CREATE TABLE deliveries (
  event_id     INTEGER NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  giver_id     INTEGER NOT NULL REFERENCES participants (id) ON DELETE CASCADE,
  -- en_camino: regalo físico despachado (/enviado)
  -- entregado: regalo virtual que el bot ya le pasó (/entregar)
  -- recibido:  quien lo recibe confirmó (/recibido)
  status       TEXT    NOT NULL CHECK (status IN ('en_camino', 'entregado', 'recibido')),
  virtual      INTEGER NOT NULL DEFAULT 0,
  sent_at      TEXT,
  received_at  TEXT,
  PRIMARY KEY (event_id, giver_id)
);
