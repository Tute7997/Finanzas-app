// Punto de entrada: inicializa la app, mantiene el estado global,
// conecta los eventos del DOM con supabase-client.js y dispara los
// renders de ui.js.

import { supabaseConfigurado } from './supabase-config.js';
import {
  auth,
  fetchUsuario,
  fetchIngresos,
  fetchGastos,
  fetchFacturas,
  fetchAhorros,
  fetchChatLog,
  insertIngreso,
  deleteIngreso,
  insertGasto,
  deleteGasto,
  insertFactura,
  deleteFactura,
  marcarFacturaPagada,
  deshacerPagoFactura,
  insertAhorro,
  insertChatLog,
  fetchRecordatorios,
  insertRecordatorio,
  deleteRecordatorio,
  marcarRecordatorioCompletado,
  actualizarRecordatorio,
  actualizarUsuario,
} from './supabase-client.js';
import { googleClientIdConfigurado } from './google-config.js';
import {
  buildAuthUrl,
  intercambiarCodigo,
  refrescarTokenSiHaceFalta,
  crearEventoCalendar,
  eliminarEventoCalendar,
  revocarToken,
} from './google-calendar-client.js';
import {
  renderAll,
  renderDashboard,
  renderIngresos,
  renderGastos,
  renderFacturas,
  renderAhorros,
  renderAnalizador,
  renderRecordatorios,
  renderAjustes,
  renderUsuario,
  renderChatLog,
  switchTab,
  applyTheme,
  formatMonto,
  formatFecha,
} from './ui.js';
import { initCharts } from './charts.js';
import { parseCommand } from './chat-parser.js';
import { TIPOS_AHORRO } from './constants.js';

const state = {
  usuario: null,
  ingresos: [],
  gastos: [],
  facturas: [],
  ahorros: [],
  recordatorios: [],
  chatLog: [],
  charts: null,
};

let chatNoLeidos = 0;

// ---------------------------------------------------------------------
// Fecha de hoy (para precargar los inputs de fecha de los formularios)
// ---------------------------------------------------------------------
const IDS_INPUT_FECHA = ['ingreso-fecha', 'gasto-fecha', 'factura-fecha', 'invertir-fecha', 'retirar-fecha'];

function hoyISO() {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
}

function precargarFechaHoy(id) {
  const input = document.getElementById(id);
  if (input) input.value = hoyISO();
}

function precargarFechasHoy() {
  IDS_INPUT_FECHA.forEach(precargarFechaHoy);
}

// ---------------------------------------------------------------------
// Mensajes de error más claros para fallas típicas de migración
// ---------------------------------------------------------------------
function mensajeErrorAmigable(err) {
  const columnaFaltante = /column .* does not exist|could not find the .* column/i;
  if (columnaFaltante.test(err.message || '')) {
    return 'Falta actualizar la base de datos: corré el SQL de schema.sql en el SQL Editor de Supabase.';
  }
  return err.message;
}

// ---------------------------------------------------------------------
// WhatsApp (Twilio, vía /api/send-sms). Best-effort: si falla, solo se
// loguea — nunca bloquea la acción principal (guardar el ingreso,
// marcar la factura pagada, etc).
// ---------------------------------------------------------------------
async function notificarWhatsApp(mensaje) {
  if (!state.usuario || !state.usuario.phone_number) return;
  try {
    await fetch('/api/send-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: state.usuario.phone_number, body: mensaje, channel: 'whatsapp' }),
    });
  } catch (err) {
    console.error('Error enviando WhatsApp:', err);
  }
}

