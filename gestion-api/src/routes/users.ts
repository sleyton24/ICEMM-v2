import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireRole } from '../middleware/auth.js'

const router = Router()

// Todo el router requiere rol admin
router.use(requireRole('admin'))

const createSchema = z.object({
  email: z.string().min(1),
  nombre: z.string().min(1),
  password: z.string().min(4),
  rol: z.enum(['admin', 'editor', 'viewer', 'director']),
  activo: z.boolean().optional(),
})

const updateSchema = z.object({
  nombre: z.string().min(1).optional(),
  password: z.string().min(4).optional(),
  rol: z.enum(['admin', 'editor', 'viewer']).optional(),
  activo: z.boolean().optional(),
})

router.get('/', async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { fechaCreacion: 'desc' },
    select: { id: true, email: true, nombre: true, rol: true, activo: true, fechaCreacion: true },
  })
  res.json(users.map(u => ({ ...u, fechaCreacion: u.fechaCreacion.toISOString() })))
})

router.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos', issues: parsed.error.issues })

  const exists = await prisma.user.findUnique({ where: { email: parsed.data.email } })
  if (exists) return res.status(409).json({ error: 'Ya existe un usuario con ese email' })

  const passwordHash = await bcrypt.hash(parsed.data.password, 10)
  const user = await prisma.user.create({
    data: {
      email: parsed.data.email,
      nombre: parsed.data.nombre,
      passwordHash,
      rol: parsed.data.rol,
      activo: parsed.data.activo ?? true,
    },
    select: { id: true, email: true, nombre: true, rol: true, activo: true, fechaCreacion: true },
  })
  res.status(201).json({ ...user, fechaCreacion: user.fechaCreacion.toISOString() })
})

router.patch('/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos', issues: parsed.error.issues })

  const data: Record<string, unknown> = { ...parsed.data }
  if (parsed.data.password) {
    data.passwordHash = await bcrypt.hash(parsed.data.password, 10)
    delete data.password
  }

  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: { id: true, email: true, nombre: true, rol: true, activo: true, fechaCreacion: true },
    })
    res.json({ ...user, fechaCreacion: user.fechaCreacion.toISOString() })
  } catch {
    res.status(404).json({ error: 'Usuario no encontrado' })
  }
})

/** Listar proyectos asignados a un usuario */
router.get('/:id/projects', async (req, res) => {
  const links = await prisma.userProject.findMany({
    where: { userId: req.params.id },
    select: { projectId: true },
  })
  res.json(links.map(l => l.projectId))
})

/** Reemplazar la lista de proyectos asignados a un usuario */
router.put('/:id/projects', async (req, res) => {
  const parsed = z.object({ projectIds: z.array(z.string()) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos' })

  // Reemplazo total: borrar y recrear
  await prisma.userProject.deleteMany({ where: { userId: req.params.id } })
  if (parsed.data.projectIds.length > 0) {
    await prisma.userProject.createMany({
      data: parsed.data.projectIds.map(projectId => ({ userId: req.params.id, projectId })),
      skipDuplicates: true,
    })
  }
  res.status(204).end()
})

router.delete('/:id', async (req, res) => {
  // Evitar borrar el último admin activo
  const user = await prisma.user.findUnique({ where: { id: req.params.id } })
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

  if (user.rol === 'admin' && user.activo) {
    const adminsActivos = await prisma.user.count({ where: { rol: 'admin', activo: true } })
    if (adminsActivos <= 1) {
      return res.status(400).json({ error: 'No se puede eliminar el último admin activo' })
    }
  }

  await prisma.user.delete({ where: { id: req.params.id } })
  res.status(204).end()
})

export default router
