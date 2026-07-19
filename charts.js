// Creación y actualización de los gráficos con Chart.js.
// Las instancias se crean UNA sola vez en initCharts() y después se
// actualizan con .update() (no se destruyen/recrean) para evitar
// parpadeos.

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const COLORES = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#db2777'];

// ---------------------------------------------------------------------
// Helpers de agregación (operan sobre los arrays ya cargados en state)
// ---------------------------------------------------------------------

// Devuelve los últimos `mesesBack` meses (incluyendo el actual) como
// [{ year, month, label }], del más viejo al más nuevo.
function ultimosMeses(mesesBack) {
  const hoy = new Date();
  const meses = [];
  for (let i = mesesBack - 1; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    meses.push({ year: d.getFullYear(), month: d.getMonth(), label: MESES_CORTOS[d.getMonth()] + ' ' + String(d.getFullYear()).slice(-2) });
  }
  return meses;
}

function sumaEnMes(rows, year, month) {
  return rows
    .filter((r) => {
      const f = new Date(r.fecha + 'T00:00:00');
      return f.getFullYear() === year && f.getMonth() === month;
    })
    .reduce((acc, r) => acc + Number(r.monto), 0);
}

export function groupByMonto6m(rows) {
  const meses = ultimosMeses(6);
  return {
    labels: meses.map((m) => m.label),
    data: meses.map((m) => sumaEnMes(rows, m.year, m.month)),
  };
}

export function groupByCategoria(rows) {
  const totales = {};
  for (const r of rows) {
    totales[r.categoria] = (totales[r.categoria] || 0) + Number(r.monto);
  }
  const labels = Object.keys(totales);
  return { labels, data: labels.map((l) => totales[l]) };
}

export function top5Categorias(rows) {
  const { labels, data } = groupByCategoria(rows);
  const combinado = labels.map((l, i) => ({ label: l, valor: data[i] })).sort((a, b) => b.valor - a.valor).slice(0, 5);
  return { labels: combinado.map((c) => c.label), data: combinado.map((c) => c.valor) };
}

// ---------------------------------------------------------------------
// initCharts: crea todas las instancias una sola vez
// ---------------------------------------------------------------------
export function initCharts() {
  const charts = {};

  charts.ingresosVsGastos = new Chart(document.getElementById('chart-ingresos-vs-gastos'), {
    type: 'bar',
    data: { labels: ['Mes anterior', 'Mes actual'], datasets: [
      { label: 'Ingresos', data: [0, 0], backgroundColor: COLORES[1] },
      { label: 'Gastos', data: [0, 0], backgroundColor: COLORES[2] },
    ] },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
  });

  charts.saldoEvolucion = new Chart(document.getElementById('chart-saldo-evolucion'), {
    type: 'line',
    data: { labels: [], datasets: [{ label: 'Saldo', data: [], borderColor: COLORES[0], backgroundColor: 'transparent', tension: 0.3 }] },
    options: { responsive: true, plugins: { legend: { display: false } } },
  });

  charts.ingresosPie = new Chart(document.getElementById('chart-ingresos-pie'), {
    type: 'pie',
    data: { labels: [], datasets: [{ data: [], backgroundColor: COLORES }] },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
  });

  charts.ingresosBar6m = new Chart(document.getElementById('chart-ingresos-bar6m'), {
    type: 'bar',
    data: { labels: [], datasets: [{ label: 'Ingresos', data: [], backgroundColor: COLORES[1] }] },
    options: { responsive: true, plugins: { legend: { display: false } } },
  });

  charts.gastosPie = new Chart(document.getElementById('chart-gastos-pie'), {
    type: 'pie',
    data: { labels: [], datasets: [{ data: [], backgroundColor: COLORES }] },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
  });

  charts.gastosTop5 = new Chart(document.getElementById('chart-gastos-top5'), {
    type: 'bar',
    data: { labels: [], datasets: [{ label: 'Top 5 categorías', data: [], backgroundColor: COLORES[2] }] },
    options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } } },
  });

  charts.gastosBar6m = new Chart(document.getElementById('chart-gastos-bar6m'), {
    type: 'bar',
    data: { labels: [], datasets: [{ label: 'Gastos', data: [], backgroundColor: COLORES[2] }] },
    options: { responsive: true, plugins: { legend: { display: false } } },
  });

  charts.ahorrosDona = new Chart(document.getElementById('chart-ahorros-dona'), {
    type: 'doughnut',
    data: { labels: [], datasets: [{ data: [], backgroundColor: COLORES }] },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
  });

  charts.ahorrosLinea12m = new Chart(document.getElementById('chart-ahorros-linea12m'), {
    type: 'line',
    data: { labels: [], datasets: [{ label: 'Saldo ahorrado', data: [], borderColor: COLORES[4], backgroundColor: 'transparent', tension: 0.3 }] },
    options: { responsive: true, plugins: { legend: { display: false } } },
  });

  return charts;
}

