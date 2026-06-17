import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireRole } from '../middleware/auth.js'
import informesRouter from './informes.js'
import comentariosRouter from './comentarios.js'

const router = Router()

// Sub-routers
router.use('/:id/informes', informesRouter)
router.use('/:id/comentarios', comentariosRouter)

const ITEMIZADO_SLOTS = ['presupuesto_original', 'presupuesto_redistribuido', 'ppto_horas_extra', 'proyectado'] as const
type ItemizadoSlot = typeof ITEMIZADO_SLOTS[number]

// ── Catálogo del monolito (control presupuestario) ───────────────────────────
// Las 8 categorías de costo (ver schema BudgetByCategory).
const BUDGET_CATEGORIES = [
  'materiales',
  'mano_de_obra',
  'subcontratos',
  'gastos_generales',
  'equipos_maquinarias',
  'otros',
  'edificaciones_comerciales',
  'post_venta',
] as const

const CONTRACT_TYPES = ['suma_alzada', 'admin_delegada'] as const
const PROJECT_STATUS = ['presupuestado', 'en_ejecucion', 'terminado'] as const

// 'YYYY-MM' (como lo guarda el monolito) o ISO/date parseable. Se persiste como @db.Date.
const monthStr = z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, 'formato fecha YYYY-MM[-DD]')

// ProjectGestion (1:1). Todos los campos opcionales para upsert aditivo/parcial.
const gestionSchema = z.object({
  contractType: z.enum(CONTRACT_TYPES).optional(),
  status: z.enum(PROJECT_STATUS).optional(),
  isOffBudget: z.boolean().optional(),
  startDate: monthStr.nullable().optional(),
  endDate: monthStr.nullable().optional(),
  durationMonths: z.number().int().nullable().optional(),
  replacesProject: z.string().nullable().optional(),
  contract: z.record(z.any()).optional(),     // forma SA/AD; no se valida server-side (revisión contable)
  costCurve: z.array(z.number()).optional(),  // number[] (% por mes)
  revenueCurve: z.array(z.number()).optional(),
  schemaVersion: z.number().int().optional(),
})

// BudgetByCategory: mapa { [categoria]: Float[12] }. Solo claves del catálogo.
const budgetByCategorySchema = z.record(
  z.enum(BUDGET_CATEGORIES),
  z.array(z.number()),
)

/** 'YYYY-MM' | 'YYYY-MM-DD' → Date (día 1 si solo mes). null/undefined → null. */
function toDateOrNull(v: string | null | undefined): Date | null {
  if (v == null) return null
  const s = v.length === 7 ? `${v}-01` : v
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

// Include compartido para todas las lecturas que alimentan toProyectoDTO.
// Extendido (aditivo) para traer ProjectGestion + BudgetByCategory del monolito.
const PROJECT_INCLUDE = {
  archivos: true,
  erp: true,
  gestion: true,
  budgetByCategory: true,
} as const

// ── List / create / read / update / delete ───────────────────────────────────

router.get('/', async (req, res) => {
  // Admin (o beta) ve todos. Editor/viewer solo los asignados.
  let where: any = {}
  if (!req.isBeta && req.user && req.user.rol !== 'admin') {
    where = { usuarios: { some: { userId: req.user.id } } }
  }
  const projects = await prisma.project.findMany({
    where,
    orderBy: { fechaActualizacion: 'desc' },
    include: PROJECT_INCLUDE,
  })
  res.json(projects.map(toProyectoDTO))
})

const createProjectSchema = z.object({
  nombre: z.string().min(1),
  unidadNegocioCodigo: z.number().int().nullable().optional(),
  cutoffMesReal: z.string().nullable().optional(),
  // ── Datos de gestión del monolito (aditivo; opcionales) ──
  gestion: gestionSchema.optional(),
  budgetByCategory: budgetByCategorySchema.optional(),
})

router.post('/', requireRole('admin', 'editor'), async (req, res) => {
  const parsed = createProjectSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos', issues: parsed.error.issues })
  const { nombre, unidadNegocioCodigo, cutoffMesReal, gestion, budgetByCategory } = parsed.data

  try {
    const project = await prisma.project.create({
      data: {
        nombre,
        ...(unidadNegocioCodigo !== undefined ? { unidadNegocioCodigo } : {}),
        ...(cutoffMesReal !== undefined ? { cutoffMesReal } : {}),
      },
    })

    // Upsert aditivo de los datos del monolito (si vinieron en el body).
    await upsertGestion(project.id, gestion)
    await upsertBudgetByCategory(project.id, budgetByCategory)

    // Si el creador es editor (no admin), auto-asignárselo para que pueda verlo
    if (!req.isBeta && req.user && req.user.rol === 'editor') {
      await prisma.userProject.create({
        data: { userId: req.user.id, projectId: project.id },
      })
    }

    const created = await prisma.project.findUnique({
      where: { id: project.id },
      include: PROJECT_INCLUDE,
    })
    res.status(201).json(toProyectoDTO(created!))
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? 'Error al crear proyecto' })
  }
})

