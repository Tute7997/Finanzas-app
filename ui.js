// Funciones de renderizado (vista). No hacen llamadas a Supabase ni
// manejan eventos — eso vive en app.js. Reciben `state` y actualizan
// el DOM y los gráficos en base a él.

import { TIPOS_AHORRO } from './constants.js';
import {
  updateIngresosVsGastosChart,
  updateSaldoEvolucionChart,
  updateCategoriaPieChart,
  updateBar6mChart,
  updateTop5Chart,
  updateAhorrosDonaChart,
  updateAhorrosLineaChart,
  renderCalendarioFacturas,
  renderCalendarioRecordatorios,
} from './charts.js';

export function formatMonto(n) {
  const num = Number(n) || 0;
  const signo = num < 0 ? '-' : '';
  return signo + '$' + Math.abs(num).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function formatFecha(fechaStr) {
  if (!fechaStr) return '-';
  return new Date(fechaStr + 'T00:00:00').toLocaleDateString('es-AR');
}

function esteMes(fechaStr) {
  const f = new Date(fechaStr + 'T00:00:00');
  const hoy = new Date();
  return f.getFullYear() === hoy.getFullYear() && f.getMonth() === hoy.getMonth();
}

function sumaMonto(rows) {
  return rows.reduce((acc, r) => acc + Number(r.monto || 0), 0);
}

// Días hasta el próximo vencimiento de una factura (0 = hoy).
function diasHastaVencimiento(diaVencimiento) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  let venc = new Date(hoy.getFullYear(), hoy.getMonth(), diaVencimiento);
  if (venc < hoy) venc = new Date(hoy.getFullYear(), hoy.getMonth() + 1, diaVencimiento);
  return Math.round((venc - hoy) / 86400000);
}

// ---------------------------------------------------------------------
// Navegación / tema
// ---------------------------------------------------------------------
export function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.toggle('is-active', btn.dataset.tab === tabName));
  document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.toggle('is-active', panel.id === 'tab-' + tabName));
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('finanzas-theme', theme);
  const btn = document.getElementById('btn-theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

export function renderUsuario(state) {
  const el = document.getElementById('usuario-nombre');
  if (el) el.textContent = state.usuario ? state.usuario.nombre || state.usuario.email : '';
}

// ---------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------
export function renderDashboard(state) {
  const totalIngresos = sumaMonto(state.ingresos);
  const totalGastos = sumaMonto(state.gastos);
  const pendientes = state.facturas.filter((f) => f.estado === 'pendiente');
  const pagadas = state.facturas.filter((f) => f.estado === 'pagado');
  const totalFacturasPendientes = sumaMonto(pendientes);
  const totalFacturasPagadas = sumaMonto(pagadas);
  const saldoLibre = totalIngresos - totalGastos - totalFacturasPendientes;
  const ingresosMes = sumaMonto(state.ingresos.filter((i) => esteMes(i.fecha)));
  const gastosMes = sumaMonto(state.gastos.filter((g) => esteMes(g.fecha)));

  document.getElementById('card-saldo').textContent = formatMonto(saldoLibre);
  document.getElementById('card-ingresos-mes').textContent = formatMonto(ingresosMes);
  document.getElementById('card-gastos-mes').textContent = formatMonto(gastosMes);
  document.getElementById('card-facturas-pendientes').textContent = formatMonto(totalFacturasPendientes);

  updateIngresosVsGastosChart(state.charts.ingresosVsGastos, state.ingresos, state.gastos);
  updateSaldoEvolucionChart(state.charts.saldoEvolucion, state.ingresos, state.gastos);

  // Próximas facturas por vencer
  const proximas = [...pendientes].sort((a, b) => diasHastaVencimiento(a.dia_vencimiento) - diasHastaVencimiento(b.dia_vencimiento)).slice(0, 5);
  const panelProximas = document.getElementById('panel-proximas-facturas');
  panelProximas.innerHTML = proximas.length
    ? proximas.map((f) => `<div class="panel-list-row"><span>${f.descripcion}</span><span>en ${diasHastaVencimiento(f.dia_vencimiento)}d · ${formatMonto(f.monto || 0)}</span></div>`).join('')
    : '<p class="panel-empty">No hay facturas pendientes.</p>';

  // Resumen de facturas
  const proximoVencimiento = proximas[0];
  document.getElementById('panel-resumen-facturas').innerHTML =
    `<div class="panel-list-row"><span>Total pagado</span><span>${formatMonto(totalFacturasPagadas)}</span></div>` +
    `<div class="panel-list-row"><span>Total pendiente</span><span>${formatMonto(totalFacturasPendientes)}</span></div>` +
    `<div class="panel-list-row"><span>Próximo vencimiento</span><span>${proximoVencimiento ? proximoVencimiento.descripcion + ' (día ' + proximoVencimiento.dia_vencimiento + ')' : '-'}</span></div>`;

  // Últimas transacciones
  const transacciones = [
    ...state.ingresos.map((i) => ({ ...i, tipo: 'Ingreso', signo: 1 })),
    ...state.gastos.map((g) => ({ ...g, tipo: 'Gasto', signo: -1 })),
  ]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5);
  const panelUltimas = document.getElementById('panel-ultimas-transacciones');
  panelUltimas.innerHTML = transacciones.length
    ? transacciones
        .map((t) => `<div class="panel-list-row"><span>${t.tipo}: ${t.categoria}${t.descripcion ? ' — ' + t.descripcion : ''}</span><span>${t.signo > 0 ? '+' : '-'}${formatMonto(Math.abs(t.monto))}</span></div>`)
        .join('')
    : '<p class="panel-empty">Todavía no hay movimientos.</p>';
}

