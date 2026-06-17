import { Router } from 'express'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { prisma } from '../db.js'
import { signToken } from '../middleware/auth.js'

const router = Router()

// Limite estricto para login: 10 intentos por IP cada 15 minutos
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  message: { error: 'Demasiados intentos. Intenta más tarde.' },
  standardHeaders: true,
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

router.post('/login', loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Email o password inválidos' })

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } })
  if (!user || !user.activo) return res.status(401).json({ error: 'Credenciales inválidas' })

  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash)
  if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' })

  const token = signToken({
    id: user.id,
    email: user.email,
    nombre: user.nombre,
    rol: user.rol as 'admin' | 'editor' | 'viewer' | 'director',
  })
  res.json({ token, user: { id: user.id, email: user.email, nombre: user.nombre, rol: user.rol } })
})

router.get('/me', (req, res) => {
  if (req.isBeta) {
    // En BETA, no hay login pero asumimos rol 'admin' para que el frontend habilite todo.
    return res.json({
      beta: true,
      user: { id: 'beta', email: 'beta@icemm', nombre: 'Beta', rol: 'admin' },
    })
  }
  res.json({ beta: false, user: req.user ?? null })
})

export default router
