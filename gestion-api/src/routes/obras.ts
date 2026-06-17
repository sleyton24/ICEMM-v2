import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireRole } from '../middleware/auth.js'

const router = Router()

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Valida y normaliza el :year de params (entero de 4 dígitos razonable). */
const yearSchema = z.coerce.number().int().min(2000).max(2100)

/** mm '01'..'12' (string, zero-padded) ⇄ month Int 1..12 */
const mmToMonth = (mm: string): number => parseInt(mm, 10)
const monthToMm = (month: number): string => String(month).padStart(2, '0')

/** Autor del cambio: req.user.id, o null en BETA_MODE (sin sesión). */
function actorId(req: { user?: { id: string } }): string | null {
  return req.user?.id ?? null
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  ControlObras — indicadores de gestión de obra (5 áreas) por proyecto-mes  ║
// ║  budget-control:control-obras:{year}                                       ║
// ║  blob: { [projId]: { [mm]: { [areaId]: { [fieldKey]: valor } } } }         ║
// ║  UNIQUE(year, projectId, month, areaId)                                    ║
// ╚══════════════════════════════════════════════════════════════════════════╝

/**
 * GET /api/control-obras/:year
 * Ensambla el objeto del monolito desde las filas normalizadas.
 * Idempotente: si aún no hay datos del año devuelve {} (no 404).
 */
router.get('/control-obras/:year', async (req, res) => {
  const parsedYear = yearSchema.safeParse(req.params.year)
  if (!parsedYear.success) return res.status(400).json({ error: 'year inválido' })
  const year = parsedYear.data

  const rows = await prisma.controlObras.findMany({ where: { year } })

  // { [projId]: { [mm]: { [areaId]: { ...fields } } } }
  const data: Record<string, Record<string, Record<string, any>>> = {}
  for (const r of rows) {
    const mm = monthToMm(r.month)
    const byProj = (data[r.projectId] ??= {})
    const byMonth = (byProj[mm] ??= {})
    byMonth[r.areaId] = r.fields
  }

  res.json(data)
})

// El monolito guarda el año completo de una sola vez (no merge por proyecto/mes):
// data = { [projId]: { [mm]: { [areaId]: { [fieldKey]: string|bool } } } }
const controlObrasFieldsSchema = z.record(z.union([z.string(), z.boolean()]))
const controlObrasAreasSchema = z.record(controlObrasFieldsSchema)
// mm debe ser '01'..'12'
const controlObrasMonthsSchema = z.record(
  z.string().regex(/^(0[1-9]|1[0-2])$/, 'mm debe ser 01..12'),
  controlObrasAreasSchema,
)
const controlObrasBodySchema = z.record(controlObrasMonthsSchema)

/**
 * PUT /api/control-obras/:year
 * Recibe el objeto completo del año y upsertea las filas (last-write-wins por año,
 * igual que el monolito). Rechaza (409) escrituras a un (year, month) que tenga un
 * Cierre — el mes cerrado es inmutable.
 */
router.put('/control-obras/:year', requireRole('admin', 'editor'), async (req, res) => {
  const parsedYear = yearSchema.safeParse(req.params.year)
  if (!parsedYear.success) return res.status(400).json({ error: 'year inválido' })
  const year = parsedYear.data

  const parsed = controlObrasBodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues })
  }
  const data = parsed.data

  // Aplanar el blob a filas (projectId, month, areaId, fields).
  const flat: { projectId: string; month: number; areaId: string; fields: any }[] = []
  for (const [projectId, byMonth] of Object.entries(data)) {
    for (const [mm, byArea] of Object.entries(byMonth)) {
      const month = mmToMonth(mm)
      for (const [areaId, fields] of Object.entries(byArea)) {
        flat.push({ projectId, month, areaId, fields })
      }
    }
  }

  // Bloqueo de meses cerrados: si CUALQUIER fila toca un (year, month) cerrado, rechazar.
  const mesesAfectados = [...new Set(flat.map((f) => f.month))]
  if (mesesAfectados.length > 0) {
    const cierres = await prisma.cierre.findMany({
      where: { year, mes: { in: mesesAfectados } },
      select: { mes: true },
    })
    if (cierres.length > 0) {
      const cerrados = cierres.map((c) => c.mes).sort((a, b) => a - b)
      return res.status(409).json({
        error: 'Mes cerrado: no se puede modificar Control de Obras de un período cerrado',
        mesesCerrados: cerrados,
      })
    }
  }

  const updatedById = actorId(req)
  const now = new Date()

  // Upsert por (year, projectId, month, areaId). Idempotente.
  await prisma.$transaction(
    flat.map((f) =>
      prisma.controlObras.upsert({
        where: {
          year_projectId_month_areaId: {
            year,
            projectId: f.projectId,
            month: f.month,
            areaId: f.areaId,
          },
        },
        create: {
          year,
          projectId: f.projectId,
          month: f.month,
          areaId: f.areaId,
          fields: f.fields,
          updatedById,
        },
        update: {
          fields: f.fields,
          updatedById,
          updatedAt: now,
        },
      }),
    ),
  )

  // Re-ensamblar y devolver el objeto del año (idempotente para el cliente).
  const rows = await prisma.controlObras.findMany({ where: { year } })
  const out: Record<string, Record<string, Record<string, any>>> = {}
  for (const r of rows) {
    const mm = monthToMm(r.month)
    const byProj = (out[r.projectId] ??= {})
    const byMonth = (byProj[mm] ??= {})
    byMonth[r.areaId] = r.fields
  }
  res.json(out)
})

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  PlazoCurvas — curva S de avance físico (programada/controlada) por        ║
// ║  proyecto-año.  budget-control:plazo-curvas:{year}                         ║
// ║  blob: { [projId]: { meses:['YYYY-MM'], programada:[], controlada:[] } }   ║
// ║  UNIQUE(year, projectId)                                                   ║
// ╚══════════════════════════════════════════════════════════════════════════╝

