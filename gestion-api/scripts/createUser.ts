/**
 * Crea un usuario manualmente.
 * Uso: npm run seed:user -- --email=admin@bnv.cl --password='xxx' --nombre='Admin' --rol=admin
 */
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { prisma } from '../src/db.js'

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, ...rest] = a.replace(/^--/, '').split('=')
    return [k, rest.join('=')]
  })
)

const { email, password, nombre, rol = 'admin' } = args
if (!email || !password || !nombre) {
  console.error('Uso: --email=... --password=... --nombre=... [--rol=admin|editor|viewer]')
  process.exit(1)
}

const passwordHash = await bcrypt.hash(password, 10)
const user = await prisma.user.upsert({
  where: { email },
  create: { email, passwordHash, nombre, rol, activo: true },
  update: { passwordHash, nombre, rol, activo: true },
})

console.log('✓ Usuario:', user.email, '(', user.rol, ')')
process.exit(0)
