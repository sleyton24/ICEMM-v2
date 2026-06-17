import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireRole } from '../middleware/auth.js'

const router = Router()

// Etiqueta de mes (espeja MONTH_ABR del monolito → mesLabel "Abr 2026").
const MONTH_ABR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'] as const

const SCHEMA_VERSION = 2

// Los 4 módulos vivos (ModuleSnapshotLive) que el cierre congela junto a projection+cashflow+report.
const LIVE_MODULES = ['check', 'scenarios', 'dashboard', 'scorecard'] as const

// ── Validación ────────────────────────────────────────────────────────────────

const yearSchema = z.coerce.number().int().min(2000).max(2100)
const mesSchema = z.coerce.number().int().min(1).max(12)

const cerrarBodySchema = z.object({
  // El report calculado lo aporta el llamador (el monolito lo arma en cerrarInforme).
  report: z.any().optional(),
  // mesLabel opcional: si no viene, se deriva de MONTH_ABR.
  mesLabel: z.string().optional(),
  // Idempotencia: rechazar recierre salvo overwrite explícito.
  overwrite: z.boolean().optional(),
})

// ── GET /api/cierres/:year ─────────────────────────────────────────────────────
// Lista de meses cerrados (reemplaza lista-cierres + ultimo-cierre con un SELECT).
router.get('/:year', async (req, res) => {
  const year = yearSchema.safeParse(req.params.year)
  if (!year.success) return res.status(400).json({ error: 'year inválido' })

  const cierres = await prisma.cierre.findMany({
    where: { year: year.data },
    orderBy: { mes: 'asc' },
    select: { mes: true, mesLabel: true, fechaCierre: true, cerradoPorId: true },
  })

  const meses = cierres.map((c) => c.mes)
  res.json({
    year: year.data,
    meses, // lista-cierres
    ultimoCierre: meses.length ? meses[meses.length - 1] : null, // ultimo-cierre
    cierres: cierres.map((c) => ({
      mes: c.mes,
      mesLabel: c.mesLabel,
      fechaCierre: c.fechaCierre.toISOString(),
      cerradoPorId: c.cerradoPorId,
    })),
  })
})

// ── GET /api/cierres/:year/:mes ───────────────────────────────────────────────
// Snapshot global congelado de un cierre.
router.get('/:year/:mes', async (req, res) => {
  const year = yearSchema.safeParse(req.params.year)
  const mes = mesSchema.safeParse(req.params.mes)
  if (!year.success || !mes.success) return res.status(400).json({ error: 'year/mes inválidos' })

  const cierre = await prisma.cierre.findUnique({
    where: { year_mes: { year: year.data, mes: mes.data } },
  })
  if (!cierre) return res.status(404).json({ error: 'No hay cierre para ese período' })

  res.json(toCierreDTO(cierre))
})

