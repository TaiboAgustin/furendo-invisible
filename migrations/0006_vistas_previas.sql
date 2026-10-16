-- Comando a la espera de que quien lo usó confirme la versión en tono neutro.
-- Se borra al tocar Enviar o Cancelar, y el cron borra los que quedan abandonados.
CREATE TABLE pending_messages (
  id               TEXT PRIMARY KEY,
  discord_user_id  TEXT NOT NULL,
  data             TEXT NOT NULL,   -- el comando completo (JSON), con el texto ya neutralizado
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
