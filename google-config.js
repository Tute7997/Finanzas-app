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

export const GOOGLE_CLIENT_ID = ''244272796765-5cufu2cbn748mfdq3hb0ede79ta5f61s.apps.googleusercontent.com'';
export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

// Google redirige acá (una función serverless de Vercel, ver
// api/auth/google/callback.js), que a su vez reenvía code/state a la
// raíz de la SPA con un 302. Se calcula desde el origin actual para que
// funcione igual en cualquier dominio donde se sirva la app (siempre
// que ese dominio esté dado de alta como redirect URI en Google Cloud
// Console).
export const GOOGLE_REDIRECT_URI = window.location.origin + '/api/auth/google/callback';

export function googleClientIdConfigurado() {
  return Boolean(GOOGLE_CLIENT_ID) && !GOOGLE_CLIENT_ID.includes('YOUR_GOOGLE_CLIENT_ID');
}
