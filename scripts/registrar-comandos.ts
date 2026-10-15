// Registra (o actualiza) los comandos del bot en Discord.
// Uso: npm run comandos
// Lee DISCORD_BOT_TOKEN de .dev.vars. Los comandos son globales: aparecen en
// todos los servers donde esté el bot y en el privado con él.

import { readFileSync } from 'node:fs';
import { COMANDOS } from '../src/comandos.ts';

function leerToken(): string {
  if (process.env.DISCORD_BOT_TOKEN) return process.env.DISCORD_BOT_TOKEN;
  const vars = readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8');
  const linea = vars.split(/\r?\n/).find((l) => l.startsWith('DISCORD_BOT_TOKEN='));
  const token = linea?.slice('DISCORD_BOT_TOKEN='.length).trim();
  if (!token) throw new Error('No encontré DISCORD_BOT_TOKEN en .dev.vars.');
  return token;
}

const API = 'https://discord.com/api/v10';
const headers = { Authorization: `Bot ${leerToken()}`, 'Content-Type': 'application/json' };

const app = (await (await fetch(`${API}/applications/@me`, { headers })).json()) as { id: string; name: string };
if (!app.id) throw new Error('El token no es válido.');

const r = await fetch(`${API}/applications/${app.id}/commands`, {
  method: 'PUT',
  headers,
  body: JSON.stringify(COMANDOS),
});
if (!r.ok) {
  console.error(`Discord respondió ${r.status}:`, await r.text());
  process.exit(1);
}
const registrados = (await r.json()) as { name: string }[];
console.log(`Comandos de ${app.name}: ${registrados.map((c) => `/${c.name}`).join(', ')}`);
