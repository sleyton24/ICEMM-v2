import { Router, type Request } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireRole } from '../middleware/auth.js'

const router = Router({ mergeParams: true })

function params(req: Request): { id: string; codigo?: string } {
  return req.params as unknown as { id: string; codigo?: string }
}

/** GET /api/projects/:id/comentarios → todos los comentarios del proyecto, agrupables por partida */
router.get('/', async (req, res) => {
  const comentarios = await prisma.comentario.findMany({
    where: { projectId: params(req).id },
    orderBy: { fechaCreacion: 'desc' },
  })
  res.json(comentarios.map(c => ({
    ...c,
    fechaCreacion: c.fechaCreacion.toISOString(),
  })))
})

/** GET /api/projects/:id/comentarios/:codigo → comentarios de una partida específica */
router.get('/:codigo', async (req, res) => {
  const comentarios = await prisma.comentario.findMany({
    where: {
      projectId: params(req).id,
      codigoPartida: params(req).codigo!,
    },
    orderBy: { fechaCreacion: 'desc' },
  })
  res.json(comentarios.map(c => ({
    ...c,
    fechaCreacion: c.fechaCreacion.toISOString(),
  })))
})

/** POST /api/projects/:id/comentarios/:codigo → agregar comentario */
router.post('/:codigo', requireRole('admin', 'editor'), async (req, res) => {
  const parsed = z.object({ contenido: z.string().min(1) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Contenido requerido' })

  const comentario = await prisma.comentario.create({
    data: {
      projectId: params(req).id,
      codigoPartida: params(req).codigo!,
      contenido: parsed.data.contenido,
      autorEmail: req.user?.email ?? 'beta@icemm',
      autorNombre: req.user?.nombre ?? 'Beta',
    },
  })
  res.status(201).json({
    ...comentario,
    fechaCreacion: comentario.fechaCreacion.toISOString(),
  })
})

/** DELETE /api/projects/:id/comentarios/:comentarioId → eliminar (admin o autor) */
router.delete('/by-id/:comentarioId', async (req, res) => {
  const id = (req.params as any).comentarioId as string
  const com = await prisma.comentario.findUnique({ where: { id } })
  if (!com) return res.status(404).json({ error: 'No encontrado' })
  if (com.projectId !== params(req).id) return res.status(404).json({ error: 'No encontrado' })

  // Solo admin o el autor pueden eliminar
  if (req.user && req.user.rol !== 'admin' && com.autorEmail !== req.user.email) {
    return res.status(403).json({ error: 'Solo el autor o admin pueden eliminar' })
  }

  await prisma.comentario.delete({ where: { id } })
  res.status(204).end()
})

export default router
