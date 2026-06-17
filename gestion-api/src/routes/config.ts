import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireRole } from '../middleware/auth.js'

const router = Router()

// ── Validación por clave conocida ────────────────────────────────────────────
// Las claves esperadas tienen una forma fija. Para claves no listadas dejamos
// pasar cualquier Json (config global extensible), pero las conocidas se validan
// para no persistir basura que el monolito no sepa leer.

const controlPeriodSchema = z.object({
  controlYear: z.number().int(),
  controlMonth: z.number().int().min(1).max(12),
})

// cc-url debe ser HTTPS (la IP HTTP plana del iframe ControlCostos se migra a TLS).
const ccUrlSchema = z.string().url().refine((u) => u.startsWith('https://'), {
  message: 'cc-url debe ser HTTPS',
})

const schemaVersionSchema = z.number()

const KNOWN_KEY_SCHEMAS: Record<string, z.ZodTypeAny> = {
  controlPeriod: controlPeriodSchema,
  'cc-url': ccUrlSchema,
  'schema-version': schemaVersionSchema,
}

/** Valida value contra el schema de la clave si es conocida. Devuelve {ok,value} o {ok:false,issues}. */
function validateEntry(key: string, value: unknown): { ok: true; value: unknown } | { ok: false; issues: unknown } {
  const schema = KNOWN_KEY_SCHEMAS[key]
  if (!schema) return { ok: true, value }
  const parsed = schema.safeParse(value)
  if (!parsed.success) return { ok: false, issues: parsed.error.issues }
  return { ok: true, value: parsed.data }
}

// ── GET /api/config ───────────────────────────────────────────────────────────
// Devuelve todas las filas como objeto { key: value }. Vacío {} si aún no hay
// nada cargado (no 404).

router.get('/', async (_req, res) => {
  const rows = await prisma.appConfig.findMany()
  const out: Record<string, unknown> = {}
  for (const row of rows) out[row.key] = row.value
  res.json(out)
})

// ── PUT /api/config ─────────────────────────────────────────────────────────
// Upsert. Acepta dos formas:
//   1) { key, value }                       → una sola clave
//   2) { [key]: value, [key2]: value2, ... } → objeto de varias claves
// Devuelve el config completo resultante (mismo shape que GET).

const singleEntrySchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
})

router.put('/', requireRole('admin', 'editor'), async (req, res) => {
  const body = req.body

  // Determinar las entradas a upsertear.
  let entries: Array<{ key: string; value: unknown }>

  const single = singleEntrySchema.safeParse(body)
  if (single.success && 'key' in (body ?? {})) {
    entries = [{ key: single.data.key, value: single.data.value }]
  } else if (body && typeof body === 'object' && !Array.isArray(body)) {
    entries = Object.entries(body as Record<string, unknown>).map(([key, value]) => ({ key, value }))
  } else {
    return res.status(400).json({ error: 'Payload inválido: esperado {key,value} o un objeto {clave:valor}' })
  }

  if (entries.length === 0) {
    return res.status(400).json({ error: 'Payload vacío: nada que actualizar' })
  }

  // Validar cada entrada conocida ANTES de escribir (no upsert parcial).
  for (const { key, value } of entries) {
    const v = validateEntry(key, value)
    if (!v.ok) {
      return res.status(400).json({ error: `Valor inválido para "${key}"`, issues: v.issues })
    }
  }

  await prisma.$transaction(
    entries.map(({ key, value }) =>
      prisma.appConfig.upsert({
        where: { key },
        create: { key, value: value as any },
        update: { value: value as any },
      }),
    ),
  )

  const rows = await prisma.appConfig.findMany()
  const out: Record<string, unknown> = {}
  for (const row of rows) out[row.key] = row.value
  res.json(out)
})

export default router
