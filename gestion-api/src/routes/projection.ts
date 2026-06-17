import { Router } from 'express'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../db.js'
import { requireRole } from '../middleware/auth.js'

// Helper: columnas Json NULLABLE requieren Prisma.JsonNull (no el `null` de JS)
// para escribir SQL NULL. Si el valor viene undefined/null lo traducimos.
function jsonOrNull(v: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return v == null ? Prisma.JsonNull : (v as Prisma.InputJsonValue)
}

const router = Router()

// ──────────────────────────────────────────────────────────────────────────────
// Tres recursos de proyección, anclados por año:
//   - Overrides       (UNIQUE year)            GET/PUT /api/overrides/:year
//   - ProjCompletion  (UNIQUE year,projectId)  GET/PUT /api/proj-completion/:year
//   - ProjSnapshot    (UNIQUE year)            GET/PUT /api/proj-snapshot/:year
//
// En el monolito las tres claves son `budget-control:{overrides|proj-completion|
// proj-snapshot}:{year}`. proj-completion es un objeto {[projId]:{...}} que aquí
// se normaliza a una fila por (year, projectId).
// ──────────────────────────────────────────────────────────────────────────────

const yearParamSchema = z.object({ year: z.coerce.number().int() })

// ── Overrides ─────────────────────────────────────────────────────────────────
// payload: {[projId]:{[cat]:{[m]:UF}}, ingresos:{[projId]:{[m]:UF}},
//           oc:{[concepto||catId]:{[m]:UF}}, otrosIngresos:{[m]:UF},
//           anticipos:{[projId]:{[m]:UF}}}

const overridesPutSchema = z.object({
  payload: z.record(z.any()),
})

router.get('/overrides/:year', async (req, res) => {
  const params = yearParamSchema.safeParse(req.params)
  if (!params.success) return res.status(400).json({ error: 'year inválido' })

  const row = await prisma.overrides.findUnique({ where: { year: params.data.year } })
  // Idempotente: si aún no hay overrides del año, devolvemos payload vacío.
  if (!row) return res.json({ year: params.data.year, payload: {} })
  res.json(toOverridesDTO(row))
})

router.put('/overrides/:year', requireRole('admin', 'editor'), async (req, res) => {
  const params = yearParamSchema.safeParse(req.params)
  if (!params.success) return res.status(400).json({ error: 'year inválido' })

  const parsed = overridesPutSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues })

  const year = params.data.year
  const updatedById = req.user?.id ?? null   // null en BETA_MODE
  const row = await prisma.overrides.upsert({
    where: { year },
    create: { year, payload: parsed.data.payload, updatedById },
    update: { payload: parsed.data.payload, updatedById },
  })
  res.json(toOverridesDTO(row))
})

// ── ProjCompletion ──────────────────────────────────────────────────────────
// Clave del monolito: objeto {[projId]:{cats, realStart, projEnd, extraWorks,
//   overrideContract, replacementName, curvaShift}}. Se ensambla/desensambla a
//   filas (year, projectId).

const projCompletionEntrySchema = z.object({
  cats: z.record(z.any()).optional(),
  realStart: z.string().nullable().optional(),
  projEnd: z.string().nullable().optional(),
  extraWorks: z.number().nullable().optional(),
  overrideContract: z.record(z.any()).nullable().optional(),
  replacementName: z.string().nullable().optional(),
  curvaShift: z.record(z.any()).nullable().optional(),
})

// El body es el objeto {[projectId]: entry}
const projCompletionPutSchema = z.record(projCompletionEntrySchema)

router.get('/proj-completion/:year', async (req, res) => {
  const params = yearParamSchema.safeParse(req.params)
  if (!params.success) return res.status(400).json({ error: 'year inválido' })

  const rows = await prisma.projCompletion.findMany({ where: { year: params.data.year } })
  // Ensamblamos {[projectId]: {...}} (vacío si aún no hay datos del año).
  const out: Record<string, any> = {}
  for (const r of rows) out[r.projectId] = toProjCompletionEntry(r)
  res.json(out)
})

