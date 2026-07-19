// =====================================================================
// Configuración de Google Calendar (OAuth 2.0)
// =====================================================================
// El Client ID es público (no es secreto) y puede vivir acá. El Client
// Secret NUNCA va en este archivo ni en ningún archivo del frontend —
// vive solo como variable de entorno en Vercel, leída por las funciones
// serverless de api/google-token-exchange.js y api/google-token-refresh.js.
//
// Pasos para configurarlo: ver la sección "Google Calendar (opcional)"
// del README.md.
// =====================================================================

export const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

// Esta SPA no tiene router de servidor: Google redirige de vuelta a la
// misma página (con ?code=...&state=... en la URL), no a una ruta aparte.
export const GOOGLE_REDIRECT_URI = window.location.origin + window.location.pathname;

export function googleClientIdConfigurado() {
  return Boolean(GOOGLE_CLIENT_ID) && !GOOGLE_CLIENT_ID.includes('YOUR_GOOGLE_CLIENT_ID');
}
