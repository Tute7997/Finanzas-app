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
api/auth/google/callback.js           función serverless: redirect_uri registrado en Google, reenvía code/state a la SPA
api/send-sms.js                       función serverless: manda un SMS puntual vía Twilio
api/check-facturas-vencidas.js        función serverless (cron diario): SMS de facturas que vencen hoy
lib/twilio-server.js                  helper compartido por las dos funciones de arriba (no es una ruta)
vercel.json                           configuración del cron diario
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
3. En **Authorized redirect URIs**, agregá `https://tu-dominio/api/auth/google/callback` para cada dominio desde el que vayas a probar (por ejemplo `https://tu-app.vercel.app/api/auth/google/callback` para producción, y el que corresponda para cada preview de Vercel o para probar en local con `vercel dev`) — tiene que coincidir exacto con lo que calcula `google-config.js` (`window.location.origin + '/api/auth/google/callback'`). Ese endpoint es una función serverless (`api/auth/google/callback.js`) que solo reenvía `code`/`state` de vuelta a la app — no hace falta tocarla.
4. Copiá el **Client ID** generado y pegalo en [`google-config.js`](google-config.js), en `GOOGLE_CLIENT_ID` (es público, no hay problema en commitearlo).
5. En Vercel, andá a **Settings > Environment Variables** de tu proyecto y cargá (nunca en un archivo del repo):
   ```
   GOOGLE_CLIENT_ID = (mismo valor que en google-config.js)
   GOOGLE_CLIENT_SECRET = (el Client Secret que te dio Google)
   GOOGLE_REDIRECT_URI = (la misma URL que registraste en el paso 3)
   ```
6. Redeployá. Las funciones en `api/` las levanta Vercel automáticamente, no hace falta configuración extra.

## Notificaciones por SMS (opcional, Twilio)

Si cargás tu número en Ajustes (formato internacional, ej. `+5491122334455`), la app te manda un SMS en estos casos:

- Al agendar un recordatorio.
- Al marcar una factura como pagada.
- Al registrar un ingreso o un gasto de más de $1000.
- El día que vence una factura pendiente (vía un cron job diario de Vercel — no depende de que abras la app ese día).

Como con Google Calendar, esto necesita credenciales que nunca pueden vivir en el frontend, así que **solo funciona desplegado en Vercel**, no con el servidor estático local. Las funciones (`api/send-sms.js`, `api/check-facturas-vencidas.js`) llaman directo a la API REST de Twilio con `fetch` (sin el SDK de `npm`, para no sumarle build tooling al proyecto).

Setup:

1. En tu cuenta de [Twilio](https://www.twilio.com/), conseguí el **Account SID**, el **Auth Token** y un **número de Twilio** habilitado para SMS.
2. En Vercel, **Settings > Environment Variables**, cargá (nunca en un archivo del repo):
   ```
   TWILIO_ACCOUNT_SID = (tu Account SID)
   TWILIO_AUTH_TOKEN = (tu Auth Token)
   TWILIO_PHONE_NUMBER = (tu número de Twilio, con +código de país)
   ```
3. Para el cron de vencimientos (`api/check-facturas-vencidas.js`), que no corre con la sesión de ningún usuario, hace falta la **Service Role Key** de Supabase (Settings > API en tu proyecto de Supabase — **nunca** la anon key, y nunca en un archivo del repo) más la URL del proyecto:
   ```
   SUPABASE_URL = (la misma URL que ya usás en supabase-config.js)
   SUPABASE_SERVICE_ROLE_KEY = (la Service Role Key de Supabase — bypassea RLS, tratala con más cuidado todavía que el resto)
   ```
4. (Recomendado) Agregá también `CRON_SECRET` con un valor random — Vercel lo manda automáticamente como header al invocar el cron, y la función lo valida para que nadie más pueda dispararla a mano.
5. El cron ya está configurado en [`vercel.json`](vercel.json) para correr todos los días a las 12:00 UTC — ajustá el horario ahí si te conviene otro (los planes Hobby de Vercel piden mínimo una vez por día).
6. Redeployá.

## Notas de diseño

- **Ahorros**: un retiro se guarda como una fila con `monto` negativo del mismo tipo de inversión. Sumar todas las filas de un tipo da el holding neto actual.
- **Saldo libre**: `ingresos totales - gastos totales - facturas pendientes`.
- **Gráfico de evolución de saldo**: es un saldo relativo (arranca en 0 doce meses atrás), no el saldo bancario real, porque no hay forma de conocer el saldo inicial histórico.
- Para volver a un Chart.js vendorizado localmente (sin depender del CDN), descargá `https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js` a `vendor/chart.umd.js` y cambiá el `<script src>` en `index.html`.
