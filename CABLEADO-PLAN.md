# Plan de cableado del monolito al backend (auth + datos) — `gestion-api`

> Objetivo: que el monolito use el backend `gestion-api` para **auth real** (bcrypt + JWT server-side,
> sin clave en el HTML) y para **datos compartidos** (base `gestion`, multi-usuario). Todo detrás de un
> **flag** (`window.ICEMM_BACKEND`) para no romper el modo actual (localStorage). Ver [DEPLOY-VPS.md](DEPLOY-VPS.md).

## Estado
- ✅ **Fix de seguridad aplicado:** se quitó la credencial embebida `esolar/icemm` del HTML. Ahora el admin
  semilla no trae contraseña y se define en el **primer ingreso** (modo local). El backend `gestion-api` ya
  hace la auth correcta (bcrypt + JWT + fail-fast + rate-limit + RBAC) — verificado.
- ⏳ **Pendiente:** cablear el login y el `dataStore` del monolito al backend (este plan).

> El `KEY_REGISTRY` (claves→endpoint) y el esqueleto `dataStore` (LocalBackend/ApiBackend, flag) ya existen en
> el monolito (aditivos, inactivos en modo `local`). El cableado los ACTIVA.

## Principio: flag `window.ICEMM_BACKEND`
- `'local'` (default) → comportamiento ACTUAL: localStorage + login client-side. **No cambia nada.**
- `'api'` → usa `gestion-api`: login server-side (JWT) + datos vía `/api`. localStorage queda como caché/fallback.
> Permite activar por usuario piloto y **rollback instantáneo** (volver el flag a `'local'`).

## Fase 2a — Auth contra el backend (elimina la clave del cliente)
1. **Login** (LoginScreen, modo `api`): POST `https://.../api/auth/login` `{email, password}` → recibe `{token, user}`.
   - Guardar el JWT en memoria + `sessionStorage` (no en localStorage persistente).
   - Si falla → mostrar error del backend (401/rate-limit).
2. **Bearer en todas las llamadas:** el `ApiBackend` del `dataStore` agrega `Authorization: Bearer <token>` (ya tiene el gancho; falta enchufar `getToken()`).
3. **Sesión:** al cargar, `GET /api/auth/me` para saber si el token sigue válido (o BETA_MODE); si expiró (7d) → re-login.
4. **Logout:** limpiar el token (memoria + sessionStorage).
5. **Usuarios:** el módulo Usuarios pasa a ser cliente de `/api/users` (crear/editar con bcrypt server-side).
> Resultado: **cero credenciales en el HTML**; el password se valida server-side con bcrypt; la sesión es un JWT firmado.

## Fase 2b — dataStore contra el backend (datos compartidos) — el paso delicado
El monolito tiene ~150 lecturas `storage.get` **síncronas** dentro de render/useMemo. No se pueden volver `await`
sin reescribir todo. Estrategia (ya diseñada en CONEXION-POSTGRESQL.md §5):
1. **Caché en memoria** (`snapshotCache`) que en modo `api` reemplaza a localStorage como fuente de lectura.
2. **Hidratación al bootstrap:** antes del primer render útil, precargar del API las claves del año/contexto
   activo (projects, budget/actuals/cashflow/overrides/… del año, config). `storage.get` lee del caché (sigue
   síncrono → los call sites NO cambian).
3. **Escritura write-behind:** `storage.set` escribe el caché + encola en una **outbox** que sincroniza al API
   (PUT idempotente, con reintento). El banner de error ya existe.
4. **Concurrencia optimista** (`updatedAt`/version + If-Match) para los recursos compartidos (cierres, saved-reports).
5. **Cierre = transacción server-side** (`POST /api/cierres/...`, ya implementado).
> ⚠️ Es el corazón de la persistencia: se construye con el flag en `'api'` y se **valida contra el backend VIVO**
> (no a ciegas). El modo `'local'` queda intacto como red de seguridad.

## Fase 2c — Migrar los datos actuales
1. Export del localStorage (menú → Respaldar / `collectAllData`) — **ya recuperado y cuadrado** (ver Fase 0 del deploy).
2. `POST /api/sync/import` (ya implementado) sube ese JSON y lo upsertea en la base `gestion`.
3. Validar: Check Contable contra los Excel.

## Validación y rollback
- **No se puede validar a ciegas:** la Fase 2b se prueba contra el `gestion-api` ya desplegado (:3002), con un
  **usuario piloto** y el flag en `'api'`. Smoke test: login (JWT), ver/editar datos desde la base, cerrar un mes.
- **Rollback:** volver `window.ICEMM_BACKEND='local'` → el monolito sigue funcionando con localStorage. Sin pérdida.

## Orden sugerido
1. (Vos) Desplegar `gestion-api` en el VPS (DEPLOY-VPS.md → stack independiente). Backend vivo en :3002.
2. (Yo) Construir Fase 2a (auth) + 2b (dataStore) detrás del flag, validando contra el backend desplegado.
3. (Yo+vos) Migrar datos (2c) + activar el flag para piloto + verificar cuadre.
4. Activar para todos.

## Nota sobre tu instalación actual (local)
Tu `localStorage` ya tiene el admin `esolar` con su contraseña vieja (la de antes) — **seguís entrando igual**.
El fix solo afecta el CÓDIGO (ya no expone la clave) y los entornos nuevos (definen la clave en el 1er uso).
Recomendado: cambiá la contraseña del admin desde el módulo **Usuarios** para rotar también la guardada localmente.
