// Helper del lado del servidor (Node) para mandar SMS vía la API REST
// de Twilio directo con fetch, sin el SDK oficial (el proyecto no usa
// npm/build tooling en ningún otro lado). NO es una ruta de /api — es
// un módulo que importan las funciones serverless que sí lo son
// (api/send-sms.js y api/check-facturas-vencidas.js).

async function enviarSMSTwilio({ to, body }) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    throw new Error('Twilio no está configurado en el servidor.');
  }
  const params = new URLSearchParams({ To: to, From: TWILIO_PHONE_NUMBER, Body: body });
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
  if (!r.ok) throw new Error(data.message || 'No se pudo enviar el SMS.');
  return data;
}

module.exports = { enviarSMSTwilio };
