export type Env = {
  DB: D1Database;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
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
  created_at: string;
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
