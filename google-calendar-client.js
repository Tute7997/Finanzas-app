// Cliente de Google OAuth + Calendar API. El intercambio/refresco de
// tokens pasa por las funciones serverless de /api (necesitan el client
// secret); crear/borrar eventos se hace directo contra la API de Google
// desde el navegador, con el access token como bearer.

import { GOOGLE_CLIENT_ID, GOOGLE_CALENDAR_SCOPE, GOOGLE_REDIRECT_URI } from './google-config.js';

const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

function generarNonce() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// access_type=offline + prompt=consent son imprescindibles juntos para
// recibir refresh_token de forma confiable (si no, Google solo lo manda
// la primera vez que el usuario autoriza la app).
export function buildAuthUrl() {
  const state = generarNonce();
  sessionStorage.setItem('google_oauth_state', state);
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: GOOGLE_CALENDAR_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function intercambiarCodigo(code) {
  const res = await fetch('/api/google-token-exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'No se pudo conectar con Google.');
  return data;
}

// No persiste nada en Supabase — el caller decide qué hacer con el
// resultado (actualizarUsuario si refrescado === true).
export async function refrescarTokenSiHaceFalta(usuario) {
  const expiryMs = usuario.google_calendar_expiry ? new Date(usuario.google_calendar_expiry).getTime() : 0;
  const yaVenceOVencido = !expiryMs || expiryMs - Date.now() < 60 * 1000;
  if (!yaVenceOVencido) {
    return { accessToken: usuario.google_calendar_token, refrescado: false };
  }
  const res = await fetch('/api/google-token-refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: usuario.google_calendar_refresh_token }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'No se pudo refrescar la conexión con Google Calendar.');
  return {
    accessToken: data.access_token,
    refrescado: true,
    expiry: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

function construirEvento({ descripcion, fecha, hora }) {
  if (hora) {
    const horaCorta = hora.slice(0, 5);
    const inicio = new Date(`${fecha}T${horaCorta}:00`);
    const fin = new Date(inicio.getTime() + 60 * 60 * 1000);
    const zona = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return {
      summary: descripcion,
      start: { dateTime: inicio.toISOString(), timeZone: zona },
      end: { dateTime: fin.toISOString(), timeZone: zona },
    };
  }
  const finDate = new Date(`${fecha}T00:00:00`);
  finDate.setDate(finDate.getDate() + 1); // end.date es exclusivo en eventos de todo el día
  const finStr = finDate.toISOString().slice(0, 10);
  return {
    summary: descripcion,
    start: { date: fecha },
    end: { date: finStr },
  };
}

export async function crearEventoCalendar(accessToken, { descripcion, fecha, hora }) {
  const res = await fetch(EVENTS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(construirEvento({ descripcion, fecha, hora })),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'No se pudo crear el evento en Google Calendar.');
  return data.id;
}

export async function eliminarEventoCalendar(accessToken, eventId) {
  const res = await fetch(`${EVENTS_URL}/${eventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.ok || res.status === 404 || res.status === 410) return;
  const data = await res.json().catch(() => ({}));
  throw new Error(data.error?.message || 'No se pudo borrar el evento de Google Calendar.');
}