// ---------------------------------------------------------------------
// Toast de error/éxito genérico
// ---------------------------------------------------------------------
function mostrarToast(mensaje, tipo = 'error') {
  const toast = document.createElement('div');
  toast.className = `toast toast--${tipo}`;
  toast.textContent = mensaje;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ---------------------------------------------------------------------
// Mostrar / ocultar pantallas
// ---------------------------------------------------------------------
async function mostrarApp(usuarioAuth) {
  document.getElementById('auth-screen').hidden = true;

  try {
    const perfil = await fetchUsuario(usuarioAuth.id);
    state.usuario = perfil
      ? { ...perfil, email: perfil.email || usuarioAuth.email }
      : { id: usuarioAuth.id, email: usuarioAuth.email, nombre: null, terminos_aceptados: false, google_calendar_conectado: false };

    if (!state.usuario.terminos_aceptados) {
      mostrarTerminos();
      return;
    }
    await mostrarDashboard();
    await manejarCallbackGoogleSiCorresponde();
  } catch (err) {
    console.error('Error cargando datos:', err);
    mostrarToast('No se pudieron cargar los datos: ' + err.message);
  }
}

function mostrarTerminos() {
  document.getElementById('app-screen').hidden = true;
  document.getElementById('floating-chat').hidden = true;
  document.getElementById('terminos-screen').hidden = false;
}

async function mostrarDashboard() {
  document.getElementById('terminos-screen').hidden = true;
  document.getElementById('app-screen').hidden = false;
  document.getElementById('floating-chat').hidden = false;
  if (!state.charts) state.charts = initCharts();
  await cargarYRenderizarApp();
}

async function cargarYRenderizarApp() {
  const [ingresos, gastos, facturas, ahorros, chatLog, recordatorios] = await Promise.all([
    fetchIngresos(),
    fetchGastos(),
    fetchFacturas(),
    fetchAhorros(),
    fetchChatLog(),
    fetchRecordatorios(),
  ]);
  state.ingresos = ingresos;
  state.gastos = gastos;
  state.facturas = facturas;
  state.ahorros = ahorros;
  state.chatLog = chatLog;
  state.recordatorios = recordatorios;
  renderAll(state);
}

function mostrarAuth() {
  document.getElementById('app-screen').hidden = true;
  document.getElementById('terminos-screen').hidden = true;
  document.getElementById('floating-chat').hidden = true;
  document.getElementById('auth-screen').hidden = false;
}

// ---------------------------------------------------------------------
// Google Calendar: callback OAuth + helpers de sincronización
// ---------------------------------------------------------------------
async function manejarCallbackGoogleSiCorresponde() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const errorGoogle = params.get('error');

  if (!code && !errorGoogle) return;

  if (errorGoogle) {
    sessionStorage.removeItem('google_oauth_state');
    history.replaceState({}, '', window.location.pathname);
    mostrarToast('No se conectó Google Calendar: ' + errorGoogle);
    return;
  }

  const stateRecibido = params.get('state');
  const stateEsperado = sessionStorage.getItem('google_oauth_state');
  sessionStorage.removeItem('google_oauth_state');
  history.replaceState({}, '', window.location.pathname);

  if (!stateEsperado || stateRecibido !== stateEsperado) {
    mostrarToast('No se pudo verificar la conexión con Google Calendar.');
    return;
  }

  try {
    const tokens = await intercambiarCodigo(code);
    const patch = {
      google_calendar_token: tokens.access_token,
      google_calendar_expiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      google_calendar_conectado: true,
    };
    if (tokens.refresh_token) patch.google_calendar_refresh_token = tokens.refresh_token;
    state.usuario = await actualizarUsuario(state.usuario.id, patch);
    renderRecordatorios(state);
    mostrarToast('Google Calendar conectado correctamente.', 'ok');
  } catch (err) {
    mostrarToast('No se pudo conectar Google Calendar: ' + mensajeErrorAmigable(err));
  }
}

async function obtenerAccessTokenCalendar() {
  const resultado = await refrescarTokenSiHaceFalta(state.usuario);
  if (resultado.refrescado) {
    state.usuario = await actualizarUsuario(state.usuario.id, {
      google_calendar_token: resultado.accessToken,
      google_calendar_expiry: resultado.expiry,
    });
  }
  return resultado.accessToken;
}

async function sincronizarRecordatorioConCalendar(fila) {
  if (!state.usuario.google_calendar_conectado) return fila;
  try {
    const accessToken = await obtenerAccessTokenCalendar();
    const eventId = await crearEventoCalendar(accessToken, { descripcion: fila.descripcion, fecha: fila.fecha, hora: fila.hora });
    return await actualizarRecordatorio(fila.id, { google_calendar_event_id: eventId });
  } catch (err) {
    console.error('Error creando evento de Google Calendar:', err);
    mostrarToast('El recordatorio se guardó, pero no se pudo sincronizar con Google Calendar.');
    return fila;
  }
}

async function borrarEventoCalendarSiCorresponde(recordatorio) {
  if (!recordatorio.google_calendar_event_id || !state.usuario.google_calendar_conectado) return;
  try {
    const accessToken = await obtenerAccessTokenCalendar();
    await eliminarEventoCalendar(accessToken, recordatorio.google_calendar_event_id);
  } catch (err) {
    console.error('Error borrando evento de Google Calendar:', err);
  }
}

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------
async function init() {
  const temaGuardado = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(temaGuardado);
  precargarFechasHoy();

  if (!supabaseConfigurado()) {
    document.getElementById('auth-banner-config').hidden = false;
    document.getElementById('auth-screen').hidden = false;
    return;
  }

  auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) mostrarApp(session.user);
    if (event === 'SIGNED_OUT') mostrarAuth();
  });

  const sesion = await auth.getSession();
  if (sesion) {
    mostrarApp(sesion.user);
  } else {
    mostrarAuth();
  }
}

// ---------------------------------------------------------------------
// Auth: login / signup
// ---------------------------------------------------------------------
document.getElementById('ir-a-signup').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('form-login').hidden = true;
  document.getElementById('form-signup').hidden = false;
});
document.getElementById('ir-a-login').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('form-signup').hidden = true;
  document.getElementById('form-login').hidden = false;
});

