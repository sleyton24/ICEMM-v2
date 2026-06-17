import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'

import { authMiddleware, softAuthMiddleware } from './middleware/auth.js'
import authRouter from './routes/auth.js'
import projectsRouter from './routes/projects.js'
import planCuentasRouter from './routes/planCuentas.js'
import usersRouter from './routes/users.js'

// ── Routers del monolito (control presupuestario "budget-control:*") ──────────
import budgetAnnualRouter from './routes/budgetAnnual.js'
import actualsRouter from './routes/actuals.js'
import erpSourceRouter from './routes/erpSource.js'
import projectionRouter from './routes/projection.js'
import cashflowRouter from './routes/cashflow.js'
import obrasRouter from './routes/obras.js'
import moduleSnapshotRouter from './routes/moduleSnapshot.js'
import cierresRouter from './routes/cierres.js'
import savedReportsRouter from './routes/savedReports.js'
import configRouter from './routes/config.js'
import syncRouter from './routes/sync.js'

const app = express()
const PORT = Number(process.env.PORT ?? 3002)
const BETA_MODE = process.env.BETA_MODE === 'true'

app.use(helmet())

// CORS: lista explícita de orígenes (separados por coma). NUNCA reflejar
// cualquier origen ('*' o `true`) junto con credentials:true — eso permitiría
// a cualquier sitio hacer peticiones autenticadas. Si CORS_ORIGIN no está
// definido, no se habilita ningún origen cross-site (solo same-origin vía Nginx).
const corsOrigins = (process.env.CORS_ORIGIN ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)
if (corsOrigins.length === 0) {
  console.warn(
    '[WARN] CORS_ORIGIN no definido: no se permitirán orígenes cross-site. ' +
      'Definir el/los dominios reales del frontend en CORS_ORIGIN.',
  )
}
app.use(cors({
  origin: corsOrigins,
  credentials: true,
}))
app.use(express.json({ limit: '50mb' }))   // archivos parseados pueden ser grandes
app.use(express.urlencoded({ extended: true, limit: '50mb' }))
app.use(morgan('tiny'))

// Rate limit general (proteger login y endpoints)
const limiter = rateLimit({ windowMs: 60_000, limit: 200, standardHeaders: true })
app.use(limiter)

import { prisma } from './db.js'

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({
      ok: true,
      beta: BETA_MODE,
      db: 'up',
      ts: new Date().toISOString(),
      uptime: process.uptime(),
    })
  } catch (e: any) {
    res.status(503).json({ ok: false, db: 'down', error: e.message })
  }
})

// Auth público (login/me) — login no exige auth previa.
// softAuth para que /me pueda detectar BETA_MODE y leer user si hay token.
app.use('/api/auth', softAuthMiddleware, authRouter)

// Rutas protegidas
app.use('/api/projects', authMiddleware, projectsRouter)
app.use('/api/plan-cuentas', authMiddleware, planCuentasRouter)
app.use('/api/users', authMiddleware, usersRouter)

// ── Routers del monolito (control presupuestario "budget-control:*") ──────────
// projection.ts y obras.ts montan en '/api' porque definen sus sub-rutas completas
// internamente (overrides/proj-completion/proj-snapshot, control-obras/plazo-curvas).
app.use('/api/budget-annual', authMiddleware, budgetAnnualRouter)
app.use('/api/actuals', authMiddleware, actualsRouter)
app.use('/api/erp-source', authMiddleware, erpSourceRouter)
app.use('/api', authMiddleware, projectionRouter)
app.use('/api/cashflow', authMiddleware, cashflowRouter)
app.use('/api', authMiddleware, obrasRouter)
app.use('/api/module-snapshot', authMiddleware, moduleSnapshotRouter)
app.use('/api/cierres', authMiddleware, cierresRouter)
app.use('/api/saved-reports', authMiddleware, savedReportsRouter)
app.use('/api/config', authMiddleware, configRouter)
app.use('/api/sync', authMiddleware, syncRouter)

// 404 + error handler
app.use((_req, res) => res.status(404).json({ error: 'Not found' }))
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({ error: err.message ?? 'Error interno' })
})

app.listen(PORT, () => {
  console.log(`Gestion API on :${PORT} | BETA_MODE=${BETA_MODE}`)
})
