// Función serverless de Vercel: es el redirect_uri registrado en Google
// Cloud Console. Su único trabajo es reenviar code/state (o error) de
// vuelta a la raíz de la SPA, en relativo (sin dominio hardcodeado, así
// funciona igual en cualquier deploy). El intercambio real del code por
// tokens y el guardado en Supabase los sigue haciendo el cliente
// (manejarCallbackGoogleSiCorresponde en app.js), vía las funciones
// google-token-exchange.js / google-token-refresh.js que ya existen.

module.exports = function handler(req, res) {
  const { code, state, error } = req.query;
  const params = new URLSearchParams();
  if (code) params.set('code', code);
  if (state) params.set('state', state);
  if (error) params.set('error', error);
  res.redirect(302, `/?${params.toString()}`);
};
