// Wrapper sobre el cliente de Supabase: autenticación + CRUD por tabla.
// Requiere que el script UMD de @supabase/supabase-js esté cargado antes
// (ver index.html), que expone window.supabase.createClient.

import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from './supabase-config.js';

let cliente = null;

export function getCliente() {
  if (!supabaseConfigurado()) return null;
  if (!cliente) {
    cliente = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return cliente;
}

// ---------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------
export const auth = {
  async signUp({ email, password, nombre }) {
    const sb = getCliente();
    return sb.auth.signUp({ email, password, options: { data: { nombre } } });
  },
  async signIn({ email, password }) {
    const sb = getCliente();
    return sb.auth.signInWithPassword({ email, password });
  },
  async signOut() {
    const sb = getCliente();
    return sb.auth.signOut();
  },
  async getSession() {
    const sb = getCliente();
    const { data } = await sb.auth.getSession();
    return data.session;
  },
  onAuthStateChange(callback) {
    const sb = getCliente();
    return sb.auth.onAuthStateChange(callback);
  },
};

// ---------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------
export async function fetchUsuario(userId) {
  const sb = getCliente();
  const { data, error } = await sb.from('usuarios').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchIngresos() {
  const sb = getCliente();
  const { data, error } = await sb.from('ingresos').select('*').order('fecha', { ascending: false }).order('id', { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchGastos() {
  const sb = getCliente();
  const { data, error } = await sb.from('gastos').select('*').order('fecha', { ascending: false }).order('id', { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchFacturas() {
  const sb = getCliente();
  const { data, error } = await sb.from('facturas').select('*').order('dia_vencimiento', { ascending: true });
  if (error) throw error;
  return data;
}

export async function fetchAhorros() {
  const sb = getCliente();
  const { data, error } = await sb.from('ahorros').select('*').order('fecha', { ascending: false }).order('id', { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchChatLog(limit = 50) {
  const sb = getCliente();
  const { data, error } = await sb.from('chat_log').select('*').order('ts', { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}

export async function fetchRecordatorios() {
  const sb = getCliente();
  const { data, error } = await sb.from('recordatorios').select('*').order('fecha', { ascending: true }).order('hora', { ascending: true });
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------
// Mutators
// ---------------------------------------------------------------------
export async function insertIngreso({ categoria, descripcion, monto }) {
  const sb = getCliente();
  const { data, error } = await sb.from('ingresos').insert({ categoria, descripcion, monto }).select().single();
  if (error) throw error;
  return data;
}

export async function deleteIngreso(id) {
  const sb = getCliente();
  const { error } = await sb.from('ingresos').delete().eq('id', id);
  if (error) throw error;
}

export async function insertGasto({ categoria, descripcion, monto }) {
  const sb = getCliente();
  const { data, error } = await sb.from('gastos').insert({ categoria, descripcion, monto }).select().single();
  if (error) throw error;
  return data;
}

export async function deleteGasto(id) {
  const sb = getCliente();
  const { error } = await sb.from('gastos').delete().eq('id', id);
  if (error) throw error;
}

export async function insertFactura({ dia_vencimiento, descripcion, monto }) {
  const sb = getCliente();
  const { data, error } = await sb.from('facturas').insert({ dia_vencimiento, descripcion, monto }).select().single();
  if (error) throw error;
  return data;
}

export async function marcarFacturaPagada(id) {
  const sb = getCliente();
  const hoy = new Date().toISOString().slice(0, 10);
  const { data, error } = await sb
    .from('facturas')
    .update({ estado: 'pagado', fecha_pago: hoy })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deshacerPagoFactura(id) {
  const sb = getCliente();
  const { data, error } = await sb
    .from('facturas')
    .update({ estado: 'pendiente', fecha_pago: null })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// monto siempre positivo acá; el signo (invertir=+/retirar=-) lo decide el caller
export async function insertAhorro({ tipo, monto, rentabilidad_estimada }) {
  const sb = getCliente();
  const { data, error } = await sb.from('ahorros').insert({ tipo, monto, rentabilidad_estimada }).select().single();
  if (error) throw error;
  return data;
}

export async function insertChatLog({ source = 'web', command, reply, status }) {
  const sb = getCliente();
  const { data, error } = await sb.from('chat_log').insert({ source, command, reply, status }).select().single();
  if (error) throw error;
  return data;
}

export async function insertRecordatorio({ fecha, hora, descripcion }) {
  const sb = getCliente();
  const { data, error } = await sb.from('recordatorios').insert({ fecha, hora: hora || null, descripcion }).select().single();
  if (error) throw error;
  return data;
}

export async function deleteRecordatorio(id) {
  const sb = getCliente();
  const { error } = await sb.from('recordatorios').delete().eq('id', id);
  if (error) throw error;
}

export async function marcarRecordatorioCompletado(id, completado) {
  const sb = getCliente();
  const { data, error } = await sb.from('recordatorios').update({ completado }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}
