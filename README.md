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
index.html                    estructura de la app (auth + términos + 6 pestañas + chat)
styles.css                     estilos, variables de tema claro/oscuro
supabase-config.js              URL y anon key de tu proyecto Supabase
supabase-client.js               autenticación + CRUD de cada tabla
google-config.js                  Client ID y config pública de Google OAuth
google-calendar-client.js          OAuth + llamadas a la API de Google Calendar
constants.js                       categorías, tipos de ahorro, helpers de texto
chat-parser.js                      interpreta los comandos de texto del chat
charts.js                            gráficos (Chart.js) + calendarios de 30 días
ui.js                                 funciones de renderizado del DOM
app.js                                estado global, eventos, orquestación
schema.sql                            schema completo de Supabase (tablas + RLS)
api/google-token-exchange.js          función serverless: code → tokens de Google
api/google-token-refresh.js           función serverless: refresca el access token
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

## Google Calendar (opcional)

Después de registrarse, la app muestra una pantalla de Términos y Condiciones con la opción de conectar Google Calendar (también se puede conectar más tarde desde un botón en la pestaña Recordatorios). Esto sincroniza los recordatorios: se crean como eventos en tu Google Calendar y se borran cuando los marcás como completados.

Como esto necesita guardar un `refresh_token` de forma segura, requiere un `client_secret` de Google que **nunca** puede vivir en el frontend — por eso la app suma dos funciones serverless (`api/google-token-exchange.js` y `api/google-token-refresh.js`). Esto significa que **esta función solo anda desplegada en Vercel** (u otra plataforma con funciones serverless de Node) — no funciona sirviendo los archivos sueltos con `npx serve`/`python -m http.server`.

Setup:

1. Creá un proyecto en [Google Cloud Console](https://console.cloud.google.com/) y habilitá la **Google Calendar API** (APIs & Services > Library).
2. En **APIs & Services > Credentials**, creá un **OAuth 2.0 Client ID** de tipo **Web application**.
3. En **Authorized redirect URIs**, agregá la URL raíz exacta de tu app (con la barra final), por ejemplo `https://tu-app.vercel.app/` para producción y `http://localhost:8000/` (o el puerto que uses) para probar en local — tiene que coincidir exacto con lo que calcula `google-config.js` (`window.location.origin + window.location.pathname`).
4. Copiá el **Client ID** generado y pegalo en [`google-config.js`](google-config.js), en `GOOGLE_CLIENT_ID` (es público, no hay problema en commitearlo).
5. En Vercel, andá a **Settings > Environment Variables** de tu proyecto y cargá (nunca en un archivo del repo):
   ```
   GOOGLE_CLIENT_ID = (mismo valor que en google-config.js)
   GOOGLE_CLIENT_SECRET = (el Client Secret que te dio Google)
   GOOGLE_REDIRECT_URI = (la misma URL que registraste en el paso 3)
   ```
6. Redeployá. Las funciones en `api/` las levanta Vercel automáticamente, no hace falta configuración extra.

## Notas de diseño

- **Ahorros**: un retiro se guarda como una fila con `monto` negativo del mismo tipo de inversión. Sumar todas las filas de un tipo da el holding neto actual.
- **Saldo libre**: `ingresos totales - gastos totales - facturas pendientes`.
- **Gráfico de evolución de saldo**: es un saldo relativo (arranca en 0 doce meses atrás), no el saldo bancario real, porque no hay forma de conocer el saldo inicial histórico.
- Para volver a un Chart.js vendorizado localmente (sin depender del CDN), descargá `https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js` a `vendor/chart.umd.js` y cambiá el `<script src>` en `index.html`.
