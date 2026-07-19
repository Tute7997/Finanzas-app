# FinanzasApp

App web de finanzas personales: Dashboard, Ingresos, Gastos, Facturas, Ahorros y Recordatorios, con backend en Supabase y un chat flotante que entiende comandos de texto (pensado para más adelante conectarlo también a WhatsApp/Telegram).

## Stack

- HTML / CSS / JavaScript puro, sin build tools (ES modules cargados directo por `<script type="module">`).
- [Supabase](https://supabase.com) (Postgres + Auth + Row Level Security) como backend.
- [Chart.js](https://www.chartjs.org/) cargado por CDN para los gráficos.

## Setup

1. Creá un proyecto nuevo en [supabase.com](https://supabase.com).
2. Abrí el **SQL Editor** del proyecto, pegá todo el contenido de [`schema.sql`](schema.sql) y ejecutalo. Esto crea las tablas, los índices, las políticas de Row Level Security y el trigger que arma el perfil de usuario al registrarse.
3. Andá a **Settings > API** y copiá el **Project URL** y la **anon public key**.
4. Abrí [`supabase-config.js`](supabase-config.js) y reemplazá `SUPABASE_URL` y `SUPABASE_ANON_KEY` por esos valores.
5. (Opcional, para probar más rápido) En **Authentication > Providers > Email**, podés desactivar "Confirm email" para no tener que confirmar el mail en cada cuenta de prueba.
6. Serví la carpeta con un servidor estático (los ES modules no funcionan bien abriendo el `index.html` directo con `file://`):
   ```bash
   npx serve .
   # o
   python -m http.server 8000
   ```
7. Abrí la URL que te de el servidor.

## Estructura

```
index.html            estructura de la app (auth + 6 pestañas + chat)
styles.css             estilos, variables de tema claro/oscuro
supabase-config.js      URL y anon key de tu proyecto Supabase
supabase-client.js       autenticación + CRUD de cada tabla
constants.js             categorías, tipos de ahorro, helpers de texto
chat-parser.js            interpreta los comandos de texto del chat
charts.js                  gráficos (Chart.js) + calendario de vencimientos
ui.js                      funciones de renderizado del DOM
app.js                     estado global, eventos, orquestación
schema.sql                 schema completo de Supabase (tablas + RLS)
```

## Alcance de esta versión

- Login con **email y contraseña** (no OTP por SMS, que requeriría configurar un proveedor como Twilio).
- Solo la web app. El bot de WhatsApp/Telegram (backend en Google Apps Script) queda para una próxima etapa — las tablas `recordatorios` y `chat_log.source` ya están preparadas para eso.
- El chat flotante SÍ es funcional: podés escribir comandos como los que entendería el futuro bot y se guardan en Supabase al instante. Ejemplos:
  - `gaste 1500 comida`
  - `cobre 50000 sueldo`
  - `factura 10000 telefono vence 9`
  - `invierto 5000 UALA`
  - `retiro 10000 mercado`
  - `marcar pagada telefono`
  - `recordame a las 18 ir al gym`
  - `recordame ir al gym el 25` (si no decís fecha, usa hoy; si el día ya pasó, va al mes/año que viene)

## Notas de diseño

- **Ahorros**: un retiro se guarda como una fila con `monto` negativo del mismo tipo de inversión. Sumar todas las filas de un tipo da el holding neto actual.
- **Saldo libre**: `ingresos totales - gastos totales - facturas pendientes`.
- **Gráfico de evolución de saldo**: es un saldo relativo (arranca en 0 doce meses atrás), no el saldo bancario real, porque no hay forma de conocer el saldo inicial histórico.
- Para volver a un Chart.js vendorizado localmente (sin depender del CDN), descargá `https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js` a `vendor/chart.umd.js` y cambiá el `<script src>` en `index.html`.