document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('login-error');
  errorEl.hidden = true;
  if (!supabaseConfigurado()) {
    errorEl.textContent = 'Supabase no está configurado todavía (ver supabase-config.js).';
    errorEl.hidden = false;
    return;
  }
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const { error } = await auth.signIn({ email, password });
  if (error) {
    errorEl.textContent = 'Email o contraseña incorrectos';
    errorEl.hidden = false;
  }
});

document.getElementById('form-signup').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('signup-error');
  const infoEl = document.getElementById('signup-info');
  errorEl.hidden = true;
  infoEl.hidden = true;
  if (!supabaseConfigurado()) {
    errorEl.textContent = 'Supabase no está configurado todavía (ver supabase-config.js).';
    errorEl.hidden = false;
    return;
  }
  const nombre = document.getElementById('signup-nombre').value;
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;
  const passwordConfirm = document.getElementById('signup-password-confirm').value;
  if (password !== passwordConfirm) {
    errorEl.textContent = 'Las contraseñas no coinciden.';
    errorEl.hidden = false;
    return;
  }
  const { data, error } = await auth.signUp({ email, password, nombre });
  if (error) {
    errorEl.textContent = error.message;
    errorEl.hidden = false;
    return;
  }
  if (!data.session) {
    infoEl.textContent = 'Cuenta creada. Revisá tu email para confirmarla antes de iniciar sesión.';
    infoEl.hidden = false;
  }
});

async function cerrarSesion() {
  await auth.signOut();
  mostrarToast('Sesión cerrada', 'ok');
}

document.getElementById('btn-logout').addEventListener('click', cerrarSesion);
document.getElementById('btn-ajustes-logout').addEventListener('click', cerrarSesion);

// ---------------------------------------------------------------------
// Términos y condiciones
// ---------------------------------------------------------------------
document.getElementById('form-terminos').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('terminos-error');
  errorEl.hidden = true;
  if (!document.getElementById('terminos-check-aceptar').checked) {
    errorEl.textContent = 'Tenés que aceptar los términos para continuar.';
    errorEl.hidden = false;
    return;
  }
  const conectarCalendar = document.getElementById('terminos-check-calendar').checked;
  try {
    state.usuario = await actualizarUsuario(state.usuario.id, {
      email: state.usuario.email,
      terminos_aceptados: true,
      fecha_aceptacion_terminos: new Date().toISOString(),
    });
    if (conectarCalendar) {
      if (!googleClientIdConfigurado()) {
        mostrarToast('Google Calendar no está configurado todavía (ver google-config.js).');
        await mostrarDashboard();
        return;
      }
      window.location.href = buildAuthUrl();
      return;
    }
    await mostrarDashboard();
  } catch (err) {
    mostrarToast('Error al guardar: ' + mensajeErrorAmigable(err));
  }
});

document.getElementById('btn-ajustes-conectar-calendar').addEventListener('click', () => {
  if (!googleClientIdConfigurado()) return mostrarToast('Google Calendar no está configurado todavía (ver google-config.js).');
  window.location.href = buildAuthUrl();
});

async function desconectarGoogleCalendar() {
  if (!confirm('¿Desconectar Google Calendar?')) return;
  try {
    if (state.usuario.google_calendar_token) {
      await revocarToken(state.usuario.google_calendar_token);
    }
    state.usuario = await actualizarUsuario(state.usuario.id, {
      google_calendar_conectado: false,
      google_calendar_token: null,
      google_calendar_refresh_token: null,
      google_calendar_expiry: null,
    });
    renderAjustes(state);
    mostrarToast('Google Calendar desconectado.', 'ok');
  } catch (err) {
    mostrarToast('Error al desconectar: ' + mensajeErrorAmigable(err));
  }
}

document.getElementById('btn-ajustes-desconectar-calendar').addEventListener('click', desconectarGoogleCalendar);

document.getElementById('form-ajustes-perfil').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = document.getElementById('ajustes-nombre').value.trim() || null;
  const phone_number = document.getElementById('ajustes-telefono').value.trim() || null;
  try {
    state.usuario = await actualizarUsuario(state.usuario.id, { nombre, phone_number });
    renderUsuario(state);
    renderAjustes(state);
    mostrarToast('Cambios guardados.', 'ok');
  } catch (err) {
    mostrarToast('Error al guardar: ' + mensajeErrorAmigable(err));
  }
});

// ---------------------------------------------------------------------
// Tema
// ---------------------------------------------------------------------
document.getElementById('btn-theme-toggle').addEventListener('click', () => {
  const actual = document.documentElement.getAttribute('data-theme');
  applyTheme(actual === 'dark' ? 'light' : 'dark');
});

// ---------------------------------------------------------------------
// Navegación entre pestañas
// ---------------------------------------------------------------------
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});
document.querySelectorAll('[data-goto]').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.goto));
});

