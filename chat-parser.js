// Parser de comandos de texto para el chat flotante. Mismo tipo de
// gramática que usaría el futuro bot de WhatsApp/Telegram.
//
// parseCommand(texto) intenta cada regex en orden y devuelve:
//   { type: 'gasto' | 'ingreso' | 'factura' | 'invertir' | 'retiro' | 'marcar_pagada', payload }
//   { type: 'error', message }
//
// La ejecución real (llamar a supabase-client, armar la respuesta,
// loguear en chat_log y refrescar la UI) la hace el dispatcher en
// app.js, que sí tiene acceso al estado (por ejemplo para resolver
// "marcar pagada" contra la lista de facturas pendientes).

import { CATEGORIAS_GASTOS, CATEGORIAS_INGRESOS, TIPOS_AHORRO, matchCategoria, matchTipoAhorro } from './constants.js';

const GASTO_REGEX = /^gast[eéo]?\s+([\d.,]+)\s+([a-záéíóúñ]+)(?:\s+(.*))?$/i;
const INGRESO_REGEX = /^cobr[eéo]?\s+([\d.,]+)\s+([a-záéíóúñ]+)(?:\s+(.*))?$/i;
const FACTURA_CON_MONTO_REGEX = /^factura\s+([\d.,]+)\s+(.+?)\s+vence\s+(\d{1,2})$/i;
const FACTURA_SIN_MONTO_REGEX = /^factura\s+(.+?)\s+vence\s+(\d{1,2})$/i;
const INVERTIR_REGEX = /^inv(?:ertir|ierto|erti|est[ií]?)?\s+([\d.,]+)\s+(.+)$/i;
const RETIRO_REGEX = /^retir[eoa]?\s+([\d.,]+)(?:\s+(.+))?$/i;
const MARCAR_PAGADA_REGEX = /^marcar\s+pagad[ao]?\s+(.+)$/i;
const RECORDATORIO_REGEX = /^recordame\s+(?:a las\s+(\d{1,2})(?::(\d{2}))?\s+)?(.+?)(?:\s+el\s+(\d{1,2})(?:\/(\d{1,2}))?)?$/i;

export function parseMonto(texto) {
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

export function parseCommand(textoOriginal) {
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
        // Día y mes explícitos: si ya pasó este año, va al año que viene.
        mes = Number(m[5]);
        if (!(mes >= 1 && mes <= 12)) {
          return { type: 'error', message: `No entendí la fecha "el ${m[4]}/${m[5]}".` };
        }
        if (new Date(anio, mes - 1, dia) < hoySinHora) anio += 1;
      } else {
        // Sólo el día: si ya pasó este mes, va al mes que viene (misma
        // lógica de "próxima ocurrencia" que usan las facturas).
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
