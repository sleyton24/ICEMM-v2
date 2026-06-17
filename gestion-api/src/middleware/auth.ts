import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

/**
 * Auth middleware con dos modos:
 *
 *   BETA_MODE=true   → acceso libre (gerencia probando, sin login)
 *   BETA_MODE=false  → requiere Bearer JWT firmado con JWT_SECRET
 *
 * Adjunta `req.user` cuando hay sesión real.
 */

export interface AuthUser {
  id: string
  email: string
  nombre: string
  rol: 'admin' | 'editor' | 'viewer' | 'director'
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser
    isBeta?: boolean
  }
}

// BETA_MODE: default SEGURO = false. Solo true si se pide explícitamente.
// En true se hace bypass total de auth (cualquiera lee/escribe). Usar solo en
// entornos cerrados de QA, NUNCA expuesto a internet sin firewall.
const BETA_MODE = process.env.BETA_MODE === 'true'

// JWT_SECRET es OBLIGATORIO. No hay fallback: si falta, es el placeholder, o
// es demasiado corto para ser seguro, abortamos el arranque del proceso.
// Esto evita firmar/verificar tokens con un secreto conocido en producción.
const PLACEHOLDER_SECRETS = new Set([
  'change-me-in-production',
  'replace-with-long-random-string',
])
const JWT_SECRET = process.env.JWT_SECRET ?? ''

if (!JWT_SECRET || PLACEHOLDER_SECRETS.has(JWT_SECRET) || JWT_SECRET.length < 32) {
  // Fail-fast en el bootstrap del módulo: el server no debe arrancar nunca con
  // un secreto inseguro. Generar uno con:
  //   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  console.error(
    '[FATAL] JWT_SECRET inválido. Debe estar definido, no ser un placeholder y ' +
      'tener al menos 32 caracteres. Generar con: ' +
      'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
  )
  process.exit(1)
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (BETA_MODE) {
    req.isBeta = true
    return next()
  }

  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' })
  }
  const token = auth.slice(7)
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthUser
    req.user = payload
    next()
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' })
  }
}

/**
 * Middleware "soft": setea req.isBeta y req.user si hay token válido,
 * pero NO bloquea si no hay credenciales. Para endpoints públicos (ej: /auth/me).
 */
export function softAuthMiddleware(req: Request, _res: Response, next: NextFunction) {
  if (BETA_MODE) {
    req.isBeta = true
    return next()
  }
  const auth = req.headers.authorization
  if (auth?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(auth.slice(7), JWT_SECRET) as AuthUser
      req.user = payload
    } catch { /* ignore — sin user */ }
  }
  next()
}

/** Permite acción solo a roles indicados. En BETA_MODE deja pasar todo. */
export function requireRole(...roles: AuthUser['rol'][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.isBeta) return next()
    if (!req.user) return res.status(401).json({ error: 'No autenticado' })
    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'Permiso insuficiente' })
    }
    next()
  }
}

export function signToken(user: AuthUser, expiresIn: string = '7d'): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn } as jwt.SignOptions)
}