// ---------------------------------------------------------------------
// Ingresos
// ---------------------------------------------------------------------
export function renderIngresos(state) {
  const tbody = document.getElementById('tabla-ingresos');
  tbody.innerHTML = state.ingresos
    .map(
      (i) =>
        `<tr><td>${i.categoria}</td><td>${i.descripcion || '-'}</td><td>${formatMonto(i.monto)}</td><td>${formatFecha(i.fecha)}</td>` +
        `<td><button class="tabla-eliminar" data-accion="eliminar-ingreso" data-id="${i.id}">🗑️</button></td></tr>`
    )
    .join('');
  document.getElementById('ingresos-total').textContent = formatMonto(sumaMonto(state.ingresos));

  updateCategoriaPieChart(state.charts.ingresosPie, state.ingresos);
  updateBar6mChart(state.charts.ingresosBar6m, state.ingresos);
}

// ---------------------------------------------------------------------
// Gastos
// ---------------------------------------------------------------------
export function renderGastos(state) {
  const tbody = document.getElementById('tabla-gastos');
  tbody.innerHTML = state.gastos
    .map(
      (g) =>
        `<tr><td>${g.categoria}</td><td>${g.descripcion || '-'}</td><td>${formatMonto(g.monto)}</td><td>${formatFecha(g.fecha)}</td>` +
        `<td><button class="tabla-eliminar" data-accion="eliminar-gasto" data-id="${g.id}">🗑️</button></td></tr>`
    )
    .join('');
  document.getElementById('gastos-total').textContent = formatMonto(sumaMonto(state.gastos));

  const subtotales = {};
  for (const g of state.gastos) subtotales[g.categoria] = (subtotales[g.categoria] || 0) + Number(g.monto);
  document.getElementById('gastos-subtotales').innerHTML = Object.entries(subtotales)
    .map(([cat, total]) => `<span class="subtotal-chip">${cat}: ${formatMonto(total)}</span>`)
    .join('');

  updateCategoriaPieChart(state.charts.gastosPie, state.gastos);
  updateTop5Chart(state.charts.gastosTop5, state.gastos);
  updateBar6mChart(state.charts.gastosBar6m, state.gastos);
}