router.get('/:id', async (req, res) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.id },
    include: PROJECT_INCLUDE,
  })
  if (!project) return res.status(404).json({ error: 'No encontrado' })
  res.json(toProyectoDTO(project))
})

router.patch('/:id', requireRole('admin', 'editor'), async (req, res) => {
  const parsed = z.object({
    nombre: z.string().optional(),
    cutoffMesReal: z.string().nullable().optional(),
    unidadNegocioCodigo: z.number().int().nullable().optional(),
    // ── Datos de gestión del monolito (aditivo; opcionales) ──
    gestion: gestionSchema.optional(),
    budgetByCategory: budgetByCategorySchema.optional(),
  }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos', issues: parsed.error.issues })

  const { gestion, budgetByCategory, ...projectData } = parsed.data
  const projectId = req.params.id

  try {
    const existing = await prisma.project.findUnique({ where: { id: projectId } })
    if (!existing) return res.status(404).json({ error: 'No encontrado' })

    // Campos propios de Project (solo los que vinieron).
    if (Object.keys(projectData).length > 0) {
      await prisma.project.update({ where: { id: projectId }, data: projectData })
    }

    // Upsert aditivo de gestión + presupuesto por categoría (si vinieron).
    await upsertGestion(projectId, gestion)
    await upsertBudgetByCategory(projectId, budgetByCategory)

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: PROJECT_INCLUDE,
    })
    res.json(toProyectoDTO(project!))
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? 'Error al actualizar proyecto' })
  }
})

router.delete('/:id', requireRole('admin'), async (req, res) => {
  await prisma.project.delete({ where: { id: req.params.id } })
  res.status(204).end()
})

// ── Slot itemizado: upload / clear ───────────────────────────────────────────

const uploadSlotSchema = z.object({
  nombreArchivo: z.string(),
  partidas: z.array(z.any()),
  subtotalesFamilia: z.record(z.number()),
  totalGeneral: z.number(),
})

router.post('/:id/slots/:slot', requireRole('admin', 'editor'), async (req, res) => {
  const slot = req.params.slot as ItemizadoSlot
  if (!ITEMIZADO_SLOTS.includes(slot)) return res.status(400).json({ error: 'slot inválido' })

  const parsed = uploadSlotSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues })

  const projectId = req.params.id
  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

  await prisma.archivoCargado.upsert({
    where: { projectId_slot: { projectId, slot } },
    create: { projectId, slot, ...parsed.data },
    update: { ...parsed.data, fechaCarga: new Date() },
  })

  await prisma.project.update({
    where: { id: projectId },
    data: { fechaActualizacion: new Date() },
  })

  const updated = await prisma.project.findUnique({
    where: { id: projectId },
    include: PROJECT_INCLUDE,
  })
  res.json(toProyectoDTO(updated!))
})

router.delete('/:id/slots/:slot', requireRole('admin', 'editor'), async (req, res) => {
  const projectId = req.params.id
  const slot = req.params.slot
  if (slot === 'gasto_real_erp') {
    await prisma.cargaERP.deleteMany({ where: { projectId } })
  } else if (ITEMIZADO_SLOTS.includes(slot as ItemizadoSlot)) {
    await prisma.archivoCargado.deleteMany({ where: { projectId, slot } })
  } else {
    return res.status(400).json({ error: 'slot inválido' })
  }
  await prisma.project.update({ where: { id: projectId }, data: { fechaActualizacion: new Date() } })
  res.status(204).end()
})

// ── ERP upload ───────────────────────────────────────────────────────────────

