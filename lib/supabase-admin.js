// Helper genérico de REST a PostgREST (Supabase) usando la Service Role
// Key, que bypassea RLS. Lo usan funciones serverless que no corren con
// sesión de ningún usuario (a diferencia de supabase-client.js, que es
// browser-only y usa la anon key + JWT del usuario logueado).
//
// Generaliza el supabaseFetch() que ya existía inline (GET-only) en
// api/check-facturas-vencidas.js, agregando POST/PATCH.

async function supabaseAdmin(method, path, body) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Falta configurar Supabase (service role) en el servidor.');
  }
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error('Error consultando Supabase: ' + (await r.text()));
  if (r.status === 204) return null;
  return r.json();
}

module.exports = {
  get: (path) => supabaseAdmin('GET', path),
  post: (path, body) => supabaseAdmin('POST', path, body),
  patch: (path, body) => supabaseAdmin('PATCH', path, body),
};