// ---------------------------------------------------------------------
// Facturas
// ---------------------------------------------------------------------
export function renderFacturas(state) {
  const pendientes = state.facturas.filter((f) => f.estado === 'pendiente').sort((a, b) => diasHastaVencimiento(a.dia_vencimiento) - diasHastaVencimiento(b.dia_vencimiento));
  const pagadas = state.facturas.filter((f) => f.estado === 'pagado').sort((a, b) => new Date(b.fecha_pago) - new Date(a.fecha_pago));

  document.getElementById('facturas-pendientes').innerHTML = pendientes.length
    ? pendientes
        .map(
          (f) =>
            `<div class="factura-card factura-card--pendiente">` +
            `<div class="factura-card-info"><span class="factura-card-nombre">${f.descripcion}</span><span class="factura-card-meta">Día ${f.dia_vencimiento} · en ${diasHastaVencimiento(f.dia_vencimiento)}d · ${formatMonto(f.monto || 0)}</span></div>` +
            `<div class="factura-card-acciones">` +
            `<button class="btn btn-secondary" data-accion="marcar-pagada" data-id="${f.id}">Marcar pagada</button>` +
            `<button class="tabla-eliminar" data-accion="eliminar-factura" data-id="${f.id}">🗑️</button>` +
            `</div>` +
            `</div>`
        )
        .join('')
    : '<p class="panel-empty">No hay facturas pendientes.</p>';

  document.getElementById('facturas-pagadas').innerHTML = pagadas.length
    ? pagadas
        .map(
          (f) =>
            `<div class="factura-card factura-card--pagada">` +
            `<div class="factura-card-info"><span class="factura-card-nombre">${f.descripcion}</span><span class="factura-card-meta">${formatMonto(f.monto || 0)} · pagada el ${formatFecha(f.fecha_pago)}</span></div>` +
            `<div class="factura-card-acciones">` +
            `<button class="btn btn-secondary" data-accion="deshacer-pago" data-id="${f.id}">Deshacer pago</button>` +
            `<button class="tabla-eliminar" data-accion="eliminar-factura" data-id="${f.id}">🗑️</button>` +
            `</div>` +
            `</div>`
        )
        .join('')
    : '<p class="panel-empty">No hay facturas pagadas todavía.</p>';

  const totalPendiente = sumaMonto(pendientes);
  const totalPagado = sumaMonto(pagadas);
  const proximo = pendientes[0];
  document.getElementById('facturas-resumen').innerHTML =
    `<div class="panel-list-row"><span>Total pagado</span><span>${formatMonto(totalPagado)}</span></div>` +
    `<div class="panel-list-row"><span>Total pendiente</span><span>${formatMonto(totalPendiente)}</span></div>` +
    `<div class="panel-list-row"><span>Próximo vencimiento</span><span>${proximo ? proximo.descripcion + ' (día ' + proximo.dia_vencimiento + ')' : '-'}</span></div>`;

  document.getElementById('calendario-facturas').innerHTML = renderCalendarioFacturas(pendientes);
}

// ---------------------------------------------------------------------
// Ahorros
// ---------------------------------------------------------------------
export function renderAhorros(state) {
  const tbody = document.getElementById('tabla-ahorros');
  tbody.innerHTML = state.ahorros
    .map(
      (a) =>
        `<tr><td>${a.tipo}</td><td>${formatMonto(a.monto)}</td><td>${a.rentabilidad_estimada != null ? a.rentabilidad_estimada + '%' : '-'}</td><td>${formatFecha(a.fecha)}</td><td></td></tr>`
    )
    .join('');

  updateAhorrosDonaChart(state.charts.ahorrosDona, state.ahorros);
  updateAhorrosLineaChart(state.charts.ahorrosLinea12m, state.ahorros);
}