const uploadERPSchema = z.object({
  nombreArchivo: z.string(),
  unidadNegocioCodigo: z.number().int(),
  unidadNegocioDescripcion: z.string(),
  totalUF: z.number(),
  numTransacciones: z.number().int(),
  rangoFechas: z.object({ desde: z.string(), hasta: z.string() }),
  agregadoPorCcosto: z.record(z.any()),
  agregadoPorCcostoPorMes: z.record(z.any()),
  mesesDisponibles: z.array(z.string()),
  transaccionesPorCcosto: z.record(z.any()),
})

router.post('/:id/erp', requireRole('admin', 'editor'), async (req, res) => {
  const projectId = req.params.id
  const parsed = uploadERPSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues })

  const d = parsed.data
  await prisma.cargaERP.upsert({
    where: { projectId },
    create: {
      projectId,
      nombreArchivo: d.nombreArchivo,
      unidadNegocioCodigo: d.unidadNegocioCodigo,
      unidadNegocioDescripcion: d.unidadNegocioDescripcion,
      totalUF: d.totalUF,
      numTransacciones: d.numTransacciones,
      rangoFechaDesde: new Date(d.rangoFechas.desde),
      rangoFechaHasta: new Date(d.rangoFechas.hasta),
      agregadoPorCcosto: d.agregadoPorCcosto,
      agregadoPorCcostoPorMes: d.agregadoPorCcostoPorMes,
      mesesDisponibles: d.mesesDisponibles,
      transaccionesPorCcosto: d.transaccionesPorCcosto,
    },
    update: {
      nombreArchivo: d.nombreArchivo,
      unidadNegocioCodigo: d.unidadNegocioCodigo,
      unidadNegocioDescripcion: d.unidadNegocioDescripcion,
      totalUF: d.totalUF,
      numTransacciones: d.numTransacciones,
      rangoFechaDesde: new Date(d.rangoFechas.desde),
      rangoFechaHasta: new Date(d.rangoFechas.hasta),
      agregadoPorCcosto: d.agregadoPorCcosto,
      agregadoPorCcostoPorMes: d.agregadoPorCcostoPorMes,
      mesesDisponibles: d.mesesDisponibles,
      transaccionesPorCcosto: d.transaccionesPorCcosto,
      fechaCarga: new Date(),
    },
  })

  await prisma.project.update({
    where: { id: projectId },
    data: { unidadNegocioCodigo: d.unidadNegocioCodigo, fechaActualizacion: new Date() },
  })

  const updated = await prisma.project.findUnique({
    where: { id: projectId },
    include: PROJECT_INCLUDE,
  })
  res.json(toProyectoDTO(updated!))
})

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Upsert 1:1 de ProjectGestion. No-op si `g` es undefined (mantiene lo existente).
 * En create requiere contractType (NOT NULL en schema); default a 'suma_alzada' si
 * no llega para no romper la inserción inicial.
 */
async function upsertGestion(
  projectId: string,
  g: z.infer<typeof gestionSchema> | undefined,
): Promise<void> {
  if (g === undefined) return

  // Campos a setear en update (solo los provistos — parcial).
  const updateData: Record<string, any> = {}
  if (g.contractType !== undefined) updateData.contractType = g.contractType
  if (g.status !== undefined) updateData.status = g.status
  if (g.isOffBudget !== undefined) updateData.isOffBudget = g.isOffBudget
  if (g.startDate !== undefined) updateData.startDate = toDateOrNull(g.startDate)
  if (g.endDate !== undefined) updateData.endDate = toDateOrNull(g.endDate)
  if (g.durationMonths !== undefined) updateData.durationMonths = g.durationMonths
  if (g.replacesProject !== undefined) updateData.replacesProject = g.replacesProject
  if (g.contract !== undefined) updateData.contract = g.contract
  if (g.costCurve !== undefined) updateData.costCurve = g.costCurve
  if (g.revenueCurve !== undefined) updateData.revenueCurve = g.revenueCurve
  if (g.schemaVersion !== undefined) updateData.schemaVersion = g.schemaVersion

  await prisma.projectGestion.upsert({
    where: { projectId },
    create: {
      projectId,
      contractType: g.contractType ?? 'suma_alzada',
      ...(g.status !== undefined ? { status: g.status } : {}),
      ...(g.isOffBudget !== undefined ? { isOffBudget: g.isOffBudget } : {}),
      startDate: toDateOrNull(g.startDate),
      endDate: toDateOrNull(g.endDate),
      durationMonths: g.durationMonths ?? null,
      replacesProject: g.replacesProject ?? null,
      contract: g.contract ?? {},
      costCurve: g.costCurve ?? [],
      revenueCurve: g.revenueCurve ?? [],
      ...(g.schemaVersion !== undefined ? { schemaVersion: g.schemaVersion } : {}),
    },
    update: updateData,
  })
}

