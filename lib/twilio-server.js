// Helper del lado del servidor (Node) para mandar SMS/WhatsApp vía la
// API REST de Twilio directo con fetch, sin el SDK oficial (el proyecto
// no usa npm/build tooling en ningún otro lado). NO es una ruta de
// /api — es un módulo que importan las funciones serverless que sí lo
// son (api/send-sms.js, api/check-facturas-vencidas.js y
// api/whatsapp-webhook.js).

async function enviarMensajeTwilio({ to, from, body }) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !from) {
    throw new Error('Twilio no está configurado en el servidor.');
  }
  const params = new URLSearchParams({ To: to, From: from, Body: body });
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message || 'No se pudo enviar el mensaje.');
  return data;
}

async function enviarSMSTwilio({ to, body }) {
  const { TWILIO_PHONE_NUMBER } = process.env;
  if (!TWILIO_PHONE_NUMBER) throw new Error('Twilio no está configurado en el servidor.');
  return enviarMensajeTwilio({ to, from: TWILIO_PHONE_NUMBER, body });
}

// Reusa TWILIO_PHONE_NUMBER como remitente de WhatsApp — asume que ese
// número ya está habilitado para WhatsApp en Twilio (sandbox de pruebas
// o número de WhatsApp Business aprobado). Twilio distingue SMS de
// WhatsApp por el prefijo "whatsapp:" en To/From, no por un parámetro
// separado.
async function enviarWhatsAppTwilio({ to, body }) {
  const { TWILIO_PHONE_NUMBER } = process.env;
  if (!TWILIO_PHONE_NUMBER) throw new Error('Twilio no está configurado en el servidor.');
  const conPrefijo = (n) => (n.startsWith('whatsapp:') ? n : `whatsapp:${n}`);
  return enviarMensajeTwilio({ to: conPrefijo(to), from: conPrefijo(TWILIO_PHONE_NUMBER), body });
}

module.exports = { enviarSMSTwilio, enviarWhatsAppTwilio };
