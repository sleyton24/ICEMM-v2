import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireRole } from '../middleware/auth.js'

const router = Router()

const familiaSchema = z.object({
  codigo: z.number().int(),
  nombre: z.string(),
  nombreOriginal: z.string(),
  letra: z.string(),
  color: z.string(),
})

const cuentaSchema = z.object({
  codigo: z.number().int(),
  descripcion: z.string(),
  familiaCodigo: z.number().int(),
  letra: z.string(),
})

const planUploadSchema = z.object({
  version: z.string(),
  familias: z.array(familiaSchema),
  cuentas: z.array(cuentaSchema),
})

const productoSchema = z.object({
  codigo: z.string(),
  descripcion: z.string(),
  unidadMedida: z.string(),
  ctaCto: z.number(),
  letra: z.string(),
})

const maestroUploadSchema = z.object({
  version: z.string(),
  productos: z.array(productoSchema),
})

// GET active plan + maestro
router.get('/', async (_req, res) => {
  const plan = await prisma.planCuentas.findFirst({
    where: { activo: true },
    orderBy: { cargadoEn: 'desc' },
  })
  const maestro = await prisma.maestroProductos.findFirst({
    where: { activo: true },
    orderBy: { cargadoEn: 'desc' },
  })
  res.json({
    plan: plan ? toPlanDTO(plan) : null,
    maestro: maestro ? toMaestroDTO(maestro) : null,
  })
})

// POST: subir nuevo plan (reemplaza activo)
router.post('/', requireRole('admin', 'editor'), async (req, res) => {
  const parsed = planUploadSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues })

  // Marca planes previos como inactivos
  await prisma.planCuentas.updateMany({ where: { activo: true }, data: { activo: false } })

  const plan = await prisma.planCuentas.create({
    data: {
      version: parsed.data.version,
      origen: 'uploaded',
      familias: parsed.data.familias,
      cuentas: parsed.data.cuentas,
      activo: true,
    },
  })
  res.status(201).json(toPlanDTO(plan))
})

// POST maestro
router.post('/maestro', requireRole('admin', 'editor'), async (req, res) => {
  const parsed = maestroUploadSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues })

  await prisma.maestroProductos.updateMany({ where: { activo: true }, data: { activo: false } })

  const maestro = await prisma.maestroProductos.create({
    data: {
      version: parsed.data.version,
      origen: 'uploaded',
      productos: parsed.data.productos,
      activo: true,
    },
  })
  res.status(201).json(toMaestroDTO(maestro))
})

// DELETE: restaurar bundled (marca todo como inactivo → cliente caerá al JSON bundleado)
router.delete('/', requireRole('admin'), async (_req, res) => {
  await prisma.planCuentas.updateMany({ where: { activo: true }, data: { activo: false } })
  await prisma.maestroProductos.updateMany({ where: { activo: true }, data: { activo: false } })
  res.status(204).end()
})

// ── DTOs ─────────────────────────────────────────────────────────────────────

function toPlanDTO(p: any) {
  return {
    version: p.version,
    cargadoEn: p.cargadoEn.toISOString(),
    origen: p.origen,
    familias: p.familias,
    cuentas: p.cuentas,
  }
}
function toMaestroDTO(m: any) {
  return {
    version: m.version,
    cargadoEn: m.cargadoEn.toISOString(),
    origen: m.origen,
    productos: m.productos,
  }
}

export default router