router.put('/proj-completion/:year', requireRole('admin', 'editor'), async (req, res) => {
  const params = yearParamSchema.safeParse(req.params)
  if (!params.success) return res.status(400).json({ error: 'year inválido' })

  const parsed = projCompletionPutSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues })

  const year = params.data.year
  const entries = Object.entries(parsed.data)

  // Una fila por projectId. Upsert atómico de todas las filas del año.
  await prisma.$transaction(
    entries.map(([projectId, e]) => {
      const data = {
        cats: (e.cats ?? {}) as Prisma.InputJsonValue,
        realStart: e.realStart ? new Date(e.realStart) : null,
        projEnd: e.projEnd ? new Date(e.projEnd) : null,
        extraWorks: e.extraWorks ?? null,
        overrideContract: jsonOrNull(e.overrideContract),
        replacementName: e.replacementName ?? null,
        curvaShift: jsonOrNull(e.curvaShift),
      }
      return prisma.projCompletion.upsert({
        where: { year_projectId: { year, projectId } },
        create: { year, projectId, ...data },
        update: data,
      })
    }),
  )

  const rows = await prisma.projCompletion.findMany({ where: { year } })
  const out: Record<string, any> = {}
  for (const r of rows) out[r.projectId] = toProjCompletionEntry(r)
  res.json(out)
})

// ── ProjSnapshot ──────────────────────────────────────────────────────────────
// payload: {ingresos, costos, oc, otrosIngresos, anticipos}; + controlMonth.
// Espejo DERIVADO (isDerived=true), regenerable.

const projSnapshotPutSchema = z.object({
  controlMonth: z.number().int().min(1).max(12),
  payload: z.object({
    ingresos: z.record(z.any()).optional(),
    costos: z.record(z.any()).optional(),
    oc: z.record(z.any()).optional(),
    otrosIngresos: z.record(z.any()).optional(),
    anticipos: z.record(z.any()).optional(),
  }).passthrough(),
})

router.get('/proj-snapshot/:year', async (req, res) => {
  const params = yearParamSchema.safeParse(req.params)
  if (!params.success) return res.status(400).json({ error: 'year inválido' })

  const row = await prisma.projSnapshot.findUnique({ where: { year: params.data.year } })
  // Idempotente: si el snapshot aún no fue regenerado, devolvemos vacío sensato.
  if (!row) return res.json({ year: params.data.year, controlMonth: null, payload: {}, isDerived: true })
  res.json(toProjSnapshotDTO(row))
})

router.put('/proj-snapshot/:year', requireRole('admin', 'editor'), async (req, res) => {
  const params = yearParamSchema.safeParse(req.params)
  if (!params.success) return res.status(400).json({ error: 'year inválido' })

  const parsed = projSnapshotPutSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues })

  const year = params.data.year
  const { controlMonth } = parsed.data
  const payload = parsed.data.payload as Prisma.InputJsonValue
  const row = await prisma.projSnapshot.upsert({
    where: { year },
    create: { year, controlMonth, payload, isDerived: true, ts: new Date() },
    update: { controlMonth, payload, isDerived: true, ts: new Date() },
  })
  res.json(toProjSnapshotDTO(row))
})

// ── DTOs ────────────────────────────────────────────────────────────────────

function toOverridesDTO(o: any) {
  return {
    year: o.year,
    payload: o.payload,
    updatedAt: o.updatedAt.toISOString(),
  }
}

function toProjCompletionEntry(r: any) {
  return {
    cats: r.cats,
    realStart: r.realStart ? r.realStart.toISOString().slice(0, 10) : null,
    projEnd: r.projEnd ? r.projEnd.toISOString().slice(0, 10) : null,
    extraWorks: r.extraWorks ?? null,
    overrideContract: r.overrideContract ?? null,
    replacementName: r.replacementName ?? null,
    curvaShift: r.curvaShift ?? null,
  }
}

function toProjSnapshotDTO(s: any) {
  return {
    year: s.year,
    controlMonth: s.controlMonth,
    payload: s.payload,
    isDerived: s.isDerived,
    schemaVersion: s.schemaVersion,
    ts: s.ts.toISOString(),
  }
}

export default router
