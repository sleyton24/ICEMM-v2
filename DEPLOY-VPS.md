# Deploy al VPS — Estrategia B (datos compartidos en PostgreSQL) + HTTPS + acceso restringido

> Objetivo: el monolito servido en el VPS existente, **conectado a la base PostgreSQL de ICEMM**
> (datos compartidos en vivo), por **HTTPS** y con **acceso restringido**. Multi-etapa, con
> dependencias. **[YO]** = lo hago en código acá; **[VOS]** = lo corrés en el VPS (no tengo acceso).
> Base: [CONEXION-POSTGRESQL.md](CONEXION-POSTGRESQL.md) y [ARQUITECTURA-DATOS.md](ARQUITECTURA-DATOS.md).

## Regla de oro
**No migrar datos a la base compartida hasta que estén recuperados y cuadrados con los Excel.**
La base pasa a ser la "fuente de verdad" multi-usuario; si entra incompleta, todos ven datos malos.

---

## Fase 0 — Datos correctos primero  `[VOS + YO]`
1. **Diagnóstico** (vos, consola del navegador): correr el snippet de recuperación → saber qué proyectos/actuals/respaldos hay.
2. **Recuperar** lo que falte (catálogo desde respaldo `budget-control:backup:*` o re-entrada; datos pesados desde los Excel).
3. **Cuadrar** con los Excel (Reporte Manager 16.644,79 UF · Mayor $491.082.321 · Balance −$175.229.402) y resolver los 3 fixes de reconciliación (costos de venta, doble EBITDA, conversión UF).
> Sin esto, las fases 3+ migran basura. Se puede hacer en paralelo con la Fase 1.

## Fase 1 — Backend ICEMM en el VPS, endurecido  `[VOS, con artefactos míos]`
Ya está preparado (sin commitear) en `ICEMM/backend`: 16 tablas nuevas en el schema + 12 route files + hardening.
En el VPS:
1. Traer el código del backend (git pull en el repo de ICEMM del VPS, o copiar los archivos preparados).
2. `.env`: `BETA_MODE=false`, `JWT_SECRET` aleatorio ≥32 chars, `CORS_ORIGIN=https://<dominio-del-monolito>`.
3. Crear admin real: `cd backend && npm run seed:user` (ANTES de cerrar beta, para no quedar bloqueado).
4. **Migrar la base** (crea las 16 tablas, NO toca las de ICEMM): `npx prisma migrate deploy` (o `migrate dev --name add_monolito_tables` la primera vez). Ver `ICEMM/backend/prisma/MONOLITO-TABLAS.md`.
5. `npm run build && pm2 restart icemm-api` (o equivalente). Verificar `GET /health` y `GET /api/projects` con token.

## Fase 2 — Cablear el `dataStore` en el monolito  `[YO]`
Hoy el `dataStore` está como esqueleto inactivo (flag `window.ICEMM_BACKEND='local'`). Falta:
1. Redefinir `storage.get/set` para leer/escribir un **caché en memoria** hidratado al arranque (mantiene los ~150 call sites síncronos sin reescribirlos).
2. Hidratación async al bootstrap: precargar del API las claves del año/contexto activo.
3. `ApiBackend` write-behind (cola/outbox) + concurrencia optimista para cierres.
> Se hace **después** de la Fase 1 (necesita el backend vivo para validarlo de verdad). Riesgoso: cambia el corazón de la persistencia → se prueba con smoke test antes de activar.

## Fase 3 — Migrar tus datos a la base  `[YO + VOS]`
1. Export del `localStorage` actual (menú → Respaldar, o `collectAllData`) — **ya recuperado y cuadrado** (Fase 0).
2. `POST /api/sync/import` sube ese JSON y lo upsertea en las 16 tablas (endpoint ya implementado).
3. Validar: comparar totales en la base vs los Excel (Check Contable contra el balance).

## Fase 4 — Servir el monolito en Nginx + HTTPS + acceso restringido  `[VOS, con mi config]`
1. Subir `fase1_proyectos.html` al VPS (git pull del repo `ICEMM-v2` con deploy key/token, o scp).
2. Nginx: nuevo `server`/`location` que sirve el HTML, con **TLS** (certbot) y **acceso restringido**
   (auth_basic, lista de IPs, o VPN). Mismo origen que `/api` para evitar CORS y permitir cookie httpOnly.