// ---------------------------------------------------------------------
// Ingresos
// ---------------------------------------------------------------------
document.getElementById('form-ingreso').addEventListener('submit', async (e) => {
  e.preventDefault();
  const categoria = document.getElementById('ingreso-categoria').value;
  const descripcion = document.getElementById('ingreso-descripcion').value.trim() || null;
  const monto = Number(document.getElementById('ingreso-monto').value);
  const fecha = document.getElementById('ingreso-fecha').value;
  if (!(monto > 0)) return mostrarToast('El monto tiene que ser mayor a 0.');
  if (!fecha) return mostrarToast('Elegí una fecha.');
  try {
    const fila = await insertIngreso({ categoria, descripcion, monto, fecha });
    state.ingresos.unshift(fila);
    renderIngresos(state);
    renderDashboard(state);
    e.target.reset();
    precargarFechaHoy('ingreso-fecha');
    if (monto > 1000) await notificarWhatsApp(`FinanzasApp: Ingreso registrado: ${formatMonto(monto)} - ${descripcion || categoria}`);
  } catch (err) {
    mostrarToast('Error al registrar el ingreso: ' + err.message);
  }
});

document.getElementById('btn-borrar-ultimo-ingreso').addEventListener('click', async () => {
  if (!state.ingresos.length) return mostrarToast('No hay ingresos para borrar.');
  if (!confirm('¿Borrar el último ingreso registrado?')) return;
  const ultimo = state.ingresos[0];
  try {
    await deleteIngreso(ultimo.id);
    state.ingresos.shift();
    renderIngresos(state);
    renderDashboard(state);
  } catch (err) {
    mostrarToast('Error al borrar: ' + err.message);
  }
});

document.getElementById('btn-compactar-ingresos').addEventListener('click', () => compactar('ingreso'));

document.getElementById('tabla-ingresos').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-accion="eliminar-ingreso"]');
  if (!btn) return;
  if (!confirm('¿Eliminar este ingreso?')) return;
  const id = Number(btn.dataset.id);
  try {
    await deleteIngreso(id);
    state.ingresos = state.ingresos.filter((i) => i.id !== id);
    renderIngresos(state);
    renderDashboard(state);
  } catch (err) {
    mostrarToast('Error al eliminar: ' + err.message);
  }
});

// ---------------------------------------------------------------------
// Gastos
// ---------------------------------------------------------------------
document.getElementById('form-gasto').addEventListener('submit', async (e) => {
  e.preventDefault();
  const categoria = document.getElementById('gasto-categoria').value;
  const descripcion = document.getElementById('gasto-descripcion').value.trim() || null;
  const monto = Number(document.getElementById('gasto-monto').value);
  const fecha = document.getElementById('gasto-fecha').value;
  if (!(monto > 0)) return mostrarToast('El monto tiene que ser mayor a 0.');
  if (!fecha) return mostrarToast('Elegí una fecha.');
  try {
    const fila = await insertGasto({ categoria, descripcion, monto, fecha });
    state.gastos.unshift(fila);
    renderGastos(state);
    renderDashboard(state);
    e.target.reset();
    precargarFechaHoy('gasto-fecha');
    if (monto > 1000) await notificarWhatsApp(`FinanzasApp: Gasto registrado: ${formatMonto(monto)} - ${descripcion || categoria}`);
  } catch (err) {
    mostrarToast('Error al registrar el gasto: ' + err.message);
  }
});

document.getElementById('btn-borrar-ultimo-gasto').addEventListener('click', async () => {
  if (!state.gastos.length) return mostrarToast('No hay gastos para borrar.');
  if (!confirm('¿Borrar el último gasto registrado?')) return;
  const ultimo = state.gastos[0];
  try {
    await deleteGasto(ultimo.id);
    state.gastos.shift();
    renderGastos(state);
    renderDashboard(state);
  } catch (err) {
    mostrarToast('Error al borrar: ' + err.message);
  }
});

document.getElementById('btn-compactar-gastos').addEventListener('click', () => compactar('gasto'));

document.getElementById('tabla-gastos').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-accion="eliminar-gasto"]');
  if (!btn) return;
  if (!confirm('¿Eliminar este gasto?')) return;
  const id = btn.dataset.id;
  try {
    await deleteGasto(id);
    state.gastos = state.gastos.filter((g) => g.id !== id);
    renderGastos(state);
    renderDashboard(state);
  } catch (err) {
    mostrarToast('Error al eliminar: ' + err.message);
  }
});

