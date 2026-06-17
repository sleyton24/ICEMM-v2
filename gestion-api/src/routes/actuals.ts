import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireRole } from '../middleware/auth.js'

/**
 * Gasto real itemizado del Reporte Manager, indexado por (year, month).
 * Modelo Actuals: UNIQUE(year, month). Montos en UF.
 *
 * Forma de cada row (catálogo ARQUITECTURA-DATOS.md §3 / budget-control:actuals:{year}:{mm}):
 *   { unCode, unDesc, mes, año, uf, exento, afecto, concepto, conceptoDesc, clasificacion, total }
 *
 * IMPORTANTE — CLASIFICACIÓN BLOQUEADA: este router NUNCA reclasifica server-side.
 * El mapeo 600/700/800 está en revisión contable, así que las filas se persisten
 * TAL CUAL llegan (incluido el campo `clasificacion` que ya traiga el cliente).
 */

const router = Router()

// ── Validación de params (year:int, month:1..12) ─────────────────────────────

const periodParamsSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
})

function parsePeriod(req: { params: any }) {
  return periodParamsSchema.safeParse(req.params)
}

// ── Validación de body ───────────────────────────────────────────────────────

// Las rows se persisten tal cual (clasificación bloqueada). Aceptamos cada fila
// como objeto abierto: el contrato lo fija el cliente y NO se transforma acá.
const rowSchema = z.record(z.any())

// PUT: carga completa del Reporte Manager (upsert idempotente por year,month).
const putActualsSchema = z.object({
  filename: z.string(),
  rows: z.array(rowSchema),
  // loadedBy opcional: si no viene, se usa req.user?.id (null en BETA_MODE).
  loadedBy: z.string().nullable().optional(),
})

// POST /load: ingesta cruda del Reporte Manager. Misma forma; persistimos igual.
const loadActualsSchema = z.object({
  filename: z.string(),
  rows: z.array(rowSchema),
  loadedBy: z.string().nullable().optional(),
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function toActualsDTO(a: any) {
  return {
    year: a.year,
    month: a.month,
    filename: a.filename,
    rows: a.rows,
    loadedAt: a.loadedAt.toISOString(),
    loadedBy: a.loadedById ?? null,
  }
}

/**
 * Resuelve el id de autor de la carga:
 *   - lo explícito en body.loadedBy si vino,
 *   - si no, el usuario autenticado (req.user.id),
 *   - null en BETA_MODE / sin sesión.
 */
function resolveLoadedById(req: any, bodyLoadedBy?: string | null): string | null {
  if (bodyLoadedBy !== undefined) return bodyLoadedBy
  return req.user?.id ?? null
}

/** Extrae el unCode de una fila tolerando string '02' o número 2. */
function rowUnCodeToInt(row: any): number | null {
  const raw = row?.unCode
  if (raw === undefined || raw === null || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
  return Number.isFinite(n) ? n : null
}

// ── GET /api/actuals/:year/:month ─────────────────────────────────────────────
// Idempotente: si aún no hay carga para ese período, devuelve un vacío sensato
// (no 404), porque "todavía no hay datos del año/mes" es un estado válido.

router.get('/:year/:month', async (req, res) => {
  const p = parsePeriod(req)
  if (!p.success) return res.status(400).json({ error: 'Período inválido', issues: p.error.issues })

  const { year, month } = p.data
  const actuals = await prisma.actuals.findUnique({ where: { year_month: { year, month } } })

  if (!actuals) {
    return res.json({ year, month, filename: null, rows: [], loadedAt: null, loadedBy: null })
  }
  res.json(toActualsDTO(actuals))
})

// ── PUT /api/actuals/:year/:month ─────────────────────────────────────────────
// Upsert idempotente por (year, month). Persiste rows TAL CUAL (sin reclasificar).

router.put('/:year/:month', requireRole('admin', 'editor'), async (req, res) => {
  const p = parsePeriod(req)
  if (!p.success) return res.status(400).json({ error: 'Período inválido', issues: p.error.issues })

  const parsed = putActualsSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues })

  const { year, month } = p.data
  const { filename, rows } = parsed.data
  const loadedById = resolveLoadedById(req, parsed.data.loadedBy)

  const saved = await prisma.actuals.upsert({
    where: { year_month: { year, month } },
    create: { year, month, filename, rows, loadedById },
    update: { filename, rows, loadedById, loadedAt: new Date() },
  })

  res.json(toActualsDTO(saved))
})

// ── POST /api/actuals/:year/:month/load ───────────────────────────────────────
// Ingesta de la carga del Reporte Manager. Persiste las filas TAL CUAL (NO
// reclasifica: clasificación bloqueada). Como cortesía, en la RESPUESTA marca
// las filas cuyo unCode NO existe como Project.unidadNegocioCodigo con
// "UN desconocida" — SIN descartarlas (siguen persistidas íntegras).

router.post('/:year/:month/load', requireRole('admin', 'editor'), async (req, res) => {
  const p = parsePeriod(req)
  if (!p.success) return res.status(400).json({ error: 'Período inválido', issues: p.error.issues })

  const parsed = loadActualsSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues })

  const { year, month } = p.data
  const { filename, rows } = parsed.data
  const loadedById = resolveLoadedById(req, parsed.data.loadedBy)

  // Persistir TAL CUAL (upsert idempotente). Nada de reclasificación server-side.
  const saved = await prisma.actuals.upsert({
    where: { year_month: { year, month } },
    create: { year, month, filename, rows, loadedById },
    update: { filename, rows, loadedById, loadedAt: new Date() },
  })

  // Diagnóstico (NO descarta filas): qué unCodes de la carga no tienen Project.
  const knownUNs = new Set(
    (
      await prisma.project.findMany({
        where: { unidadNegocioCodigo: { not: null } },
        select: { unidadNegocioCodigo: true },
      })
    ).map((pr) => pr.unidadNegocioCodigo as number),
  )

  const unknownUNs = new Set<string>()
  let unknownRows = 0
  for (const row of rows as any[]) {
    const code = rowUnCodeToInt(row)
    if (code === null || !knownUNs.has(code)) {
      unknownRows++
      unknownUNs.add(row?.unCode == null ? '' : String(row.unCode))
    }
  }

  res.json({
    ...toActualsDTO(saved),
    diagnostics: {
      totalRows: (rows as any[]).length,
      unknownRows,                       // filas con unCode no mapeado a un Project
      unknownUNs: [...unknownUNs],       // los unCode "UN desconocida" hallados
      note: 'Filas persistidas tal cual; clasificación NO modificada (bloqueada).',
    },
  })
})

export default router
