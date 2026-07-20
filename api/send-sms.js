// Función serverless de Vercel: envía un SMS vía Twilio. Recibe {to, body}
// desde el cliente (o desde otras funciones serverless) y hace el POST
// real a la API de Twilio del lado del servidor, donde viven las
// credenciales (nunca en el frontend).

const { enviarSMSTwilio } = require('../lib/twilio-server.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { to, body } = req.body || {};
  if (!to || !body) return res.status(400).json({ error: 'Faltan parámetros to/body' });

  try {
    const data = await enviarSMSTwilio({ to, body });
    return res.status(200).json({ sid: data.sid });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};
