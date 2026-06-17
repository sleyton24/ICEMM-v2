import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireRole } from '../middleware/auth.js'

const router = Router()

// ── Snapshots vivos (derivados) de los 4 módulos ─────────────────────────────
// budget-control:{modulo}:{year}. UNIQUE(modulo, year). isDerived=true (regenerable).

const MODULOS = ['check', 'scenarios', 'dashboard', 'scorecard'] as const
type Modulo = typeof MODULOS[number]

const paramsSchema = z.object({
  modulo: z.enum(MODULOS),
  year: z.coerce.number().int(),
})

const putBodySchema = z.object({
  payload: z.any(),
  schemaVersion: z.number().int().optional(),
})

// ── GET: leer snapshot del módulo-año ────────────────────────────────────────
// Idempotente: si aún no hay snapshot, devuelve un vacío sensato (no 404).
router.get('/:modulo/:year', async (req, res) => {
  const parsed = paramsSchema.safeParse(req.params)
  if (!parsed.success) return res.status(400).json({ error: 'Parámetros inválidos', issues: parsed.error.issues })

  const { modulo, year } = parsed.data
  const snap = await prisma.moduleSnapshotLive.findUnique({
    where: { modulo_year: { modulo, year } },
  })

  if (!snap) {
    return res.json({ modulo, year, payload: null, isDerived: true, schemaVersion: 2, ts: null })
  }
  res.json(toDTO(snap))
})

// ── PUT: upsert del snapshot del módulo-año ──────────────────────────────────
router.put('/:modulo/:year', requireRole('admin', 'editor'), async (req, res) => {
  const parsedParams = paramsSchema.safeParse(req.params)
  if (!parsedParams.success) return res.status(400).json({ error: 'Parámetros inválidos', issues: parsedParams.error.issues })

  const parsedBody = putBodySchema.safeParse(req.body)
  if (!parsedBody.success) return res.status(400).json({ error: 'Payload inválido', issues: parsedBody.error.issues })

  const { modulo, year } = parsedParams.data
  const { payload, schemaVersion } = parsedBody.data

  const snap = await prisma.moduleSnapshotLive.upsert({
    where: { modulo_year: { modulo, year } },
    create: {
      modulo,
      year,
      payload,
      ...(schemaVersion !== undefined ? { schemaVersion } : {}),
    },
    update: {
      payload,
      ...(schemaVersion !== undefined ? { schemaVersion } : {}),
      ts: new Date(),
    },
  })

  res.json(toDTO(snap))
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function toDTO(s: any) {
  return {
    modulo: s.modulo,
    year: s.year,
    payload: s.payload,
    isDerived: s.isDerived,
    schemaVersion: s.schemaVersion,
    ts: s.ts.toISOString(),
  }
}

export default router
