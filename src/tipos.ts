export type Env = {
  DB: D1Database;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
  // Opcionales: sin ellos la app funciona, pero no puede avisar por ese canal.
  DISCORD_BOT_TOKEN?: string;
  DISCORD_GUILD_ID?: string;
  BREVO_API_KEY?: string;
  MAIL_FROM?: string;
  MAIL_FROM_NAME?: string;
};

export type EstadoEvento = 'borrador' | 'sorteado' | 'revelado' | 'cerrado';

export type Evento = {
  id: number;
  name: string;
  budget_min: number | null;
  budget_max: number | null;
  currency: string;
  deadline: string | null;
  reveal_date: string | null;
  form_csv_url: string | null;
  status: EstadoEvento;
  drawn_at: string | null;
  created_at: string;
};

/** Cómo le fue al aviso de cada participante. No dice a quién le regala. */
export type EstadoAviso = {
  giver_id: number;
  notified_at: string | null;
  notify_channel: 'discord' | 'mail' | null;
  notify_error: string | null;
};

export type Persona = {
  id: number;
  name: string;
  email: string | null;
  discord_username: string | null;
  discord_user_id: string | null;
  address: string | null;
};

/** Participante de un evento junto con los datos de su persona. */
export type Participante = Persona & {
  participant_id: number;
  person_id: number;
  wishlist: string | null;
  sizes: string | null;
  notes: string | null;
  status: 'activo' | 'baja';
};