// Combina en una sola fila los ingresos/gastos que comparten categoría
// y fecha, para mantener la tabla más corta.
async function compactar(entidad) {
  const esIngreso = entidad === 'ingreso';
  const lista = esIngreso ? state.ingresos : state.gastos;
  const insertar = esIngreso ? insertIngreso : insertGasto;
  const eliminar = esIngreso ? deleteIngreso : deleteGasto;

  const grupos = {};
  for (const fila of lista) {
    const clave = fila.categoria + '|' + fila.fecha;
    (grupos[clave] = grupos[clave] || []).push(fila);
  }
  const gruposAFundir = Object.values(grupos).filter((g) => g.length > 1);
  if (!gruposAFundir.length) return mostrarToast('No hay filas para compactar.', 'ok');
  if (!confirm(`Se van a combinar ${gruposAFundir.length} grupo(s) de filas repetidas. ¿Continuar?`)) return;

  try {
    for (const grupo of gruposAFundir) {
      const monto = grupo.reduce((acc, f) => acc + Number(f.monto), 0);
      const descripcion = [...new Set(grupo.map((f) => f.descripcion).filter(Boolean))].join(', ') || null;
      for (const f of grupo) await eliminar(f.id);
      await insertar({ categoria: grupo[0].categoria, descripcion, monto, fecha: grupo[0].fecha });
    }
    if (esIngreso) {
      state.ingresos = await fetchIngresos();
      renderIngresos(state);
    } else {
      state.gastos = await fetchGastos();
      renderGastos(state);
    }
    renderDashboard(state);
    mostrarToast('Filas compactadas correctamente.', 'ok');
  } catch (err) {
    mostrarToast('Error al compactar: ' + err.message);
  }
}

// ---------------------------------------------------------------------
// Facturas
// ---------------------------------------------------------------------
document.getElementById('form-agendar-factura').addEventListener('submit', async (e) => {
  e.preventDefault();
  const dia = Number(document.getElementById('factura-dia').value);
  const descripcion = document.getElementById('factura-descripcion').value.trim();
  const montoStr = document.getElementById('factura-monto').value;
  const monto = montoStr ? Number(montoStr) : null;
  const fecha = document.getElementById('factura-fecha').value;
  if (!(dia >= 1 && dia <= 31)) return mostrarToast('El día tiene que ser entre 1 y 31.');
  if (!descripcion) return mostrarToast('Ingresá una descripción.');
  if (!fecha) return mostrarToast('Elegí una fecha.');
  try {
    const fila = await insertFactura({ dia_vencimiento: dia, descripcion, monto, fecha });
    state.facturas.unshift(fila);
    renderFacturas(state);
    renderDashboard(state);
    e.target.reset();
    precargarFechaHoy('factura-fecha');
  } catch (err) {
    mostrarToast('Error al agendar la factura: ' + err.message);
  }
});

// Click en el calendario del mes: precarga tanto el día de vencimiento
// como la fecha completa en el formulario de agendar, con la fecha de
// la celda clickeada.
document.getElementById('calendario-facturas').addEventListener('click', (e) => {
  const celda = e.target.closest('[data-fecha]');
  if (!celda) return;
  document.getElementById('factura-fecha').value = celda.dataset.fecha;
  document.getElementById('factura-dia').value = String(Number(celda.dataset.fecha.slice(8, 10)));
});

function resolverFacturaPendiente(query, facturas) {
  const q = query.toLowerCase();
  const matches = facturas.filter((f) => f.estado === 'pendiente' && f.descripcion.toLowerCase().includes(q));
  if (matches.length === 0) return { error: `No encontré ninguna factura pendiente que coincida con "${query}".` };
  if (matches.length > 1) return { error: `Encontré varias facturas que coinciden con "${query}": ${matches.map((m) => m.descripcion).join(', ')}. Sé más específico.` };
  return { factura: matches[0] };
}

document.getElementById('form-marcar-pagada').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('marcar-pagada-error');
  errorEl.hidden = true;
  const query = document.getElementById('factura-buscar').value.trim();
  if (!query) return;
  const resuelto = resolverFacturaPendiente(query, state.facturas);
  if (resuelto.error) {
    errorEl.textContent = resuelto.error;
    errorEl.hidden = false;
    return;
  }
  try {
    const actualizada = await marcarFacturaPagada(resuelto.factura.id);
    state.facturas = state.facturas.map((f) => (f.id === actualizada.id ? actualizada : f));
    renderFacturas(state);
    renderDashboard(state);
    e.target.reset();
    await notificarWhatsApp(`FinanzasApp: Factura '${actualizada.descripcion}' marcada como pagada`);
  } catch (err) {
    mostrarToast('Error al marcar como pagada: ' + err.message);
  }
});

