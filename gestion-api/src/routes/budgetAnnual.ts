import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireRole } from '../middleware/auth.js'

const router = Router()

// ── Validación de params ───────────────────────────────────────────────────────

// year: entero plausible (acota para no abrir la puerta a basura tipo year=0).
const yearSchema = z.coerce.number().int().min(2000).max(2100)

function parseYear(raw: string, res: import('express').Response): number | null {
  const parsed = yearSchema.safeParse(raw)
  if (!parsed.success) {
    res.status(400).json({ error: 'year inválido' })
    return null
  }
  return parsed.data
}

// ── Validación de body ──────────────────────────────────────────────────────────

// Arreglo de 12 floats (un valor por mes). Todo en UF.
const months12 = z.array(z.number()).length(12)

// oficinaCentral: {[ocCat]: Float[12]} — claves dinámicas de categoría de OC.
const oficinaCentralSchema = z.record(months12)
// otherIncome: {asesorias: Float[12]} — por ahora solo 'asesorias', pero se deja
// abierto a otras claves de ingreso para no romper si el monolito agrega más.
const otherIncomeSchema = z.record(months12)

const putSchema = z.object({
  oficinaCentral: oficinaCentralSchema.optional(),
  otherIncome: otherIncomeSchema.optional(),
  status: z.enum(['borrador', 'fijado']).optional(),
})

// snapshot congelado al fijar: {[projId]:{monthlyRevenue[12], monthlyCosts:{[cat]:[12]}}}
const snapshotSchema = z.record(
  z.object({
    monthlyRevenue: months12,
    monthlyCosts: z.record(months12),
  }),
)

const fijarSchema = z.object({
  snapshot: snapshotSchema,
})

// ── GET /:year — devuelve la fila o un borrador vacío ────────────────────────────
// Idempotente: si aún no hay datos del año, NO es 404; devuelve la forma vacía.

router.get('/:year', async (req, res) => {
  const year = parseYear(req.params.year, res)
  if (year === null) return

  const row = await prisma.budgetAnnual.findUnique({ where: { year } })
  if (!row) {
    return res.json({
      year,
      status: 'borrador',
      oficinaCentral: {},
      otherIncome: {},
      snapshot: null,
    })
  }
  res.json(toBudgetAnnualDTO(row))
})

// ── PUT /:year — upsert (borrador) ───────────────────────────────────────────────

router.put('/:year', requireRole('admin', 'editor'), async (req, res) => {
  const year = parseYear(req.params.year, res)
  if (year === null) return

  const parsed = putSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues })
  }
  const d = parsed.data

  // Solo persistimos las claves enviadas (PUT parcial idempotente). El status,
  // si no viene, queda en 'borrador' al crear / sin cambio al actualizar.
  const createData: any = {
    year,
    oficinaCentral: d.oficinaCentral ?? {},
    otherIncome: d.otherIncome ?? {},
  }
  if (d.status !== undefined) createData.status = d.status

  const updateData: any = {}
  if (d.oficinaCentral !== undefined) updateData.oficinaCentral = d.oficinaCentral
  if (d.otherIncome !== undefined) updateData.otherIncome = d.otherIncome
  if (d.status !== undefined) updateData.status = d.status

  const row = await prisma.budgetAnnual.upsert({
    where: { year },
    create: createData,
    update: updateData,
  })
  res.json(toBudgetAnnualDTO(row))
})

// ── POST /:year/fijar — congela el presupuesto ───────────────────────────────────
// status=fijado, fixedDate=now, snapshot=el congelado que mande el body.

router.post('/:year/fijar', requireRole('admin', 'editor'), async (req, res) => {
  const year = parseYear(req.params.year, res)
  if (year === null) return

  const parsed = fijarSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues })
  }

  // Upsert: fijar debe funcionar aunque no exista un borrador previo del año.
  const base = {
    status: 'fijado',
    fixedDate: new Date(),
    snapshot: parsed.data.snapshot,
  }
  const row = await prisma.budgetAnnual.upsert({
    where: { year },
    create: { year, oficinaCentral: {}, otherIncome: {}, ...base },
    update: base,
  })
  res.json(toBudgetAnnualDTO(row))
})

// ── DTO ──────────────────────────────────────────────────────────────────────────

/**
 * Convierte la fila Prisma BudgetAnnual → forma que espera el monolito
 * (budget-control:budget:{year}).
 */
function toBudgetAnnualDTO(b: any) {
  return {
    year: b.year,
    status: b.status,
    fixedDate: b.fixedDate ? b.fixedDate.toISOString() : null,
    oficinaCentral: b.oficinaCentral,
    otherIncome: b.otherIncome,
    snapshot: b.snapshot ?? null,
  }
}

export default router