// ---------------------------------------------------------------------
// Updaters
// ---------------------------------------------------------------------
export function updateIngresosVsGastosChart(chart, ingresos, gastos) {
  const meses = ultimosMeses(2);
  chart.data.labels = meses.map((m) => m.label);
  chart.data.datasets[0].data = meses.map((m) => sumaEnMes(ingresos, m.year, m.month));
  chart.data.datasets[1].data = meses.map((m) => sumaEnMes(gastos, m.year, m.month));
  chart.update();
}

// Saldo acumulado (ingresos - gastos) mes a mes, arrancando en 0 doce
// meses atrás. Es un saldo relativo, no el saldo bancario real (no
// conocemos el saldo inicial histórico), pero muestra la tendencia.
export function updateSaldoEvolucionChart(chart, ingresos, gastos) {
  const meses = ultimosMeses(12);
  let acumulado = 0;
  const data = meses.map((m) => {
    acumulado += sumaEnMes(ingresos, m.year, m.month) - sumaEnMes(gastos, m.year, m.month);
    return acumulado;
  });
  chart.data.labels = meses.map((m) => m.label);
  chart.data.datasets[0].data = data;
  chart.update();
}

export function updateCategoriaPieChart(chart, rows) {
  const { labels, data } = groupByCategoria(rows);
  chart.data.labels = labels;
  chart.data.datasets[0].data = data;
  chart.update();
}

export function updateBar6mChart(chart, rows) {
  const { labels, data } = groupByMonto6m(rows);
  chart.data.labels = labels;
  chart.data.datasets[0].data = data;
  chart.update();
}

export function updateTop5Chart(chart, gastos) {
  const { labels, data } = top5Categorias(gastos);
  chart.data.labels = labels;
  chart.data.datasets[0].data = data;
  chart.update();
}

// Holding neto por tipo (invertir = +monto, retirar = -monto ya
// aplicado al guardar, así que sumar directo da el neto actual).
export function updateAhorrosDonaChart(chart, ahorros) {
  const totales = {};
  for (const a of ahorros) {
    totales[a.tipo] = (totales[a.tipo] || 0) + Number(a.monto);
  }
  const labels = Object.keys(totales).filter((t) => totales[t] > 0);
  chart.data.labels = labels;
  chart.data.datasets[0].data = labels.map((l) => totales[l]);
  chart.update();
}

export function updateAhorrosLineaChart(chart, ahorros) {
  const meses = ultimosMeses(12);
  let acumulado = ahorros
    .filter((a) => new Date(a.fecha + 'T00:00:00') < new Date(meses[0].year, meses[0].month, 1))
    .reduce((acc, a) => acc + Number(a.monto), 0);
  const data = meses.map((m) => {
    acumulado += sumaEnMes(ahorros, m.year, m.month);
    return acumulado;
  });
  chart.data.labels = meses.map((m) => m.label);
  chart.data.datasets[0].data = data;
  chart.update();
}

// ---------------------------------------------------------------------
// Calendario del mes actual (grilla HTML/CSS, no es un chart de Chart.js)
// ---------------------------------------------------------------------
function formatISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// items: filas ya filtradas por el caller (p.ej. sólo pendientes).
// matchFn(fechaCelda, item) => boolean decide si ese item marca ese día.
// Muestra siempre el mes calendario actual completo (día 1 hasta el
// último día del mes), no una ventana móvil desde hoy.
export function renderCalendarioMesActual(items, matchFn) {
  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mes = hoy.getMonth();
  const ultimoDia = new Date(anio, mes + 1, 0).getDate();
  const celdas = [];
  for (let dia = 1; dia <= ultimoDia; dia++) {
    const d = new Date(anio, mes, dia);
    const marcado = items.some((item) => matchFn(d, item));
    celdas.push(
      `<div class="calendario-celda${marcado ? ' calendario-celda--vence' : ''}" data-fecha="${formatISODate(d)}" title="${d.toLocaleDateString('es-AR')}">` +
        `<span class="calendario-dia">${dia}</span>${marcado ? '<span class="calendario-punto"></span>' : ''}` +
        `</div>`
    );
  }
  return `<div class="calendario-grid">${celdas.join('')}</div>`;
}

// Las facturas vencen todos los meses el mismo día (recurrencia por día-del-mes).
export function renderCalendarioFacturas(facturasPendientes) {
  return renderCalendarioMesActual(facturasPendientes, (d, f) => f.dia_vencimiento === d.getDate());
}

// Los recordatorios tienen una fecha puntual, no recurrente.
export function renderCalendarioRecordatorios(recordatoriosPendientes) {
  return renderCalendarioMesActual(recordatoriosPendientes, (d, r) => r.fecha === formatISODate(d));
}
