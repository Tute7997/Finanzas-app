// Función serverless de Vercel: webhook que Twilio invoca por POST cada
// vez que llega un mensaje al número de WhatsApp de la app. No corre
// con sesión de ningún usuario (lo dispara Twilio, no el navegador),
// así que usa la Supabase Service Role Key (vía lib/supabase-admin.js)
// para buscar al usuario por phone_number y ejecutar el comando —
// mismo criterio que api/check-facturas-vencidas.js.
//
// Seguridad: a diferencia del cron de facturas vencidas (donde el
// chequeo de CRON_SECRET es opcional si no está seteado), acá el
// secret es obligatorio: este endpoint ejecuta acciones que mutan
// datos financieros a partir de un mensaje de un tercero, así que sin
// CRON_SECRET configurado se rechaza en vez de quedar abierto. Se
// espera como query string (?secret=...) porque así se configura la
// webhook URL en Twilio Console, que no permite mandar headers custom.

const db = require('../lib/supabase-admin.js');
const { enviarWhatsAppTwilio } = require('../lib/twilio-server.js');
const { parseCommand, ejecutarComando } = require('../lib/whatsapp-processor.js');

function responderTwiml(res) {
  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send('<Response></Response>');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return res.status(500).json({ error: 'Falta configurar CRON_SECRET en el servidor.' });
  if (req.query.secret !== cronSecret) return res.status(401).json({ error: 'No autorizado' });

  const { From, Body } = req.body || {};
  if (!From || !Body) return responderTwiml(res);

  const telefono = From.replace(/^whatsapp:/, '');

  try {
    const usuarios = await db.get(`/usuarios?phone_number=eq.${encodeURIComponent(telefono)}&select=*`);
    const usuario = usuarios[0];

    if (!usuario) {
      await enviarWhatsAppTwilio({
        to: telefono,
        body: 'No encontramos una cuenta de FinanzasApp con este número. Cargalo en Ajustes (formato +54911...) y volvé a escribirnos.',
      }).catch((err) => console.error('Error avisando número no registrado:', err.message));
      return responderTwiml(res);
    }

    const resultado = parseCommand(Body);
    const { reply, status } = await ejecutarComando(usuario, resultado);

    await db
      .post('/chat_log', { user_id: usuario.id, source: 'whatsapp', command: Body, reply, status })
      .catch((err) => console.error('Error guardando chat_log de WhatsApp:', err.message));

    await enviarWhatsAppTwilio({ to: telefono, body: reply }).catch((err) => console.error('Error respondiendo por WhatsApp:', err.message));

    return responderTwiml(res);
  } catch (err) {
    console.error('Error procesando webhook de WhatsApp:', err);
    return responderTwiml(res);
  }
};
