-- Cuándo se hizo el sorteo.
ALTER TABLE events ADD COLUMN drawn_at TEXT;

-- Resultado del aviso a quien regala: por dónde llegó o por qué falló.
ALTER TABLE assignments ADD COLUMN notify_channel TEXT CHECK (notify_channel IN ('discord', 'mail'));
ALTER TABLE assignments ADD COLUMN notify_error TEXT;