/**
 * GET /api/plazo-curvas/:year
 * Ensambla { [projId]: { meses, programada, controlada } } desde las filas.
 * Idempotente: {} si aún no hay curvas del año.
 */
router.get('/plazo-curvas/:year', async (req, res) => {
  const parsedYear = yearSchema.safeParse(req.params.year)
  if (!parsedYear.success) return res.status(400).json({ error: 'year inválido' })
  const year = parsedYear.data

  const rows = await prisma.plazoCurvas.findMany({ where: { year } })

  const data: Record<string, { meses: string[]; programada: any; controlada: any }> = {}
  for (const r of rows) {
    data[r.projectId] = {
      meses: r.meses,
      programada: r.programada,
      controlada: r.controlada,
    }
  }

  res.json(data)
})

// Los arreglos están alineados por índice a `meses` y pueden traer '' / null.
const curvaValoresSchema = z.array(z.union([z.number(), z.literal(''), z.null()]))
const plazoCurvaSchema = z.object({
  meses: z.array(z.string()),
  programada: curvaValoresSchema,
  controlada: curvaValoresSchema,
})
// El monolito permite projectId=null para borrar; lo aceptamos y lo tratamos como delete.
const plazoCurvasBodySchema = z.record(plazoCurvaSchema.nullable())

/**
 * PUT /api/plazo-curvas/:year
 * Recibe el objeto del año entero (read-modify-write del blob en el monolito) y
 * upsertea las filas por (year, projectId). projectId con valor null = borrar la curva.
 */
router.put('/plazo-curvas/:year', requireRole('admin', 'editor'), async (req, res) => {
  const parsedYear = yearSchema.safeParse(req.params.year)
  if (!parsedYear.success) return res.status(400).json({ error: 'year inválido' })
  const year = parsedYear.data

  const parsed = plazoCurvasBodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues })
  }
  const data = parsed.data

  const ops = []
  for (const [projectId, curva] of Object.entries(data)) {
    if (curva == null) {
      // Borrado de la curva del proyecto (projectId=null en el monolito).
      ops.push(
        prisma.plazoCurvas.deleteMany({ where: { year, projectId } }),
      )
      continue
    }
    ops.push(
      prisma.plazoCurvas.upsert({
        where: { year_projectId: { year, projectId } },
        create: {
          year,
          projectId,
          meses: curva.meses,
          programada: curva.programada,
          controlada: curva.controlada,
        },
        update: {
          meses: curva.meses,
          programada: curva.programada,
          controlada: curva.controlada,
        },
      }),
    )
  }

  if (ops.length > 0) await prisma.$transaction(ops)

  // Re-ensamblar y devolver el objeto del año.
  const rows = await prisma.plazoCurvas.findMany({ where: { year } })
  const out: Record<string, { meses: string[]; programada: any; controlada: any }> = {}
  for (const r of rows) {
    out[r.projectId] = {
      meses: r.meses,
      programada: r.programada,
      controlada: r.controlada,
    }
  }
  res.json(out)
})

export default router