export function renderAnalizador(monto, dias) {
  const filas = Object.entries(TIPOS_AHORRO)
    .filter(([, pct]) => pct != null)
    .map(([tipo, pct]) => {
      const ganancia = monto * (pct / 100) * (dias / 365);
      return { tipo, pct, ganancia, total: monto + ganancia };
    })
    .sort((a, b) => b.ganancia - a.ganancia);

  document.getElementById('analizador-resultado').innerHTML = filas
    .map((f) => `<div class="panel-list-row"><span>${f.tipo} (${f.pct}% anual)</span><span>+${formatMonto(f.ganancia)} → ${formatMonto(f.total)}</span></div>`)
    .join('');
}

// ---------------------------------------------------------------------
// Recordatorios
// ---------------------------------------------------------------------
export function renderRecordatorios(state) {
  const ordenados = [...state.recordatorios].sort((a, b) => {
    const cmp = a.fecha.localeCompare(b.fecha);
    if (cmp !== 0) return cmp;
    return (a.hora || '99:99').localeCompare(b.hora || '99:99');
  });

  const tbody = document.getElementById('tabla-recordatorios');
  tbody.innerHTML = ordenados
    .map((r) => {
      const filaClase = r.completado ? 'fila-recordatorio--completado' : 'fila-recordatorio--pendiente';
      return (
        `<tr class="${filaClase}">` +
        `<td>${formatFecha(r.fecha)}</td>` +
        `<td>${r.hora ? r.hora.slice(0, 5) : '-'}</td>` +
        `<td class="recordatorio-descripcion">${r.descripcion}</td>` +
        `<td><input type="checkbox" data-accion="toggle-completado" data-id="${r.id}" ${r.completado ? 'checked' : ''} /></td>` +
        `<td><button class="tabla-eliminar" data-accion="eliminar-recordatorio" data-id="${r.id}">🗑️</button></td>` +
        `</tr>`
      );
    })
    .join('');

  const pendientes = state.recordatorios.filter((r) => !r.completado);
  document.getElementById('calendario-recordatorios').innerHTML = renderCalendarioRecordatorios(pendientes);
}

// ---------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------
export function renderAjustes(state) {
  document.getElementById('ajustes-nombre').value = (state.usuario && state.usuario.nombre) || '';
  document.getElementById('ajustes-email').value = (state.usuario && state.usuario.email) || '';
  document.getElementById('ajustes-telefono').value = (state.usuario && state.usuario.phone_number) || '';

  const conectado = Boolean(state.usuario && state.usuario.google_calendar_conectado);
  document.getElementById('ajustes-calendar-estado').textContent = conectado ? 'Conectado ✅' : 'No conectado ❌';
  document.getElementById('btn-ajustes-conectar-calendar').hidden = conectado;
  document.getElementById('btn-ajustes-desconectar-calendar').hidden = !conectado;

  const whatsappConectado = Boolean(state.usuario && state.usuario.phone_number);
  document.getElementById('ajustes-whatsapp-estado').textContent = whatsappConectado ? 'Conectado ✅' : 'No conectado ❌';
}

// ---------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------
function formatHora(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

export function renderChatLog(state) {
  const cont = document.getElementById('chat-messages');
  const cronologico = [...state.chatLog].reverse();
  cont.innerHTML = cronologico
    .map(
      (c) =>
        `<div class="chat-msg chat-msg--user">🟢 Usuario: ${c.command}<span class="chat-msg-hora">${formatHora(c.ts)}</span></div>` +
        `<div class="chat-msg ${c.status === 'ERROR' ? 'chat-msg--error' : 'chat-msg--ok'}">${c.reply || ''}<span class="chat-msg-hora">${formatHora(c.ts)}</span></div>`
    )
    .join('');
  cont.scrollTop = cont.scrollHeight;
}

// ---------------------------------------------------------------------
// Render completo
// ---------------------------------------------------------------------
export function renderAll(state) {
  renderUsuario(state);
  renderDashboard(state);
  renderIngresos(state);
  renderGastos(state);
  renderFacturas(state);
  renderAhorros(state);
  renderRecordatorios(state);
  renderAjustes(state);
  renderChatLog(state);
}