/**
 * Upsert del mapa { [categoria]: Float[12] } en BudgetByCategory (1 row por cat).
 * No-op si `b` es undefined. Las categorías omitidas NO se borran (aditivo).
 */
async function upsertBudgetByCategory(
  projectId: string,
  b: z.infer<typeof budgetByCategorySchema> | undefined,
): Promise<void> {
  if (b === undefined) return
  const entries = Object.entries(b) as [string, number[]][]
  for (const [categoria, montosMensuales] of entries) {
    await prisma.budgetByCategory.upsert({
      where: { projectId_categoria: { projectId, categoria } },
      create: { projectId, categoria, montosMensuales },
      update: { montosMensuales },
    })
  }
}

/**
 * Convert prisma Project (with archivos + erp) → DTO matching frontend Proyecto type.
 * The frontend expects `slots: { presupuesto_original, ... }` shape.
 */
function toProyectoDTO(p: any) {
  const slots: Record<string, any> = {
    presupuesto_original: null,
    presupuesto_redistribuido: null,
    ppto_horas_extra: null,
    proyectado: null,
    gasto_real_erp: null,
  }

  for (const a of p.archivos ?? []) {
    slots[a.slot] = {
      nombreArchivo: a.nombreArchivo,
      fechaCarga: a.fechaCarga.toISOString(),
      partidas: a.partidas,
      subtotalesFamilia: a.subtotalesFamilia,
      totalGeneral: a.totalGeneral,
    }
  }

  if (p.erp) {
    slots.gasto_real_erp = {
      nombreArchivo: p.erp.nombreArchivo,
      fechaCarga: p.erp.fechaCarga.toISOString(),
      unidadNegocioCodigo: p.erp.unidadNegocioCodigo,
      unidadNegocioDescripcion: p.erp.unidadNegocioDescripcion,
      totalUF: p.erp.totalUF,
      numTransacciones: p.erp.numTransacciones,
      rangoFechas: {
        desde: p.erp.rangoFechaDesde.toISOString(),
        hasta: p.erp.rangoFechaHasta.toISOString(),
      },
      agregadoPorCcosto: p.erp.agregadoPorCcosto,
      agregadoPorCcostoPorMes: p.erp.agregadoPorCcostoPorMes,
      mesesDisponibles: p.erp.mesesDisponibles,
      transaccionesPorCcosto: p.erp.transaccionesPorCcosto,
    }
  }

  return {
    id: p.id,
    nombre: p.nombre,
    unidadNegocioCodigo: p.unidadNegocioCodigo ?? undefined,
    // unCode formateado como en el monolito ('02', '15'); null si no hay UN asignada.
    unCode: p.unidadNegocioCodigo != null ? String(p.unidadNegocioCodigo).padStart(2, '0') : null,
    cutoffMesReal: p.cutoffMesReal ?? null,
    fechaCreacion: p.fechaCreacion.toISOString(),
    fechaActualizacion: p.fechaActualizacion.toISOString(),
    slots,
    // ── Datos de gestión del monolito (aditivo; null/[] si aún no existen) ──
    gestion: toGestionDTO(p.gestion),
    budgetByCategory: toBudgetByCategoryDTO(p.budgetByCategory),
  }
}

/** ProjectGestion → DTO (contractType, status, curvas, contrato, fechas). */
function toGestionDTO(g: any) {
  if (!g) return null
  return {
    contractType: g.contractType,
    status: g.status,
    isOffBudget: g.isOffBudget,
    startDate: g.startDate ? g.startDate.toISOString() : null,
    endDate: g.endDate ? g.endDate.toISOString() : null,
    durationMonths: g.durationMonths ?? null,
    replacesProject: g.replacesProject ?? null,
    contract: g.contract,
    costCurve: g.costCurve,
    revenueCurve: g.revenueCurve,
    schemaVersion: g.schemaVersion,
  }
}

/** BudgetByCategory[] → mapa { [categoria]: montosMensuales } (8 categorías). */
function toBudgetByCategoryDTO(rows: any[]) {
  const out: Record<string, any> = {}
  for (const r of rows ?? []) {
    out[r.categoria] = r.montosMensuales
  }
  return out
}

export default router