3. Template de Nginx (ajustar dominio):
```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name gestion.icemm.<tu-dominio>;     # subdominio del monolito

    ssl_certificate     /etc/letsencrypt/live/gestion.icemm.<tu-dominio>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gestion.icemm.<tu-dominio>/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # ── Acceso restringido (elegí UNO) ──
    # (a) Usuario/clave a nivel servidor (htpasswd):
    auth_basic "ICEMM - acceso restringido";
    auth_basic_user_file /etc/nginx/.htpasswd-icemm;
    # (b) o por IP:  allow 200.x.x.x;  deny all;

    root /var/www/icemm-gestion;                  # donde quede fase1_proyectos.html
    location / { try_files /fase1_proyectos.html =404; }

    # API en el MISMO origen (sin CORS): proxy a la app de ICEMM
    location /api/ { proxy_pass http://127.0.0.1:3001; proxy_set_header Host $host; }
}
# Redirect 80 → 443
server { listen 80; server_name gestion.icemm.<tu-dominio>; return 301 https://$host$request_uri; }
```
- `htpasswd -c /etc/nginx/.htpasswd-icemm <usuario>` para la auth básica.
- `sudo certbot --nginx -d gestion.icemm.<tu-dominio>` para el TLS.

## Fase 5 — Activar y verificar  `[YO + VOS]`
1. Flip `window.ICEMM_BACKEND='api'` (feature flag) — empezar con un usuario piloto, localStorage como caché/fallback.
2. Smoke test: login (JWT del backend), ver proyectos/actuals desde la base, cerrar un mes (transacción server-side).
3. Verificar cuadre (Check Contable) contra los Excel.
4. Rollback si algo falla: volver el flag a `'local'` (sigue andando con localStorage).

---

## Qué falta confirmar (vos)
- **Dominio/subdominio** para el monolito (ej. `gestion.icemm.tudominio.cl`). El VPS hoy es IP plana `187.127.29.98`; para TLS conviene un dominio.
- **Método de restricción**: auth_basic (usuario/clave) vs lista de IPs vs VPN.
- Cómo trae el VPS el repo privado `ICEMM-v2` (deploy key SSH — tenés `sanvest_deploy` — o token).

## Estado de preparación (al 2026-06-16)
- ✅ Schema Prisma (16 tablas) + endpoints REST (compilan) + dataStore skeleton + KEY_REGISTRY.
- ⏳ Falta: Fase 0 (datos), Fase 2 (cablear dataStore), Fase 3 (migración), Fase 4 (Nginx/TLS), Fase 5 (activar).

---

## Implementación concreta en TU VPS (Ubuntu 24.04 · Nginx · PM2 · Postgres local)
Datos confirmados: subdominio libre **`gestion.187.127.29.98.nip.io`**; backend ICEMM en
`/var/www/icemm/backend` (PM2 `icemm-api`, **:3001**, 21 días up); base **`icemm`** (Postgres 16 local,
user `icemm`, schema public); certbot instalado; deploy manual (copia/build + PM2 + Nginx).

### Bloque A — App estática online  (SEGURO, NO toca ICEMM — da la URL ya)
```bash
# como root en el VPS
mkdir -p /var/www/icemm-gestion
# subir fase1_proyectos.html (+ el logo si lo referencia) a /var/www/icemm-gestion/
#   opción git: git clone git@github.com:sleyton24/ICEMM-v2.git /tmp/icemm-v2 (deploy key) && cp /tmp/icemm-v2/fase1_proyectos.html /var/www/icemm-gestion/
#   opción copia: rsync/scp desde tu PC
cp deploy/nginx-gestion.conf /etc/nginx/sites-available/gestion
ln -s /etc/nginx/sites-available/gestion /etc/nginx/sites-enabled/gestion
command -v htpasswd || apt-get install -y apache2-utils
htpasswd -c /etc/nginx/.htpasswd-gestion gerencia      # crea el usuario "gerencia" (te pide clave)
nginx -t && systemctl reload nginx
certbot --nginx -d gestion.187.127.29.98.nip.io        # TLS + redirect 80→443
```
→ Queda **https://gestion.187.127.29.98.nip.io** con usuario/clave. **Datos aún por-navegador** hasta el Bloque B + wiring.

