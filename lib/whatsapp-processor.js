// Procesa comandos de WhatsApp del lado del servidor: parsea el texto y
// ejecuta la acción contra Supabase (vía lib/supabase-admin.js, con la
// Service Role Key). Es un puerto a CommonJS de chat-parser.js +
// constants.js + la rama de ejecución de manejarComandoChat() en app.js,
// necesario porque esos archivos son ES modules pensados para el
// browser (usan `export`, y manejarComandoChat además usa `document` y
// `state`) y una función serverless de Vercel en este repo corre como
// CommonJS puro.
//
// IMPORTANTE: si se cambia la gramática de comandos en chat-parser.js o
// las categorías/tipos en constants.js, hay que replicar el cambio acá
// a mano (mismo criterio que ya usa el proyecto para la convención de
// signo de "ahorros", documentada en varios archivos a la vez).

const db = require('./supabase-admin.js');

// ---------------------------------------------------------------------
// Constantes (puerto de constants.js)
// ---------------------------------------------------------------------
const CATEGORIAS_INGRESOS = ['Sueldo', 'Operaciones', 'Extras', 'Otro'];
const CATEGORIAS_GASTOS = ['Comida', 'Almacén', 'Nafta', 'Supermercado', 'Servicios', 'Salud', 'Otros'];

const TIPOS_AHORRO = {
  UALA: 19,
  Galicia: 16,
  Mercado: 15,
  'FIMA A': 24,
  'FIMA B': 26,
  'FIMA C': 22,
  Otro: null,
};

const DIACRITICO_DESDE = String.fromCharCode(768);
const DIACRITICO_HASTA = String.fromCharCode(879);
const DIACRITICOS_REGEX = new RegExp('[' + DIACRITICO_DESDE + '-' + DIACRITICO_HASTA + ']', 'g');

function normalizarTexto(texto) {
  return texto
    .normalize('NFD')
    .replace(DIACRITICOS_REGEX, '')
    .toLowerCase()
    .trim();
}

function matchCategoria(texto, categorias) {
  const normalizado = normalizarTexto(texto);
  return categorias.find((c) => normalizarTexto(c) === normalizado) || null;
}

function matchTipoAhorro(texto) {
  const normalizado = normalizarTexto(texto);
  const tipos = Object.keys(TIPOS_AHORRO);
  return tipos.find((t) => normalizarTexto(t) === normalizado) || null;
}

// ---------------------------------------------------------------------
// Parser de comandos (puerto de chat-parser.js)
// ---------------------------------------------------------------------
const GASTO_REGEX = /^gast[eéo]?\s+([\d.,]+)\s+([a-záéíóúñ]+)(?:\s+(.*))?$/i;
const INGRESO_REGEX = /^cobr[eéo]?\s+([\d.,]+)\s+([a-záéíóúñ]+)(?:\s+(.*))?$/i;
const FACTURA_CON_MONTO_REGEX = /^factura\s+([\d.,]+)\s+(.+?)\s+vence\s+(\d{1,2})$/i;
const FACTURA_SIN_MONTO_REGEX = /^factura\s+(.+?)\s+vence\s+(\d{1,2})$/i;
const INVERTIR_REGEX = /^inv(?:ertir|ierto|erti|est[ií]?)?\s+([\d.,]+)\s+(.+)$/i;
const RETIRO_REGEX = /^retir[eoa]?\s+([\d.,]+)(?:\s+(.+))?$/i;
const MARCAR_PAGADA_REGEX = /^marcar\s+pagad[ao]?\s+(.+)$/i;
const RECORDATORIO_REGEX = /^recordame\s+(?:a las\s+(\d{1,2})(?::(\d{2}))?\s+)?(.+?)(?:\s+el\s+(\d{1,2})(?:\/(\d{1,2}))?)?$/i;

function parseMonto(texto) {
  if (!texto) return NaN;
  let s = texto.trim();
  const tieneComa = s.includes(',');
  const tienePunto = s.includes('.');
  if (tieneComa && tienePunto) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (tieneComa) {
    s = s.replace(',', '.');
  }
  return Number(s);
}

function montoValido(monto) {
  return Number.isFinite(monto) && monto > 0;
}

