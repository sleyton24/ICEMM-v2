import { Router, type Request } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireRole } from '../middleware/auth.js'

const router = Router({ mergeParams: true })

// mergeParams no propaga tipos automáticamente — helper para acceder
function params(req: Request): { id: string; informeId?: string } {
  return req.params as unknown as { id: string; informeId?: string }
}

/**
 * GET /api/projects/:id/informes
 * Lista todos los informes aprobados del proyecto, ordenados por número desc.
 */
router.get('/', async (req, res) => {
  const informes = await prisma.informe.findMany({
    where: { projectId: params(req).id },
    orderBy: { numero: 'desc' },
  })
  res.json(informes.map(i => ({
    id: i.id,
    numero: i.numero,
    estado: i.estado,
    fechaAprobacion: i.fechaAprobacion.toISOString(),
    aprobadoPor: i.aprobadoPor,
    comentario: i.comentario,
  })))
})

/**
 * GET /api/projects/:id/informes/:informeId
 * Devuelve el snapshot completo del informe.
 */
router.get('/:informeId', async (req, res) => {
  const informe = await prisma.informe.findUnique({
    where: { id: params(req).informeId! },
  })
  if (!informe || informe.projectId !== params(req).id) {
    return res.status(404).json({ error: 'No encontrado' })
  }
  res.json({
    id: informe.id,
    numero: informe.numero,
    estado: informe.estado,
    fechaAprobacion: informe.fechaAprobacion.toISOString(),
    aprobadoPor: informe.aprobadoPor,
    comentario: informe.comentario,
    snapshot: informe.snapshotProyecto,
  })
})

/**
 * POST /api/projects/:id/informes/aprobar
 * Toma el estado actual del proyecto (slots + erp) y lo guarda como un Informe nuevo.
 * Solo admin.
 */
router.post('/aprobar', requireRole('admin'), async (req, res) => {
  const projectId = params(req).id
  const parsed = z.object({ comentario: z.string().optional() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Payload inválido' })

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { archivos: true, erp: true },
  })
  if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

  // Calcular siguiente número
  const ultimo = await prisma.informe.findFirst({
    where: { projectId },
    orderBy: { numero: 'desc' },
  })
  const numero = (ultimo?.numero ?? 0) + 1

  // Snapshot con la misma forma que un Proyecto (slots object), no array
  const slots: Record<string, any> = {
    presupuesto_original: null,
    presupuesto_redistribuido: null,
    ppto_horas_extra: null,
    proyectado: null,
    gasto_real_erp: null,
  }
  for (const a of project.archivos) {
    slots[a.slot] = {
      nombreArchivo: a.nombreArchivo,
      fechaCarga: a.fechaCarga.toISOString(),
      partidas: a.partidas,
      subtotalesFamilia: a.subtotalesFamilia,
      totalGeneral: a.totalGeneral,
    }
  }
  if (project.erp) {
    slots.gasto_real_erp = {
      nombreArchivo: project.erp.nombreArchivo,
      fechaCarga: project.erp.fechaCarga.toISOString(),
      unidadNegocioCodigo: project.erp.unidadNegocioCodigo,
      unidadNegocioDescripcion: project.erp.unidadNegocioDescripcion,
      totalUF: project.erp.totalUF,
      numTransacciones: project.erp.numTransacciones,
      rangoFechas: {
        desde: project.erp.rangoFechaDesde.toISOString(),
        hasta: project.erp.rangoFechaHasta.toISOString(),
      },
      agregadoPorCcosto: project.erp.agregadoPorCcosto,
      agregadoPorCcostoPorMes: project.erp.agregadoPorCcostoPorMes,
      mesesDisponibles: project.erp.mesesDisponibles,
      transaccionesPorCcosto: project.erp.transaccionesPorCcosto,
    }
  }

  const snapshot = {
    nombre: project.nombre,
    unidadNegocioCodigo: project.unidadNegocioCodigo,
    cutoffMesReal: project.cutoffMesReal,
    fechaCorte: new Date().toISOString().slice(0, 10),
    slots,
  }

  const informe = await prisma.informe.create({
    data: {
      projectId,
      numero,
      estado: 'aprobado',
      aprobadoPor: req.user?.email ?? 'beta-mode',
      comentario: parsed.data.comentario ?? null,
      snapshotProyecto: snapshot,
    },
  })

  res.status(201).json({
    id: informe.id,
    numero: informe.numero,
    estado: informe.estado,
    fechaAprobacion: informe.fechaAprobacion.toISOString(),
    aprobadoPor: informe.aprobadoPor,
  })
})

/**
 * DELETE /api/projects/:id/informes/:informeId
 * Elimina un informe aprobado (solo admin, irreversible).
 */
router.delete('/:informeId', requireRole('admin'), async (req, res) => {
  const informe = await prisma.informe.findUnique({ where: { id: params(req).informeId! } })
  if (!informe || informe.projectId !== params(req).id) {
    return res.status(404).json({ error: 'No encontrado' })
  }
  await prisma.informe.delete({ where: { id: params(req).informeId! } })
  res.status(204).end()
})

export default router
