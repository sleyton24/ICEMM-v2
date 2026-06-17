import { Router } from 'express'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../db.js'
import { requireRole } from '../middleware/auth.js'

const router = Router()

// ── Validación ────────────────────────────────────────────────────────────────

// year viene en la ruta (:year). Lo validamos como entero plausible.
const yearParamSchema = z.object({
  year: z.coerce.number().int().min(1900).max(9999),
})

// Vector mensual {1..12: UF}. Aceptamos claves '1'..'12' con valores numéricos.
// Permisivo (record) para no romper si el monolito manda parcial; el módulo de
// caja es la fuente canónica de la forma exacta.
const monthlyVector = z.record(z.number())

// Body del PUT (upsert). Todo opcional salvo los vectores de entrada manual, que
// el módulo siempre envía. Persistimos las rows tal cual llegan (sin recálculo).
const putBodySchema = z.object({
  // Escalares de entrada manual
  cajaInicialEnero: z.number().optional(),
  saldoIVADicAnterior: z.number().optional(),
  pctIVACostos: z.number().optional(),
  pctIVAOC: z.number().optional(),
  impuestoRenta: z.number().optional(),
  // Vectores 1..12 de entrada manual
  cxp: monthlyVector,
  cxc: monthlyVector,
  aportes: monthlyVector,
  devoluciones: monthlyVector,
  // Derivados que el módulo reescribe (arrastre entre años)
  cajaFinalDic: z.number().nullable().optional(),
  cajaMensual: monthlyVector.nullable().optional(),
  saldoIVADicFinal: z.number().nullable().optional(),
  cajaMensualTs: z.string().datetime().nullable().optional(),
})

// ── DTO ─────────────────────────────────────────────────────────────────────

/** Convierte un CashFlow de Prisma → DTO con la forma que espera el monolito. */
function toCashFlowDTO(cf: any) {
  return {
    year: cf.year,
    cajaInicialEnero: cf.cajaInicialEnero,
    saldoIVADicAnterior: cf.saldoIVADicAnterior,
    pctIVACostos: cf.pctIVACostos,
    pctIVAOC: cf.pctIVAOC,
    impuestoRenta: cf.impuestoRenta,
    cxp: cf.cxp,
    cxc: cf.cxc,
    aportes: cf.aportes,
    devoluciones: cf.devoluciones,
    cajaFinalDic: cf.cajaFinalDic ?? null,
    cajaMensual: cf.cajaMensual ?? null,
    saldoIVADicFinal: cf.saldoIVADicFinal ?? null,
    cajaMensualTs: cf.cajaMensualTs ? cf.cajaMensualTs.toISOString() : null,
    schemaVersion: cf.schemaVersion,
    updatedAt: cf.updatedAt.toISOString(),
    updatedById: cf.updatedById ?? null,
  }
}

/** Vacío sensato cuando aún no hay caja cargada para el año (no es 404). */
function emptyCashFlowDTO(year: number) {
  return {
    year,
    cajaInicialEnero: 0,
    saldoIVADicAnterior: 0,
    pctIVACostos: 0.77,
    pctIVAOC: 0.05,
    impuestoRenta: 0,
    cxp: {},
    cxc: {},
    aportes: {},
    devoluciones: {},
    cajaFinalDic: null,
    cajaMensual: null,
    saldoIVADicFinal: null,
    cajaMensualTs: null,
    schemaVersion: 2,
    updatedAt: null,
    updatedById: null,
  }
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

// GET /api/cashflow/:year — caja proyectada del año.
// Idempotente: si aún no hay datos del año, devuelve un vacío sensato (no 404).
router.get('/:year', async (req, res) => {
  const params = yearParamSchema.safeParse(req.params)
  if (!params.success) return res.status(400).json({ error: 'year inválido' })

  try {
    const cf = await prisma.cashFlow.findUnique({ where: { year: params.data.year } })
    if (!cf) return res.json(emptyCashFlowDTO(params.data.year))
    res.json(toCashFlowDTO(cf))
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Error interno' })
  }
})

// PUT /api/cashflow/:year — upsert de la caja del año.
// Persiste las rows tal cual llegan (sin reclasificar/recalcular server-side).
router.put('/:year', requireRole('admin', 'editor'), async (req, res) => {
  const params = yearParamSchema.safeParse(req.params)
  if (!params.success) return res.status(400).json({ error: 'year inválido' })

  const parsed = putBodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues })
  }

  const year = params.data.year
  const d = parsed.data
  // Autoría: req.user.id, o null en BETA_MODE (sin sesión real).
  const updatedById = req.user?.id ?? null
  const cajaMensualTs = d.cajaMensualTs === undefined
    ? undefined
    : d.cajaMensualTs === null
      ? null
      : new Date(d.cajaMensualTs)

  // create: incluye year. update: nunca tocamos year (es la clave única).
  const createData: any = {
    year,
    cxp: d.cxp,
    cxc: d.cxc,
    aportes: d.aportes,
    devoluciones: d.devoluciones,
    updatedById,
  }
  const updateData: any = {
    cxp: d.cxp,
    cxc: d.cxc,
    aportes: d.aportes,
    devoluciones: d.devoluciones,
    updatedById,
  }

  // Escalares y derivados: solo se escriben si vienen en el body (preserva
  // defaults del schema en create y valores previos en update).
  for (const k of [
    'cajaInicialEnero', 'saldoIVADicAnterior', 'pctIVACostos', 'pctIVAOC',
    'impuestoRenta', 'cajaFinalDic', 'saldoIVADicFinal',
  ] as const) {
    if (d[k] !== undefined) {
      createData[k] = d[k]
      updateData[k] = d[k]
    }
  }
  // cajaMensual es Json nullable: Prisma exige el sentinel Prisma.JsonNull
  // para fijar SQL NULL (un null crudo es rechazado en runtime).
  if (d.cajaMensual !== undefined) {
    const v = d.cajaMensual === null ? Prisma.JsonNull : d.cajaMensual
    createData.cajaMensual = v
    updateData.cajaMensual = v
  }
  if (cajaMensualTs !== undefined) {
    createData.cajaMensualTs = cajaMensualTs
    updateData.cajaMensualTs = cajaMensualTs
  }

  try {
    const cf = await prisma.cashFlow.upsert({
      where: { year },
      create: createData,
      update: updateData,
    })
    res.json(toCashFlowDTO(cf))
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Error interno' })
  }
})

export default router