function parseCommand(textoOriginal) {
  const texto = (textoOriginal || '').trim();
  if (!texto) return { type: 'error', message: 'Escribí un comando.' };

  let m;

  if ((m = texto.match(GASTO_REGEX))) {
    const monto = parseMonto(m[1]);
    if (!montoValido(monto)) return { type: 'error', message: `No entendí el monto "${m[1]}".` };
    const categoria = matchCategoria(m[2], CATEGORIAS_GASTOS) || 'Otros';
    const descripcion = (m[3] || '').trim() || null;
    return { type: 'gasto', payload: { monto, categoria, descripcion } };
  }

  if ((m = texto.match(INGRESO_REGEX))) {
    const monto = parseMonto(m[1]);
    if (!montoValido(monto)) return { type: 'error', message: `No entendí el monto "${m[1]}".` };
    const categoria = matchCategoria(m[2], CATEGORIAS_INGRESOS) || 'Otro';
    const descripcion = (m[3] || '').trim() || null;
    return { type: 'ingreso', payload: { monto, categoria, descripcion } };
  }

  if ((m = texto.match(FACTURA_CON_MONTO_REGEX))) {
    const monto = parseMonto(m[1]);
    const dia = Number(m[3]);
    if (!montoValido(monto)) return { type: 'error', message: `No entendí el monto "${m[1]}".` };
    if (!(dia >= 1 && dia <= 31)) return { type: 'error', message: `El día de vencimiento tiene que ser entre 1 y 31 (recibí "${m[3]}").` };
    return { type: 'factura', payload: { monto, descripcion: m[2].trim(), dia_vencimiento: dia } };
  }

  if ((m = texto.match(FACTURA_SIN_MONTO_REGEX))) {
    const dia = Number(m[2]);
    if (!(dia >= 1 && dia <= 31)) return { type: 'error', message: `El día de vencimiento tiene que ser entre 1 y 31 (recibí "${m[2]}").` };
    return { type: 'factura', payload: { monto: null, descripcion: m[1].trim(), dia_vencimiento: dia } };
  }

  if ((m = texto.match(INVERTIR_REGEX))) {
    const monto = parseMonto(m[1]);
    if (!montoValido(monto)) return { type: 'error', message: `No entendí el monto "${m[1]}".` };
    const tipo = matchTipoAhorro(m[2].trim()) || 'Otro';
    return { type: 'invertir', payload: { monto, tipo, rentabilidad_estimada: TIPOS_AHORRO[tipo] } };
  }

  if ((m = texto.match(RETIRO_REGEX))) {
    const monto = parseMonto(m[1]);
    if (!montoValido(monto)) return { type: 'error', message: `No entendí el monto "${m[1]}".` };
    const tipoTexto = (m[2] || '').trim();
    if (!tipoTexto) return { type: 'error', message: 'Decime de qué inversión querés retirar, ej: "retiro 10000 mercado".' };
    const tipo = matchTipoAhorro(tipoTexto);
    if (!tipo) return { type: 'error', message: `No reconozco el tipo de inversión "${tipoTexto}".` };
    return { type: 'retiro', payload: { monto, tipo, rentabilidad_estimada: TIPOS_AHORRO[tipo] } };
  }

  if ((m = texto.match(MARCAR_PAGADA_REGEX))) {
    return { type: 'marcar_pagada', payload: { query: m[1].trim() } };
  }

  if ((m = texto.match(RECORDATORIO_REGEX))) {
    const descripcion = m[3].trim();
    if (!descripcion) return { type: 'error', message: 'Decime qué querés que te recuerde.' };

    let hora = null;
    if (m[1] != null) {
      const hh = Number(m[1]);
      const mm = m[2] != null ? Number(m[2]) : 0;
      if (!(hh >= 0 && hh <= 23) || !(mm >= 0 && mm <= 59)) {
        return { type: 'error', message: `No entendí la hora "${m[1]}${m[2] ? ':' + m[2] : ''}".` };
      }
      hora = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }

    const hoy = new Date();
    const hoySinHora = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    let fecha;
    if (m[4] != null) {
      const dia = Number(m[4]);
      if (!(dia >= 1 && dia <= 31)) {
        return { type: 'error', message: `No entendí la fecha "el ${m[4]}${m[5] ? '/' + m[5] : ''}".` };
      }
      let anio = hoy.getFullYear();
      let mes;
      if (m[5] != null) {
        mes = Number(m[5]);
        if (!(mes >= 1 && mes <= 12)) {
          return { type: 'error', message: `No entendí la fecha "el ${m[4]}/${m[5]}".` };
        }
        if (new Date(anio, mes - 1, dia) < hoySinHora) anio += 1;
      } else {
        mes = hoy.getMonth() + 1;
        if (new Date(anio, mes - 1, dia) < hoySinHora) {
          mes += 1;
          if (mes > 12) {
            mes = 1;
            anio += 1;
          }
        }
      }
      fecha = `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    } else {
      fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    }

    return { type: 'recordatorio', payload: { descripcion, fecha, hora } };
  }

  return { type: 'error', message: `No entendí el comando "${texto}".` };
}

// ---------------------------------------------------------------------
// Formato de respuesta (puerto de los helpers de ui.js que usa app.js
// para armar los mismos textos que ya arma el chat web)
// ---------------------------------------------------------------------
function formatMonto(n) {
  const num = Number(n) || 0;
  const signo = num < 0 ? '-' : '';
  return signo + '$' + Math.abs(num).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatFecha(fechaStr) {
  if (!fechaStr) return '-';
  return new Date(fechaStr + 'T00:00:00').toLocaleDateString('es-AR');
}

// ---------------------------------------------------------------------
// Google Calendar (puerto server-side de refrescarTokenSiHaceFalta +
// crearEventoCalendar en google-calendar-client.js). A diferencia del
// browser, acá se pega directo a Google en vez de a las rutas propias
// /api/google-token-refresh (evitar un round-trip HTTP del backend a sí
// mismo), y el token refrescado se persiste directo en `usuarios` con
// la Service Role Key.
// ---------------------------------------------------------------------
const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

async function refrescarTokenSiHaceFalta(usuario) {
  const expiryMs = usuario.google_calendar_expiry ? new Date(usuario.google_calendar_expiry).getTime() : 0;
  const yaVenceOVencido = !expiryMs || expiryMs - Date.now() < 60 * 1000;
  if (!yaVenceOVencido) {
    return { accessToken: usuario.google_calendar_token, refrescado: false };
  }

  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('Google Calendar no está configurado en el servidor.');
  }
  const params = new URLSearchParams({
    refresh_token: usuario.google_calendar_refresh_token,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    grant_type: 'refresh_token',
  });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error_description || data.error || 'No se pudo refrescar la conexión con Google Calendar.');

  const expiry = new Date(Date.now() + data.expires_in * 1000).toISOString();
  await db.patch(`/usuarios?id=eq.${usuario.id}`, {
    google_calendar_token: data.access_token,
    google_calendar_expiry: expiry,
  });
  return { accessToken: data.access_token, refrescado: true, expiry };
}

function construirEvento({ descripcion, fecha, hora }) {
  if (hora) {
    const horaCorta = hora.slice(0, 5);
    const inicio = new Date(`${fecha}T${horaCorta}:00`);
    const fin = new Date(inicio.getTime() + 60 * 60 * 1000);
    const zona = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return {
      summary: descripcion,
      start: { dateTime: inicio.toISOString(), timeZone: zona },
      end: { dateTime: fin.toISOString(), timeZone: zona },
    };
  }
  const finDate = new Date(`${fecha}T00:00:00`);
  finDate.setDate(finDate.getDate() + 1);
  const finStr = finDate.toISOString().slice(0, 10);
  return {
    summary: descripcion,
    start: { date: fecha },
    end: { date: finStr },
  };
}

async function crearEventoCalendar(accessToken, { descripcion, fecha, hora }) {
  const res = await fetch(EVENTS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(construirEvento({ descripcion, fecha, hora })),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data.error && data.error.message) || 'No se pudo crear el evento en Google Calendar.');
  return data.id;
}

// Best-effort: si algo falla (token vencido/revocado, Google caído),
// el recordatorio queda guardado igual — mismo criterio que
// sincronizarRecordatorioConCalendar() en app.js.
async function sincronizarRecordatorioConCalendarServer(usuario, recordatorio) {
  if (!usuario.google_calendar_conectado) return recordatorio;
  try {
    const { accessToken } = await refrescarTokenSiHaceFalta(usuario);
    const eventId = await crearEventoCalendar(accessToken, {
      descripcion: recordatorio.descripcion,
      fecha: recordatorio.fecha,
      hora: recordatorio.hora,
    });
    const [actualizado] = await db.patch(`/recordatorios?id=eq.${recordatorio.id}`, { google_calendar_event_id: eventId });
    return actualizado || recordatorio;
  } catch (err) {
    console.error('Error sincronizando recordatorio de WhatsApp con Google Calendar:', err.message);
    return recordatorio;
  }
}

// ---------------------------------------------------------------------
// Ejecución de comandos (puerto de la rama try de manejarComandoChat en
// app.js, contra Supabase vía Service Role Key con user_id explícito)
// ---------------------------------------------------------------------
function resolverFacturaPendiente(query, facturas) {
  const q = query.toLowerCase();
  const matches = facturas.filter((f) => f.estado === 'pendiente' && f.descripcion.toLowerCase().includes(q));
  if (matches.length === 0) return { error: `No encontré ninguna factura pendiente que coincida con "${query}".` };
  if (matches.length > 1) return { error: `Encontré varias facturas que coinciden con "${query}": ${matches.map((m) => m.descripcion).join(', ')}. Sé más específico.` };
  return { factura: matches[0] };
}

async function holdingActual(userId, tipo) {
  const filas = await db.get(`/ahorros?user_id=eq.${userId}&tipo=eq.${encodeURIComponent(tipo)}&select=monto`);
  return filas.reduce((acc, a) => acc + Number(a.monto), 0);
}

async function ejecutarComando(usuario, resultado) {
  if (resultado.type === 'error') {
    return { reply: resultado.message, status: 'ERROR' };
  }

  if (resultado.type === 'gasto') {
    const { monto, categoria, descripcion } = resultado.payload;
    await db.post('/gastos', { user_id: usuario.id, categoria, descripcion, monto });
    return { reply: `Gasto registrado: ${formatMonto(monto)} en ${categoria}.`, status: 'OK' };
  }

  if (resultado.type === 'ingreso') {
    const { monto, categoria, descripcion } = resultado.payload;
    await db.post('/ingresos', { user_id: usuario.id, categoria, descripcion, monto });
    return { reply: `Ingreso registrado: ${formatMonto(monto)} en ${categoria}.`, status: 'OK' };
  }

  if (resultado.type === 'factura') {
    const { monto, descripcion, dia_vencimiento } = resultado.payload;
    await db.post('/facturas', { user_id: usuario.id, descripcion, monto, dia_vencimiento });
    return { reply: `Factura agendada: ${descripcion}, vence el día ${dia_vencimiento}.`, status: 'OK' };
  }

  if (resultado.type === 'invertir') {
    const { monto, tipo, rentabilidad_estimada } = resultado.payload;
    await db.post('/ahorros', { user_id: usuario.id, tipo, monto, rentabilidad_estimada });
    const rentabilidadTxt = rentabilidad_estimada != null ? ` (rentabilidad estimada ${rentabilidad_estimada}%)` : '';
    return { reply: `Invertiste ${formatMonto(monto)} en ${tipo}${rentabilidadTxt}.`, status: 'OK' };
  }

  if (resultado.type === 'retiro') {
    const { monto, tipo, rentabilidad_estimada } = resultado.payload;
    const disponible = await holdingActual(usuario.id, tipo);
    if (monto > disponible) {
      return { reply: `No tenés suficiente saldo en ${tipo} (disponible: ${formatMonto(disponible)}).`, status: 'ERROR' };
    }
    await db.post('/ahorros', { user_id: usuario.id, tipo, monto: -monto, rentabilidad_estimada });
    return { reply: `Retiraste ${formatMonto(monto)} de ${tipo}.`, status: 'OK' };
  }

  if (resultado.type === 'marcar_pagada') {
    const facturas = await db.get(`/facturas?user_id=eq.${usuario.id}&estado=eq.pendiente&select=*`);
    const resuelto = resolverFacturaPendiente(resultado.payload.query, facturas);
    if (resuelto.error) return { reply: resuelto.error, status: 'ERROR' };
    const hoy = new Date().toISOString().slice(0, 10);
    const [actualizada] = await db.patch(`/facturas?id=eq.${resuelto.factura.id}`, { estado: 'pagado', fecha_pago: hoy });
    return { reply: `Marcaste como pagada: ${actualizada.descripcion}.`, status: 'OK' };
  }

  if (resultado.type === 'recordatorio') {
    const { descripcion, fecha, hora } = resultado.payload;
    const [fila] = await db.post('/recordatorios', { user_id: usuario.id, descripcion, fecha, hora: hora || null });
    await sincronizarRecordatorioConCalendarServer(usuario, fila);
    const horaTxt = hora ? ` a las ${hora}` : '';
    return { reply: `Recordatorio agendado: "${descripcion}" para el ${formatFecha(fecha)}${horaTxt}.`, status: 'OK' };
  }

  return { reply: `No entendí el comando.`, status: 'ERROR' };
}

module.exports = { parseCommand, ejecutarComando };
