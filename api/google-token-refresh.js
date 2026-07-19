// Función serverless de Vercel: usa un refresh_token guardado para pedir
// un access_token nuevo cuando el anterior venció. Google no reemite un
// refresh_token nuevo en este flujo — el original sigue siendo válido.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { refresh_token } = req.body || {};
  if (!refresh_token) return res.status(400).json({ error: 'Falta el parámetro refresh_token' });

  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({ error: 'Google Calendar no está configurado en el servidor.' });
  }

  const params = new URLSearchParams({
    refresh_token,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    grant_type: 'refresh_token',
  });

  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const data = await r.json();
    if (!r.ok) {
      return res.status(400).json({ error: data.error_description || data.error || 'No se pudo refrescar la conexión con Google Calendar.' });
    }
    return res.status(200).json({ access_token: data.access_token, expires_in: data.expires_in });
  } catch (err) {
    return res.status(500).json({ error: 'Error de red al contactar a Google.' });
  }
};
