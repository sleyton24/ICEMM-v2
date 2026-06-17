# gestion-api

Backend **standalone** del monolito de gestión presupuestaria (`fase1_proyectos.html`).
Es **100% independiente de ICEMM**: corre en su propio proceso, contra su propia base
PostgreSQL llamada `gestion`, en el puerto **3002**.

- Stack: Node + Express + Prisma + PostgreSQL (TypeScript, ESM).
- Auth: JWT (Bearer). `BETA_MODE=true` hace bypass total (solo QA cerrado).
- Persistencia: una base `gestion` propia. No comparte tablas ni datos con ICEMM.

> Nota: el schema trae también algunas tablas/rutas heredadas de ICEMM
> (PlanCuentas, MaestroProductos, etc.). En esta base quedan vacías y sin uso;
> el monolito solo consume sus ~12 endpoints (budget-annual, actuals, erp-source,
> projection, cashflow, obras, module-snapshot, cierres, saved-reports, config,
> sync, projects/auth/users).

## Estructura

```
gestion-api/
├── src/
│   ├── index.ts            # bootstrap Express, monta routers, /health
│   ├── db.ts               # PrismaClient singleton
│   ├── middleware/auth.ts  # JWT + BETA_MODE + requireRole
│   └── routes/             # un router por dominio
├── scripts/createUser.ts   # crear usuario admin inicial
├── prisma/schema.prisma    # 16 tablas del monolito + auth/proyectos
├── package.json
├── package-lock.json
├── tsconfig.json
├── ecosystem.config.cjs    # PM2
└── .env.example
```

## Variables de entorno (.env)

Copiar `.env.example` a `.env` y completar. Ver el archivo para el detalle.
Claves: `DATABASE_URL`, `PORT` (default 3002), `JWT_SECRET` (obligatorio, >=32
chars aleatorios), `CORS_ORIGIN`, `BETA_MODE`.

## Desarrollo local

```bash
npm install
npx prisma generate
npm run prisma:migrate      # crea/aplica migraciones contra tu DB local
npm run dev                 # tsx watch en :3002
```

## Deploy en el VPS

```bash
# 1) Postgres: usar la MISMA base de ICEMM ("icemm") en un SCHEMA aparte "gestion".
#    NO se crea base nueva; el schema "public" de ICEMM no se toca.
sudo -u postgres psql -d icemm <<'SQL'
CREATE SCHEMA IF NOT EXISTS gestion;
CREATE USER gestion WITH PASSWORD 'CAMBIAR_CLAVE';
GRANT USAGE, CREATE ON SCHEMA gestion TO gestion;
ALTER DEFAULT PRIVILEGES IN SCHEMA gestion GRANT ALL ON TABLES TO gestion;
SQL
# DATABASE_URL en .env: postgresql://gestion:CLAVE@localhost:5432/icemm?schema=gestion

# 2) Copiar la carpeta gestion-api/ al VPS (sin node_modules/dist/.env)
#    p.ej. con rsync o git archive.

# 3) Instalar dependencias (reproducible con el lockfile)
cd gestion-api
npm ci

# 4) Configurar entorno
cp .env.example .env
# editar .env: DATABASE_URL real, JWT_SECRET aleatorio (>=32),
#   CORS_ORIGIN, BETA_MODE=false
nano .env

# 5) Generar cliente Prisma y aplicar el schema a la base gestion
npx prisma generate
npx prisma migrate deploy    # si no hay migraciones aún, usar:
#   npx prisma migrate dev --name init   (en un entorno con shadow DB)
# alternativa sin migraciones: npx prisma db push

# 6) Compilar
npm run build

# 7) Crear el usuario admin inicial
npm run seed:user -- --email=admin@bnv.cl --password='UNA_CLAVE_FUERTE' --nombre='Admin' --rol=admin

# 8) Arrancar con PM2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup    # seguir la instrucción que imprime (arranque al boot)

# 9) Verificar
curl http://localhost:3002/health
```

### Nginx (reverse proxy, mismo origen que el frontend)

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3002/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
location = /health {
    proxy_pass http://127.0.0.1:3002/health;
}
```

Sirviendo frontend + API desde el mismo dominio (same-origin), `CORS_ORIGIN`
solo importa para clientes cross-site. Mantenelo apuntando al dominio real igual.