document.getElementById('tab-facturas').addEventListener('click', async (e) => {
  const btnPagar = e.target.closest('[data-accion="marcar-pagada"]');
  const btnDeshacer = e.target.closest('[data-accion="deshacer-pago"]');
  const btnEliminar = e.target.closest('[data-accion="eliminar-factura"]');
  try {
    if (btnPagar) {
      const actualizada = await marcarFacturaPagada(btnPagar.dataset.id);
      state.facturas = state.facturas.map((f) => (f.id === actualizada.id ? actualizada : f));
      renderFacturas(state);
      renderDashboard(state);
      await notificarWhatsApp(`FinanzasApp: Factura '${actualizada.descripcion}' marcada como pagada`);
    } else if (btnDeshacer) {
      const actualizada = await deshacerPagoFactura(btnDeshacer.dataset.id);
      state.facturas = state.facturas.map((f) => (f.id === actualizada.id ? actualizada : f));
      renderFacturas(state);
      renderDashboard(state);
    } else if (btnEliminar) {
      if (!confirm('¿Eliminar esta factura?')) return;
      await deleteFactura(btnEliminar.dataset.id);
      state.facturas = state.facturas.filter((f) => f.id !== Number(btnEliminar.dataset.id));
      renderFacturas(state);
      renderDashboard(state);
    }
  } catch (err) {
    mostrarToast('Error: ' + err.message);
  }
});
// ---------------------------------------------------------------------
// Ahorros
// ---------------------------------------------------------------------
function holdingActual(tipo) {
  return state.ahorros.filter((a) => a.tipo === tipo).reduce((acc, a) => acc + Number(a.monto), 0);
}

document.getElementById('form-invertir').addEventListener('submit', async (e) => {
  e.preventDefault();
  const monto = Number(document.getElementById('invertir-monto').value);
  const tipo = document.getElementById('invertir-tipo').value;
  const fecha = document.getElementById('invertir-fecha').value;
  if (!(monto > 0)) return mostrarToast('El monto tiene que ser mayor a 0.');
  if (!fecha) return mostrarToast('Elegí una fecha.');
  try {
    const fila = await insertAhorro({ tipo, monto, rentabilidad_estimada: TIPOS_AHORRO[tipo], fecha });
    state.ahorros.unshift(fila);
    renderAhorros(state);
    e.target.reset();
    precargarFechaHoy('invertir-fecha');
  } catch (err) {
    mostrarToast('Error al invertir: ' + err.message);
  }
});

document.getElementById('form-retirar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('retirar-error');
  errorEl.hidden = true;
  const monto = Number(document.getElementById('retirar-monto').value);
  const tipo = document.getElementById('retirar-tipo').value;
  const fecha = document.getElementById('retirar-fecha').value;
  if (!(monto > 0)) return mostrarToast('El monto tiene que ser mayor a 0.');
  if (!fecha) return mostrarToast('Elegí una fecha.');
  const disponible = holdingActual(tipo);
  if (monto > disponible) {
    errorEl.textContent = `No tenés suficiente saldo en ${tipo} (disponible: ${formatMonto(disponible)}).`;
    errorEl.hidden = false;
    return;
  }
  try {
    const fila = await insertAhorro({ tipo, monto: -monto, rentabilidad_estimada: TIPOS_AHORRO[tipo], fecha });
    state.ahorros.unshift(fila);
    renderAhorros(state);
    e.target.reset();
    precargarFechaHoy('retirar-fecha');
  } catch (err) {
    mostrarToast('Error al retirar: ' + err.message);
  }
});

document.getElementById('form-analizador').addEventListener('submit', (e) => {
  e.preventDefault();
  const monto = Number(document.getElementById('analizador-monto').value);
  const dias = Number(document.getElementById('analizador-dias').value);
  if (!(monto > 0) || !(dias > 0)) return mostrarToast('Completá monto y días válidos.');
  renderAnalizador(monto, dias);
});

// ---------------------------------------------------------------------
// Recordatorios
// ---------------------------------------------------------------------
// Selector de día (dropdown 1-31) sincronizado con el date picker: cambiar
// uno actualiza el otro, conservando mes/año.
function diasEnMes(anio, mes) {
  return new Date(anio, mes, 0).getDate(); // mes 1-indexado acá
}

function sincronizarDiaDesdeFecha() {
  const fecha = document.getElementById('recordatorio-fecha').value;
  const selectDia = document.getElementById('recordatorio-dia');
  if (!fecha) return;
  selectDia.value = String(Number(fecha.slice(8, 10)));
}

function sincronizarFechaDesdeDia() {
  const selectDia = document.getElementById('recordatorio-dia');
  const inputFecha = document.getElementById('recordatorio-fecha');
  const diaElegido = Number(selectDia.value);
  if (!diaElegido) return;
  const base = inputFecha.value ? new Date(inputFecha.value + 'T00:00:00') : new Date();
  const anio = base.getFullYear();
  const mes = base.getMonth() + 1;
  const diaValido = Math.min(diaElegido, diasEnMes(anio, mes));
  inputFecha.value = `${anio}-${String(mes).padStart(2, '0')}-${String(diaValido).padStart(2, '0')}`;
}

document.getElementById('recordatorio-fecha').addEventListener('change', sincronizarDiaDesdeFecha);
document.getElementById('recordatorio-dia').addEventListener('change', sincronizarFechaDesdeDia);

