import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireRole } from '../middleware/auth.js'

const router = Router()

// ── ErpSource: Mayor / Balance / UF con dimensión de periodo ──────────────────
//
// Reemplaza las claves GLOBALES `mayor:latest` / `balance:latest` (que mezclaban
// años) dándoles año/mes. UNIQUE(tipo, year, month).
//
//   GET /api/erp-source/:tipo/:year/:month  → recurso o null (no 404 si aún no hay)
//   PUT /api/erp-source/:tipo/:year/:month  → upsert { payload, filename }
//
// El payload se persiste TAL CUAL llega (sin reclasificación server-side):
//   mayor:   { rows, ingresos:{byUN...}, months, totalCLP, totalUF, warnings }
//   balance: { accounts, totals, utilRow, sumasIguales, colsFound, ... }
//   uf:      { [month]:{ [day]: valorUF(CLP) } }

const ERP_TIPOS = ['mayor', 'balance', 'uf'] as const
type ErpTipo = typeof ERP_TIPOS[number]

// Valida :tipo (enum), :year (int), :month (1..12). Para 'uf' el payload puede
// cubrir el año entero, pero el par (year, month) sigue siendo la clave.
const paramsSchema = z.object({
  tipo: z.enum(ERP_TIPOS),
  year: z.coerce.number().int(),
  month: z.coerce.number().int().min(1).max(12),
})

const putBodySchema = z.object({
  payload: z.any(),
  filename: z.string().nullable().optional(),
})

function toErpSourceDTO(e: any) {
  return {
    tipo: e.tipo,
    year: e.year,
    month: e.month,
    payload: e.payload,
    filename: e.filename ?? null,
    loadedAt: e.loadedAt.toISOString(),
    loadedById: e.loadedById ?? null,
  }
}

// ── Read ───────────────────────────────────────────────────────────────────
// Idempotente: devuelve null si aún no hay datos para ese tipo/año/mes (no 404).

router.get('/:tipo/:year/:month', async (req, res) => {
  const parsed = paramsSchema.safeParse(req.params)
  if (!parsed.success) return res.status(400).json({ error: 'Parámetros inválidos', issues: parsed.error.issues })

  const { tipo, year, month } = parsed.data
  const source = await prisma.erpSource.findUnique({
    where: { tipo_year_month: { tipo, year, month } },
  })
  res.json(source ? toErpSourceDTO(source) : null)
})

// ── Upsert ───────────────────────────────────────────────────────────────────

router.put('/:tipo/:year/:month', requireRole('admin', 'editor'), async (req, res) => {
  const parsedParams = paramsSchema.safeParse(req.params)
  if (!parsedParams.success) return res.status(400).json({ error: 'Parámetros inválidos', issues: parsedParams.error.issues })

  const parsedBody = putBodySchema.safeParse(req.body)
  if (!parsedBody.success) return res.status(400).json({ error: 'Payload inválido', issues: parsedBody.error.issues })

  const { tipo, year, month } = parsedParams.data
  const { payload, filename } = parsedBody.data
  // Autoría: req.user.id (o null en BETA_MODE / sin sesión).
  const loadedById = req.user?.id ?? null

  const source = await prisma.erpSource.upsert({
    where: { tipo_year_month: { tipo, year, month } },
    create: { tipo, year, month, payload, filename: filename ?? null, loadedById },
    update: { payload, filename: filename ?? null, loadedById, loadedAt: new Date() },
  })

  res.json(toErpSourceDTO(source))
})

export default router