### Bloque B — 16 tablas + endpoints del monolito en la base `icemm`  (CUIDADO: toca el ICEMM vivo)
> ⚠️ Cambios ADITIVOS, pero con **backup + rollback** y test inmediato. NO traer la versión endurecida de
> `auth.ts` (fail-fast de `JWT_SECRET`) salvo que el `.env` del VPS ya tenga un `JWT_SECRET` ≥32 chars —
> si no, el backend no arranca y se cae ICEMM.
```bash
cd /var/www/icemm/backend
cp -r dist dist.bak-$(date +%F)            # rollback instantáneo
# Traer SOLO lo aditivo del monolito (lista abajo) a src/ y prisma/
npx prisma generate
npx prisma migrate deploy                  # crea las 16 tablas en la base icemm (additivo)
npm run build && pm2 restart icemm-api
curl -s localhost:3001/health              # ¿ICEMM sigue OK?
pm2 logs icemm-api --lines 30
# ROLLBACK: rm -rf dist && mv dist.bak-AAAA-MM-DD dist && pm2 restart icemm-api
```
Archivos a traer (en `ICEMM/backend/`): `prisma/schema.prisma` (extendido) + `src/routes/{budgetAnnual,actuals,
erpSource,projection,cashflow,obras,moduleSnapshot,cierres,savedReports,config,sync}.ts` (nuevos) + `src/index.ts`
(registra los routers) + `src/routes/projects.ts` (DTO extendido, aditivo).

> 🔧 Para que el Bloque B NO rompa ICEMM, necesito ver tu **backend VIVO** del VPS:
> `/var/www/icemm/backend/src/index.ts` y `/var/www/icemm/backend/prisma/schema.prisma`. Así te doy un
> **merge exacto** (solo agregar lo del monolito) en vez de un overwrite a ciegas que podría diferir del vivo.

### Después del Bloque B (lo hago yo):
Fase 2 (cablear dataStore → datos compartidos) · Fase 3 (migrar datos por `/api/sync/import`) · activar flag `api` + verificar cuadre.

---

## ✅ DEPLOY DEFINITIVO — Backend propio en la base `icemm` (schema aparte `gestion`, NO toca las tablas de ICEMM) ← USAR ESTE
Decisión: **no se toca ICEMM**. El monolito va con su propio stack al lado.

| | ICEMM (intacto) | Monolito (nuevo) |
|--|--|--|
| Proceso PM2 | `icemm-api` :3001 | **`gestion-api` :3002** |
| Código | `/var/www/icemm` | **`/var/www/gestion-api`** (carpeta `gestion-api/` del repo) |
| Base Postgres | base `icemm` · schema `public` | **misma base `icemm`** · schema **`gestion`** |
| Nginx | sites actuales | site nuevo `gestion.187.127.29.98.nip.io` |

> "Datos compartidos" = **todos los usuarios del monolito ven los mismos datos** (multi-usuario real),
> guardados EN la base **`icemm`** pero en un **schema aparte `gestion`** → las tablas de ICEMM (`public`) NO se tocan.
> Si más adelante el monolito necesita LEER datos reales de ICEMM (CargaERP, etc.), se agrega lectura cross-schema (solo lectura).

Pasos en el VPS (detalle en `gestion-api/README.md`):
1. **Schema aislado dentro de la base `icemm`** (NO se crea base nueva; el schema `public` de ICEMM no se toca):
   ```bash
   sudo -u postgres psql -d icemm -c "CREATE SCHEMA IF NOT EXISTS gestion;"
   sudo -u postgres psql -d icemm -c "CREATE USER gestion WITH PASSWORD '<clave>';"
   sudo -u postgres psql -d icemm -c "GRANT USAGE, CREATE ON SCHEMA gestion TO gestion;"
   sudo -u postgres psql -d icemm -c "ALTER DEFAULT PRIVILEGES IN SCHEMA gestion GRANT ALL ON TABLES TO gestion;"
   ```
   (El usuario `gestion` solo toca el schema `gestion`; sin acceso a `public`/ICEMM.)
2. **Backend propio:** copiar `gestion-api/` → `/var/www/gestion-api` · `npm ci` · `cp .env.example .env` (completar `DATABASE_URL` → base `icemm`/schema `gestion`, `JWT_SECRET` aleatorio ≥32, `CORS_ORIGIN`) · `npx prisma migrate deploy` (o `prisma db push` — crea las tablas SOLO en el schema `gestion`) · `npm run build` · `npm run seed:user -- --email=... --password='...' --rol=admin` · `pm2 start ecosystem.config.cjs && pm2 save` · `curl localhost:3002/health`.
3. **App + Nginx:** Bloque A de arriba (sube `fase1_proyectos.html` + `deploy/nginx-gestion.conf` + htpasswd + certbot). El config ya proxya `/api` → **:3002**.
4. **ICEMM:** cero cambios. Si `gestion-api` falla, ICEMM ni se entera.

### Después (lo hago yo)
Fase 2: cablear el `dataStore` del monolito a `/api` (datos compartidos en la base `icemm`/schema `gestion`). Fase 3: migrar tus datos (`/api/sync/import`). Activar flag `api` + verificar cuadre.
