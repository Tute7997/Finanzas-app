# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Comandos

No hay build, linter ni test runner — es un sitio estático sin `package.json` ni bundler. Los "comandos" son:

- **Correr el frontend localmente**: `npx serve .` o `python -m http.server 8000` desde la raíz. Hace falta un servidor HTTP real — los ES modules no cargan bien con `file://`.
- **Correr las funciones de `/api` localmente**: el servidor estático de arriba NO las sirve. Hace falta `vercel dev` (Vercel CLI) para probar de punta a punta cualquier cosa que dependa de `/api` (Google Calendar, SMS).
- **Chequeo de sintaxis de una función serverless**: `node --check api/archivo.js` (así se validó cada función nueva en esta sesión antes de desplegar).
- No hay tests automatizados. La verificación es manual: abrir en el navegador, revisar la consola, y ejercitar los flujos simulando `state` y llamando a `ui.renderAll(state)` con datos mock desde la consola del navegador (patrón usado en toda la sesión para no tocar datos reales de Supabase).

## Arquitectura

**Sin build tooling, a propósito.** Todo es ES modules cargados directo por `<script type="module">` en `index.html`; Chart.js y `@supabase/supabase-js` se cargan por `<script>` de CDN (UMD). Las funciones serverless de `/api` usan CommonJS (`module.exports`) y `fetch` nativo de Node — nunca se agregó una dependencia de npm ni un SDK (ni el de Twilio ni el de Google), justamente para no tener que sumar `package.json`/`node_modules` al proyecto. Si vas a agregar una integración nueva con una API externa, seguí ese mismo patrón (fetch directo a la REST API) salvo que se pida explícitamente lo contrario.

**Separación de responsabilidades entre archivos** (mapa, no exhaustivo):
- `app.js` es el único lugar con estado (`state`, un objeto módulo-level) y el único que conecta eventos del DOM con las demás capas. Orquesta todo: auth, carga de datos, dispatch del chat, sincronización con Google Calendar, envío de SMS.
- `ui.js` son funciones de render puras — reciben `state`, tocan el DOM, no llaman a Supabase ni manejan eventos.
- `supabase-client.js` es el único archivo del frontend que importa el SDK de Supabase. Expone `auth` + un fetcher/mutator por tabla. Los inserts nunca pasan `user_id` a mano (ver más abajo).
- `chat-parser.js` es puro: `parseCommand(texto)` devuelve `{type, payload}` o `{type:'error', message}`, sin tocar el DOM ni Supabase. `app.js` ejecuta el resultado. Espeja la gramática que en el futuro entendería un bot de WhatsApp/Telegram (`chat_log.source` ya soporta esos valores, ese bot todavía no está construido).
- `charts.js` tiene los gráficos de Chart.js y los calendarios de "mes actual" (`renderCalendarioMesActual`, compartida por Facturas y Recordatorios vía dos wrappers finos con distinto criterio de matching: día-del-mes recurrente para facturas, fecha puntual para recordatorios). Las celdas llevan `data-fecha`, que `app.js` usa para hacerlas clickeables.
- `google-calendar-client.js` y `google-config.js` son el lado cliente de la integración con Google Calendar (arman la URL de auth, refrescan tokens, llaman a la Calendar API con el access token — la Calendar API acepta CORS desde el browser).
- `api/` son las únicas funciones serverless (Vercel). `lib/twilio-server.js` es un helper compartido por dos de ellas — vive fuera de `api/` a propósito, para que Vercel no lo trate como una ruta pública.
- `index.html`, `privacy-policy.html` y `terms-of-service.html` viven en la raíz (no en `/public/` — este proyecto no tiene ningún framework que le dé significado especial a esa carpeta; Vercel sirve el repo tal cual). Las páginas legales son standalone (sin `app.js`, sin auth) pero reusan `styles.css` y el mismo `data-theme`/`localStorage` que la SPA para verse consistentes.

**Seguridad de datos vía RLS, no vía código cliente**: las tablas de datos (`ingresos`, `gastos`, `facturas`, `ahorros`, `recordatorios`, `chat_log`) tienen `user_id uuid default auth.uid()` en `schema.sql`, más políticas RLS que exigen `user_id = auth.uid()`. El cliente **nunca** manda `user_id` en los inserts — Postgres lo completa solo a partir de la sesión autenticada, y RLS rechaza cualquier fila que no coincida. Si ves código pasando `user_id` a mano desde el frontend, es una regresión, no una mejora.

**`actualizarUsuario` usa `upsert`, no `update`, a propósito**: si la fila de perfil no llegó a crearse (el trigger de `auth.users` no corrió a tiempo), un `update` fallaría con "Cannot coerce the result to a single JSON object" al no matchear ninguna fila. El `upsert` la crea si falta.

**`schema.sql` es acumulativo, no re-ejecutable de punta a punta**: las `alter table ... add column if not exists` sí son idempotentes, pero los `create policy` NO tienen `if not exists` (Postgres no lo soporta para policies). Cada bloque nuevo bajo un comentario `-- Ampliación: ...` está pensado para correrse una vez, como snippet aparte, en el SQL Editor de Supabase — no reejecutes el archivo completo en un proyecto que ya corrió versiones anteriores.

**Los secrets del servidor nunca viven en un archivo del repo, solo en variables de entorno de Vercel.** A esta altura son varios: `GOOGLE_CLIENT_SECRET`, `TWILIO_AUTH_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`. El patrón se repite en cada integración nueva: el archivo de config del cliente (`google-config.js`, etc.) solo tiene lo público (Client ID, URLs), y una función en `api/`/`lib/` lee el secret real de `process.env`. Ver el README para la lista completa y cómo configurar cada una.

**Google Calendar — el redirect_uri es un endpoint que solo reenvía, no procesa**: `api/auth/google/callback.js` (la ruta que se registra en Google Cloud Console) no hace el intercambio de tokens — solo reenvía `code`/`state` con un 302 a la raíz de la SPA. El intercambio real (que necesita el `client_secret`) lo hacen `api/google-token-exchange.js`/`api/google-token-refresh.js`, invocadas desde el cliente después del redirect. Este split evita que el endpoint público-conocido tenga que manejar lógica sensible.

**El cron de SMS de vencimientos es la única función que corre sin sesión de usuario**: `api/check-facturas-vencidas.js` (programada en `vercel.json`, invocada por Vercel, no por un navegador) usa la Supabase **Service Role Key** para bypassear RLS y consultar todas las cuentas — es la única función server-side de este proyecto con ese nivel de acceso. Cualquier función nueva que necesite leer datos de más de un usuario a la vez va a necesitar ese mismo patrón (y el mismo cuidado).

**Convención de signo en `ahorros`**: un retiro se guarda como una fila con `monto` **negativo** del mismo `tipo`. Sumar todas las filas de un tipo da el holding neto actual — no hay una columna separada de "movimiento". Cualquier código nuevo que toque `ahorros` tiene que respetar esta convención (ver `chat-parser.js`, `app.js`, `charts.js`).

**SMS son best-effort, nunca bloquean la acción principal**: `notificarSMS()` en `app.js` (igual que `sincronizarRecordatorioConCalendar`/`borrarEventoCalendarSiCorresponde` para Google Calendar) atrapa sus propios errores — si Twilio falla o el usuario no cargó teléfono, la fila igual se guarda. Seguí este mismo patrón para cualquier notificación/integración nueva que no sea el propósito central de la acción.

Ver `README.md` para el setup completo (Supabase, Google Cloud, Twilio, Vercel) y el alcance del producto.
