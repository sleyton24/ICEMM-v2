import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireRole } from '../middleware/auth.js'

const router = Router()

// El array `budget-control:saved-reports:{year}` del monolito mezcla 3 formas
// distintas (report | projResumen | cashflow) en el mismo arreglo; cada uno de
// los 3 módulos (Informe, Proyecciones, Flujo) filtra "su" tipo. Aquí lo
// normalizamos con un discriminador `tipo` explícito en vez de inferirlo por
// presencia de campo.
const TIPOS = ['report', 'projResumen', 'cashflow'] as const
type SavedReportTipo = typeof TIPOS[number]

// ── Validación ────────────────────────────────────────────────────────────────

const yearSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
})

const tipoQuerySchema = z.object({
  tipo: z.enum(TIPOS).optional(),
})

const createSchema = z.object({
  tipo: z.enum(TIPOS),
  label: z.string().min(1),
  cutoffDate: z.string().nullable().optional(),
  controlMonth: z.number().int().min(1).max(12).nullable().optional(),
  // El sub-objeto report | projResumen | cashflow según `tipo`. Forma libre:
  // se persiste tal cual lo manda el módulo, sin reinterpretarlo server-side.
  payload: z.any(),
})

// ── List / create / delete ─────────────────────────────────────────────────────

// GET /api/saved-reports/:year  (lista; opcional ?tipo=)
router.get('/:year', async (req, res) => {
  const params = yearSchema.safeParse(req.params)
  if (!params.success) return res.status(400).json({ error: 'year inválido' })

  const query = tipoQuerySchema.safeParse(req.query)
  if (!query.success) return res.status(400).json({ error: 'tipo inválido' })

  try {
    const where: { year: number; tipo?: SavedReportTipo } = { year: params.data.year }
    if (query.data.tipo) where.tipo = query.data.tipo

    const rows = await prisma.savedReport.findMany({
      where,
      orderBy: { savedAt: 'desc' },
    })
    // Idempotente: si aún no hay informes guardados del año, devolvemos [] (no 404).
    res.json(rows.map(toSavedReportDTO))
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Error interno' })
  }
})

// POST /api/saved-reports/:year  (crear)
router.post('/:year', requireRole('admin', 'editor'), async (req, res) => {
  const params = yearSchema.safeParse(req.params)
  if (!params.success) return res.status(400).json({ error: 'year inválido' })

  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues })

  try {
    const d = parsed.data
    // Autoría: req.user.id (null en BETA_MODE).
    const savedById = req.user?.id ?? null

    const created = await prisma.savedReport.create({
      data: {
        year: params.data.year,
        tipo: d.tipo,
        label: d.label,
        cutoffDate: d.cutoffDate ?? null,
        controlMonth: d.controlMonth ?? null,
        payload: d.payload,
        savedById,
      },
    })
    res.status(201).json(toSavedReportDTO(created))
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Error interno' })
  }
})

// DELETE /api/saved-reports/:id
router.delete('/:id', requireRole('admin', 'editor'), async (req, res) => {
  try {
    await prisma.savedReport.delete({ where: { id: req.params.id } })
    res.status(204).end()
  } catch (e: any) {
    // Prisma P2025: registro no encontrado.
    if (e.code === 'P2025') return res.status(404).json({ error: 'No encontrado' })
    res.status(500).json({ error: e.message ?? 'Error interno' })
  }
})

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert prisma SavedReport → DTO. Reproduce la forma del entry que el monolito
 * guarda en el array `saved-reports:{year}`: {id,label,cutoffDate,controlMonth,
 * savedAt, tipo} + el sub-objeto bajo la clave de su `tipo` (report | projResumen
 * | cashflow), que es donde cada módulo espera leer su payload.
 */
function toSavedReportDTO(r: any) {
  return {
    id: r.id,
    year: r.year,
    tipo: r.tipo,
    label: r.label,
    cutoffDate: r.cutoffDate ?? null,
    controlMonth: r.controlMonth ?? null,
    savedAt: r.savedAt.toISOString(),
    savedById: r.savedById ?? null,
    // El módulo lee su payload bajo la clave homónima a su tipo.
    [r.tipo]: r.payload,
  }
}

export default router