// Click en el calendario de 30 días: precarga la fecha (y sincroniza el
// dropdown de día) sin que el usuario tenga que escribir nada.
document.getElementById('calendario-recordatorios').addEventListener('click', (e) => {
  const celda = e.target.closest('[data-fecha]');
  if (!celda) return;
  document.getElementById('recordatorio-fecha').value = celda.dataset.fecha;
  sincronizarDiaDesdeFecha();
});

// Combina los 3 selects de hora (1-12, minutos, AM/PM) a formato 24hs
// "HH:MM". Devuelve hora=null si no se eligió ninguno (sigue siendo
// opcional); devuelve error si se completó alguno pero no los tres.
function obtenerHoraSeleccionada() {
  const h = document.getElementById('recordatorio-hora-h').value;
  const m = document.getElementById('recordatorio-hora-m').value;
  const ampm = document.getElementById('recordatorio-hora-ampm').value;
  const completados = [h, m, ampm].filter((v) => v !== '').length;
  if (completados === 0) return { hora: null, error: null };
  if (completados < 3) return { hora: null, error: 'Completá hora, minutos y AM/PM, o dejá los tres en blanco.' };
  let hora24 = Number(h) % 12;
  if (ampm === 'PM') hora24 += 12;
  return { hora: `${String(hora24).padStart(2, '0')}:${String(Number(m)).padStart(2, '0')}`, error: null };
}

document.getElementById('form-recordatorio').addEventListener('submit', async (e) => {
  e.preventDefault();
  const descripcion = document.getElementById('recordatorio-descripcion').value.trim();
  const fecha = document.getElementById('recordatorio-fecha').value;
  if (!descripcion) return mostrarToast('Ingresá una descripción.');
  if (!fecha) return mostrarToast('Elegí una fecha.');
  const { hora, error: errorHora } = obtenerHoraSeleccionada();
  if (errorHora) return mostrarToast(errorHora);
  try {
    const fila = await insertRecordatorio({ fecha, hora, descripcion });
    const filaFinal = await sincronizarRecordatorioConCalendar(fila);
    state.recordatorios.unshift(filaFinal);
    renderRecordatorios(state);
    e.target.reset();
    await notificarWhatsApp(`FinanzasApp: Recordatorio: ${descripcion} para ${formatFecha(fecha)}`);
  } catch (err) {
    mostrarToast('Error al agendar el recordatorio: ' + err.message);
  }
});

document.getElementById('tabla-recordatorios').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-accion="eliminar-recordatorio"]');
  if (!btn) return;
  if (!confirm('¿Eliminar este recordatorio?')) return;
 const id = btn.dataset.id;
  try {
    const recordatorio = state.recordatorios.find((r) => r.id === id);
    if (recordatorio) await borrarEventoCalendarSiCorresponde(recordatorio);
    await deleteRecordatorio(id);
    state.recordatorios = state.recordatorios.filter((r) => r.id !== id);
    renderRecordatorios(state);
  } catch (err) {
    mostrarToast('Error al eliminar: ' + err.message);
  }
});

document.getElementById('tabla-recordatorios').addEventListener('change', async (e) => {
  const checkbox = e.target.closest('[data-accion="toggle-completado"]');
  if (!checkbox) return;
  const id = checkbox.dataset.id;
  const completado = checkbox.checked;
  try {
    const recordatorio = state.recordatorios.find((r) => r.id === id);
    let actualizada;
    if (completado && recordatorio && recordatorio.google_calendar_event_id) {
      await borrarEventoCalendarSiCorresponde(recordatorio);
      actualizada = await actualizarRecordatorio(id, { completado: true, google_calendar_event_id: null });
    } else {
      actualizada = await marcarRecordatorioCompletado(id, completado);
    }
    state.recordatorios = state.recordatorios.map((r) => (r.id === actualizada.id ? actualizada : r));
    renderRecordatorios(state);
  } catch (err) {
    checkbox.checked = !completado;
    mostrarToast('Error al actualizar: ' + err.message);
  }
});

// ---------------------------------------------------------------------
// Chat flotante
// ---------------------------------------------------------------------
function actualizarBadgeChat() {
  const badge = document.getElementById('chat-unread-badge');
  if (chatNoLeidos > 0) {
    badge.textContent = String(chatNoLeidos);
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

function abrirChat() {
  document.getElementById('chat-panel').hidden = false;
  chatNoLeidos = 0;
  actualizarBadgeChat();
}

document.getElementById('btn-chat-toggle').addEventListener('click', () => {
  const panel = document.getElementById('chat-panel');
  panel.hidden = !panel.hidden;
  if (!panel.hidden) abrirChat();
});

document.getElementById('btn-ajustes-ir-chat').addEventListener('click', abrirChat);
document.getElementById('btn-chat-close').addEventListener('click', () => {
  document.getElementById('chat-panel').hidden = true;
});

document.getElementById('form-chat').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('chat-input');
  const texto = input.value.trim();
  if (!texto) return;
  input.value = '';
  await manejarComandoChat(texto);
});

