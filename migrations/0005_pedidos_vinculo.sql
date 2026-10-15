-- Pedido de vinculación hecho con /unirme mail:… Queda pendiente hasta que el
-- organizador lo confirma: así nadie puede quedarse con los mensajes de otro
-- escribiendo un mail ajeno.
ALTER TABLE people ADD COLUMN discord_pending_id TEXT;
ALTER TABLE people ADD COLUMN discord_pending_username TEXT;
ALTER TABLE people ADD COLUMN discord_pending_at TEXT;