// ── POST /api/cierres/:year/:mes ──────────────────────────────────────────────
// CERRAR mes: transacción atómica que congela los 7 módulos (versión server-side
// del cierre multi-clave NO atómico del monolito). Idempotente: 409 si ya existe
// salvo body.overwrite === true.
router.post('/:year/:mes', requireRole('admin', 'editor'), async (req, res) => {
  const year = yearSchema.safeParse(req.params.year)
  const mes = mesSchema.safeParse(req.params.mes)
  if (!year.success || !mes.success) return res.status(400).json({ error: 'year/mes inválidos' })

  const parsed = cerrarBodySchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues })

  const y = year.data
  const m = mes.data
  const { report, overwrite } = parsed.data
  const mesLabel = parsed.data.mesLabel ?? `${MONTH_ABR[m - 1]} ${y}`
  // Autoría: req.user.id (null en BETA_MODE / sin sesión).
  const cerradoPorId = req.user?.id ?? null

  try {
    const cierre = await prisma.$transaction(async (tx) => {
      // 1) Idempotencia: rechazar recierre salvo overwrite.
      const existing = await tx.cierre.findUnique({ where: { year_mes: { year: y, mes: m } } })
      if (existing && !overwrite) {
        // Marcador para mapear a 409 fuera de la transacción.
        const e = new Error('CIERRE_EXISTE') as Error & { code?: string }
        e.code = 'CIERRE_EXISTE'
        throw e
      }

      // 2) Leer los snapshots vivos necesarios DENTRO de la misma transacción.
      const projection = await tx.projSnapshot.findUnique({ where: { year: y } })
      const cashflow = await tx.cashFlow.findUnique({ where: { year: y } })
      const liveRows = await tx.moduleSnapshotLive.findMany({
        where: { year: y, modulo: { in: LIVE_MODULES as unknown as string[] } },
      })
      const liveByModulo = new Map(liveRows.map((r) => [r.modulo, r.payload]))

      // 3) Armar el blob `modulos` con copias congeladas (null si el módulo
      //    aún no publicó su snapshot vivo — igual que el monolito).
      const modulos = {
        projection: projection?.payload ?? null,
        cashflow: cashflow ? toCashFlowSnapshot(cashflow) : null,
        check: liveByModulo.get('check') ?? null,
        scenarios: liveByModulo.get('scenarios') ?? null,
        dashboard: liveByModulo.get('dashboard') ?? null,
        scorecard: liveByModulo.get('scorecard') ?? null,
        report: report ?? null,
      }

      // 4) Escribir la fila Cierre (upsert para soportar overwrite atómico).
      return tx.cierre.upsert({
        where: { year_mes: { year: y, mes: m } },
        create: {
          year: y,
          mes: m,
          mesLabel,
          modulos,
          schemaVersion: SCHEMA_VERSION,
          cerradoPorId,
        },
        update: {
          mesLabel,
          modulos,
          schemaVersion: SCHEMA_VERSION,
          cerradoPorId,
          fechaCierre: new Date(),
        },
      })
    })

    res.status(existedStatus(overwrite)).json(toCierreDTO(cierre))
  } catch (err: any) {
    if (err?.code === 'CIERRE_EXISTE') {
      return res.status(409).json({ error: 'El mes ya está cerrado. Enviar overwrite=true para recerrar.' })
    }
    console.error(err)
    res.status(500).json({ error: err?.message ?? 'Error al cerrar el mes' })
  }
})

// ── Helpers ──────────────────────────────────────────────────────────────────

// 200 si fue recierre (overwrite), 201 si fue cierre nuevo.
function existedStatus(overwrite?: boolean): number {
  return overwrite ? 200 : 201
}

/**
 * Espeja la copia congelada de cashflow que el monolito guarda en
 * modulos.cashflow (la clave viva budget-control:cashflow:{year} completa,
 * con derivados cajaMensual/cajaFinalDic/saldoIVADicFinal).
 */
function toCashFlowSnapshot(c: any) {
  return {
    year: c.year,
    cajaInicialEnero: c.cajaInicialEnero,
    saldoIVADicAnterior: c.saldoIVADicAnterior,
    pctIVACostos: c.pctIVACostos,
    pctIVAOC: c.pctIVAOC,
    impuestoRenta: c.impuestoRenta,
    cxp: c.cxp,
    cxc: c.cxc,
    aportes: c.aportes,
    devoluciones: c.devoluciones,
    cajaFinalDic: c.cajaFinalDic ?? null,
    cajaMensual: c.cajaMensual ?? null,
    saldoIVADicFinal: c.saldoIVADicFinal ?? null,
    schemaVersion: c.schemaVersion,
  }
}

/** Cierre (Prisma) → DTO con la forma que espera el monolito (cierre:{year}:{mm}). */
function toCierreDTO(c: any) {
  return {
    year: c.year,
    mes: c.mes,
    mesLabel: c.mesLabel,
    fechaCierre: c.fechaCierre.toISOString(),
    modulos: c.modulos,
    schemaVersion: c.schemaVersion,
    cerradoPorId: c.cerradoPorId ?? null,
  }
}

export default router