async function manejarComandoChat(texto) {
  const resultado = parseCommand(texto);
  let reply;
  let status;

  try {
    if (resultado.type === 'error') {
      reply = resultado.message;
      status = 'ERROR';
    } else if (resultado.type === 'gasto') {
      const fila = await insertGasto(resultado.payload);
      state.gastos.unshift(fila);
      renderGastos(state);
      renderDashboard(state);
      reply = `Gasto registrado: ${formatMonto(resultado.payload.monto)} en ${resultado.payload.categoria}.`;
      status = 'OK';
      if (resultado.payload.monto > 1000) await notificarWhatsApp(`FinanzasApp: Gasto registrado: ${formatMonto(resultado.payload.monto)} - ${resultado.payload.descripcion || resultado.payload.categoria}`);
    } else if (resultado.type === 'ingreso') {
      const fila = await insertIngreso(resultado.payload);
      state.ingresos.unshift(fila);
      renderIngresos(state);
      renderDashboard(state);
      reply = `Ingreso registrado: ${formatMonto(resultado.payload.monto)} en ${resultado.payload.categoria}.`;
      status = 'OK';
      if (resultado.payload.monto > 1000) await notificarWhatsApp(`FinanzasApp: Ingreso registrado: ${formatMonto(resultado.payload.monto)} - ${resultado.payload.descripcion || resultado.payload.categoria}`);
    } else if (resultado.type === 'factura') {
      const fila = await insertFactura(resultado.payload);
      state.facturas.unshift(fila);
      renderFacturas(state);
      renderDashboard(state);
      reply = `Factura agendada: ${resultado.payload.descripcion}, vence el día ${resultado.payload.dia_vencimiento}.`;
      status = 'OK';
    } else if (resultado.type === 'invertir') {
      const fila = await insertAhorro(resultado.payload);
      state.ahorros.unshift(fila);
      renderAhorros(state);
      reply = `Invertiste ${formatMonto(resultado.payload.monto)} en ${resultado.payload.tipo}${resultado.payload.rentabilidad_estimada != null ? ' (rentabilidad estimada ' + resultado.payload.rentabilidad_estimada + '%)' : ''}.`;
      status = 'OK';
    } else if (resultado.type === 'retiro') {
      const disponible = holdingActual(resultado.payload.tipo);
      if (resultado.payload.monto > disponible) {
        reply = `No tenés suficiente saldo en ${resultado.payload.tipo} (disponible: ${formatMonto(disponible)}).`;
        status = 'ERROR';
      } else {
        const fila = await insertAhorro({ ...resultado.payload, monto: -resultado.payload.monto });
        state.ahorros.unshift(fila);
        renderAhorros(state);
        reply = `Retiraste ${formatMonto(resultado.payload.monto)} de ${resultado.payload.tipo}.`;
        status = 'OK';
      }
    } else if (resultado.type === 'marcar_pagada') {
      const resuelto = resolverFacturaPendiente(resultado.payload.query, state.facturas);
      if (resuelto.error) {
        reply = resuelto.error;
        status = 'ERROR';
      } else {
        const actualizada = await marcarFacturaPagada(resuelto.factura.id);
        state.facturas = state.facturas.map((f) => (f.id === actualizada.id ? actualizada : f));
        renderFacturas(state);
        renderDashboard(state);
        reply = `Marcaste como pagada: ${actualizada.descripcion}.`;
        status = 'OK';
        await notificarWhatsApp(`FinanzasApp: Factura '${actualizada.descripcion}' marcada como pagada`);
      }
    } else if (resultado.type === 'recordatorio') {
      const fila = await insertRecordatorio(resultado.payload);
      const filaFinal = await sincronizarRecordatorioConCalendar(fila);
      state.recordatorios.unshift(filaFinal);
      renderRecordatorios(state);
      reply = `Recordatorio agendado: "${resultado.payload.descripcion}" para el ${formatFecha(resultado.payload.fecha)}${resultado.payload.hora ? ' a las ' + resultado.payload.hora : ''}.`;
      status = 'OK';
      await notificarWhatsApp(`FinanzasApp: Recordatorio: ${resultado.payload.descripcion} para ${formatFecha(resultado.payload.fecha)}`);
    }
  } catch (err) {
    console.error('Error procesando comando de chat:', err);
    reply = 'Ocurrió un error al guardar. Intentá de nuevo.';
    status = 'ERROR';
  }

  try {
    const filaLog = await insertChatLog({ command: texto, reply, status });
    state.chatLog.unshift(filaLog);
    renderChatLog(state);
    if (document.getElementById('chat-panel').hidden) {
      chatNoLeidos += 1;
      actualizarBadgeChat();
    }
  } catch (err) {
    console.error('Error guardando el chat_log:', err);
  }
}

init();
