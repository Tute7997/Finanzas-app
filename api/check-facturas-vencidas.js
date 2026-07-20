// Función serverless invocada por el cron de Vercel (ver vercel.json)
// una vez por día. Revisa TODAS las facturas pendientes de TODOS los
// usuarios cuyo día de vencimiento sea hoy, y les manda un WhatsApp si
// tienen phone_number cargado.
//
// A diferencia del resto de las funciones de /api, esta no tiene sesión
// de ningún usuario (la dispara Vercel, no el navegador) — por eso usa
// la Supabase Service Role Key, que bypassea RLS, en vez del anon key.
// Esa key NUNCA debe usarse del lado del cliente.

const { enviarWhatsAppTwilio } = require('../lib/twilio-server.js');

async function supabaseFetch(path) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!r.ok) throw new Error('Error consultando Supabase: ' + (await r.text()));
  return r.json();
}

module.exports = async function handler(req, res) {
  // Vercel manda este header en las invocaciones de cron si se configuró
  // CRON_SECRET como variable de entorno — evita que cualquiera dispare
  // el envío masivo de SMS pegándole a esta URL a mano.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Falta configurar Supabase (service role) en el servidor.' });
  }

  const diaHoy = new Date().getUTCDate();

  try {
    const pendientes = await supabaseFetch(`/facturas?estado=eq.pendiente&dia_vencimiento=eq.${diaHoy}&select=*`);
    let enviados = 0;

    for (const factura of pendientes) {
      try {
        const usuarios = await supabaseFetch(`/usuarios?id=eq.${factura.user_id}&select=phone_number`);
        const phone = usuarios[0] && usuarios[0].phone_number;
        if (!phone) continue;

        const monto = factura.monto != null ? ` - $${Number(factura.monto).toLocaleString('es-AR')}` : '';
        await enviarWhatsAppTwilio({ to: phone, body: `FinanzasApp: Factura '${factura.descripcion}' vence HOY${monto}` });
        enviados++;
      } catch (err) {
        console.error(`Error notificando factura ${factura.id}:`, err.message);
      }
    }

    return res.status(200).json({ ok: true, revisadas: pendientes.length, enviados });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
