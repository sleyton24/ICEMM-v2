import { Router } from 'express'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../db.js'
import { requireRole } from '../middleware/auth.js'

/**
 * Bootstrap de migración "dato-por-navegador" → PostgreSQL.
 *
 *   POST /api/sync/import
 *
 * Recibe el export completo del monolito (collectAllData / buildBackupPayload):
 *   { _meta: { app, schemaVersion, ... }, data: { "<clave budget-control:*>": valor } }
 *
 * Recorre cada clave del catálogo `budget-control:*`, la mapea a su tabla destino
 * (ver CONEXION-POSTGRESQL.md §3 / ARQUITECTURA-DATOS.md §3) y la UPSERTea. TODO
 * corre dentro de UNA transacción Prisma: o se importa todo o nada.
 *
 * Reglas que respeta este endpoint (igual que el resto de routers del monolito):
 *   - Escritura protegida con requireRole('admin').
 *   - Autoría (loadedBy/updatedBy/cerradoPor/savedBy) = req.user.id (o null en BETA_MODE).
 *   - Idempotencia: cada clave usa upsert por su clave única natural.
 *   - CLASIFICACIÓN BLOQUEADA: actuals se persiste TAL CUAL (no se reclasifica
 *     server-side; el mapeo 600/700/800 está en revisión contable).
 *   - unCode se normaliza al importar projects (trim + padStart(2) → Int).
 *   - Si una clave no mapea, se registra en la respuesta como `omitidas` (no aborta).
 */

const router = Router()

// El monolito guarda las claves bajo el namespace `budget-control:`.
const NS = 'budget-control:'

// Categorías de costo válidas (8 cats, schema v2). Se usan para validar/filtrar
// budgetByCategory al desnormalizarlo en filas BudgetByCategory.
const COST_CATS = [
  'materiales',
  'mano_de_obra',
  'subcontratos',
  'gastos_generales',
  'equipos_maquinarias',
  'otros',
  'edificaciones_comerciales',
  'post_venta',
] as const

const LIVE_MODULES = ['check', 'scenarios', 'dashboard', 'scorecard'] as const

// ── Validación del envelope ────────────────────────────────────────────────────

const importBodySchema = z.object({
  _meta: z.record(z.any()).optional(),
  data: z.record(z.any()),
})

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Los valores de `data` pueden venir ya parseados (collectAllData) o como string
 * crudo de JSON (buildBackupPayload guarda `clave->rawString`). Normalizamos: si
 * es string que parsea a JSON, devolvemos el objeto; si no, lo dejamos como vino.
 */
function coerceValue(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

/** Columnas Json nullable exigen Prisma.JsonNull para escribir SQL NULL. */
function jsonOrNull(v: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return v == null ? Prisma.JsonNull : (v as Prisma.InputJsonValue)
}

/** unCode del monolito ('2', ' 02 ', 2) → Int normalizado a 2 dígitos. null si no es válido. */
function normUnCodeToInt(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null
  const s = String(raw).trim()
  if (s === '') return null
  const n = Number(s)
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null
  return n
}

/** Fecha 'YYYY-MM' | 'YYYY-MM-DD' | ISO → Date, o null si no parsea. */
function toDateOrNull(raw: unknown): Date | null {
  if (raw === undefined || raw === null || raw === '') return null
  // 'YYYY-MM' del monolito → primer día del mes.
  const s = String(raw)
  const ym = /^(\d{4})-(\d{2})$/.exec(s)
  const iso = ym ? `${ym[1]}-${ym[2]}-01` : s
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

// Patrones de clave (sin el prefijo `budget-control:`).
const RE_BUDGET = /^budget:(\d{4})$/
const RE_ACTUALS = /^actuals:(\d{4}):(\d{2})$/
const RE_OVERRIDES = /^overrides:(\d{4})$/
const RE_PROJ_COMPLETION = /^proj-completion:(\d{4})$/
const RE_PROJ_SNAPSHOT = /^proj-snapshot:(\d{4})$/
const RE_CASHFLOW = /^cashflow:(\d{4})$/
const RE_CONTROL_OBRAS = /^control-obras:(\d{4})$/
const RE_PLAZO_CURVAS = /^plazo-curvas:(\d{4})$/
const RE_MODULE_SNAPSHOT = /^(check|scenarios|dashboard|scorecard)-snapshot:(\d{4})$/
const RE_CIERRE = /^cierre:(\d{4}):(\d{2})$/

// Claves derivadas/transitorias que NO tienen tabla propia y se omiten a propósito
// (se derivan en DB o son ruido de cliente).
const SKIP_KEYS = new Set([
  'session', // → /api/auth (no se importa estado de sesión)
  'users', // → /api/users (CRUD propio; no se importa acá)
  'load-history', // auditoría de carga del cliente; sin tabla destino
  'last-backup', // metadato de respaldo del navegador
])

// Prefijos a omitir (respaldos y derivados de cierre que se recalculan con SELECT).
function isSkippablePrefix(key: string): boolean {
  return (
    key.startsWith('backup:') ||
    key.startsWith('lista-cierres:') ||
    key.startsWith('ultimo-cierre:') ||
    key.endsWith('.corrupt')
  )
}

// ── POST /api/sync/import ──────────────────────────────────────────────────────

router.post('/import', requireRole('admin'), async (req, res) => {
  const parsed = importBodySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Payload inválido', issues: parsed.error.issues })
  }

  // Autoría: req.user.id (null en BETA_MODE / sin sesión).
  const actorId = req.user?.id ?? null

  // Resultado: qué se importó por tabla y qué quedó fuera.
  const imported: Record<string, number> = {}
  const omitidas: Array<{ key: string; motivo: string }> = []
  const todos: Array<{ key: string; motivo: string }> = []
  const errores: Array<{ key: string; error: string }> = []

  const bump = (table: string, n = 1) => {
    imported[table] = (imported[table] ?? 0) + n
  }

  const entries = Object.entries(parsed.data.data)

  try {
    await prisma.$transaction(async (tx) => {
      for (const [rawKey, rawValue] of entries) {
        // Aceptamos claves con o sin el prefijo `budget-control:`.
        const key = rawKey.startsWith(NS) ? rawKey.slice(NS.length) : rawKey
        const value = coerceValue(rawValue)

        // Omisiones por convención (respaldos, derivados, sesión, etc.).
        if (isSkippablePrefix(key) || SKIP_KEYS.has(key)) {
          omitidas.push({ key: rawKey, motivo: 'clave derivada/transitoria sin tabla destino' })
          continue
        }

        try {
          const handled = await routeKey(tx, key, value, actorId, bump)
          if (!handled.ok) {
            if (handled.todo) todos.push({ key: rawKey, motivo: handled.motivo })
            else omitidas.push({ key: rawKey, motivo: handled.motivo })
          }
        } catch (e: any) {
          // Un error de una clave aborta la transacción entera (todo-o-nada).
          // Lo registramos para devolver contexto antes de re-lanzar.
          errores.push({ key: rawKey, error: e?.message ?? 'error desconocido' })
          throw e
        }
      }
    })
  } catch (e: any) {
    // Transacción revertida: nada quedó escrito.
    return res.status(409).json({
      error: 'Import abortado: la transacción se revirtió (ningún dato fue persistido).',
      detalle: e?.message ?? 'error desconocido',
      errores,
    })
  }

  res.json({
    ok: true,
    importadas: imported,
    omitidas,
    todos, // claves reconocidas pero con mapeo pendiente (TODO)
    totalClaves: entries.length,
  })
})

// ── Router de claves → tabla destino ───────────────────────────────────────────

type Tx = Prisma.TransactionClient
type RouteResult =
  | { ok: true }
  | { ok: false; todo: boolean; motivo: string }

async function routeKey(
  tx: Tx,
  key: string,
  value: unknown,
  actorId: string | null,
  bump: (table: string, n?: number) => void,
): Promise<RouteResult> {
  // ── projects → Project + ProjectGestion + BudgetByCategory ──────────────────
  if (key === 'projects') {
    if (!Array.isArray(value)) return { ok: false, todo: false, motivo: 'projects no es un array' }
    await importProjects(tx, value, bump)
    return { ok: true }
  }

  // ── config / cc-url / schema-version → AppConfig ────────────────────────────
  if (key === 'config') {
    // El monolito guarda {controlYear, controlMonth}; en AppConfig va bajo la
    // clave 'controlPeriod' (espeja config.ts KNOWN_KEY_SCHEMAS).
    await tx.appConfig.upsert({
      where: { key: 'controlPeriod' },
      create: { key: 'controlPeriod', value: value as any },
      update: { value: value as any },
    })
    bump('AppConfig')
    return { ok: true }
  }
  if (key === 'cc-url' || key === 'schema-version') {
    await tx.appConfig.upsert({
      where: { key },
      create: { key, value: value as any },
      update: { value: value as any },
    })
    bump('AppConfig')
    return { ok: true }
  }

  // ── budget:{year} → BudgetAnnual ────────────────────────────────────────────
  let m = RE_BUDGET.exec(key)
  if (m) {
    const year = Number(m[1])
    const b = (value ?? {}) as any
    const base = {
      oficinaCentral: (b.oficinaCentral ?? {}) as Prisma.InputJsonValue,
      otherIncome: (b.otherIncome ?? {}) as Prisma.InputJsonValue,
      status: b.status === 'fijado' ? 'fijado' : 'borrador',
      fixedDate: toDateOrNull(b.fixedDate),
      snapshot: jsonOrNull(b.snapshot),
    }
    await tx.budgetAnnual.upsert({
      where: { year },
      create: { year, ...base },
      update: base,
    })
    bump('BudgetAnnual')
    return { ok: true }
  }

  // ── actuals:{year}:{mm} → Actuals (TAL CUAL — clasificación bloqueada) ───────
  m = RE_ACTUALS.exec(key)
  if (m) {
    const year = Number(m[1])
    const month = Number(m[2])
    const a = (value ?? {}) as any
    const data = {
      filename: typeof a.filename === 'string' ? a.filename : '',
      rows: (Array.isArray(a.rows) ? a.rows : []) as Prisma.InputJsonValue,
      loadedById: actorId,
    }
    await tx.actuals.upsert({
      where: { year_month: { year, month } },
      create: { year, month, ...data },
      update: { ...data, loadedAt: new Date() },
    })
    bump('Actuals')
    return { ok: true }
  }

  // ── mayor:latest / balance:latest / uf-table → ErpSource ────────────────────
  // Las claves 'latest' NO traen año/mes en la CLAVE, pero el payload sí los lleva
  // (mayor/balance: {year, month}). uf-table es {[year]:{[month]:{...}}}: se
  // explota a una fila ErpSource por (uf, year, month).
  if (key === 'mayor:latest' || key === 'balance:latest') {
    const tipo = key.startsWith('mayor') ? 'mayor' : 'balance'
    const p = (value ?? {}) as any
    const year = normUnCodeToInt(p.year)
    const month = normUnCodeToInt(p.month)
    if (year === null || month === null || month < 1 || month > 12) {
      return {
        ok: false,
        todo: true,
        motivo: `${tipo}: payload sin year/month válidos; no se puede anclar al período (clave 'latest' sin dimensión)`,
      }
    }
    await tx.erpSource.upsert({
      where: { tipo_year_month: { tipo, year, month } },
      create: { tipo, year, month, payload: p as Prisma.InputJsonValue, filename: p.filename ?? null, loadedById: actorId },
      update: { payload: p as Prisma.InputJsonValue, filename: p.filename ?? null, loadedById: actorId, loadedAt: new Date() },
    })
    bump('ErpSource')
    return { ok: true }
  }
  if (key === 'uf-table') {
    const table = (value ?? {}) as Record<string, any>
    let count = 0
    for (const [yStr, byMonth] of Object.entries(table)) {
      const year = normUnCodeToInt(yStr)
      if (year === null || byMonth == null || typeof byMonth !== 'object') continue
      for (const [mStr, byDay] of Object.entries(byMonth as Record<string, any>)) {
        const month = normUnCodeToInt(mStr)
        if (month === null || month < 1 || month > 12) continue
        await tx.erpSource.upsert({
          where: { tipo_year_month: { tipo: 'uf', year, month } },
          create: { tipo: 'uf', year, month, payload: byDay as Prisma.InputJsonValue, loadedById: actorId },
          update: { payload: byDay as Prisma.InputJsonValue, loadedById: actorId, loadedAt: new Date() },
        })
        count++
      }
    }
    if (count === 0) return { ok: false, todo: true, motivo: 'uf-table sin períodos year/month válidos' }
    bump('ErpSource', count)
    return { ok: true }
  }

  // ── overrides:{year} → Overrides ────────────────────────────────────────────
  m = RE_OVERRIDES.exec(key)
  if (m) {
    const year = Number(m[1])
    const payload = (value ?? {}) as Prisma.InputJsonValue
    await tx.overrides.upsert({
      where: { year },
      create: { year, payload, updatedById: actorId },
      update: { payload, updatedById: actorId },
    })
    bump('Overrides')
    return { ok: true }
  }

  // ── proj-completion:{year} → ProjCompletion (fila por projectId) ────────────
  m = RE_PROJ_COMPLETION.exec(key)
  if (m) {
    const year = Number(m[1])
    const obj = (value ?? {}) as Record<string, any>
    let count = 0
    for (const [projectId, e] of Object.entries(obj)) {
      if (e == null || typeof e !== 'object') continue
      const data = {
        cats: (e.cats ?? {}) as Prisma.InputJsonValue,
        realStart: toDateOrNull(e.realStart),
        projEnd: toDateOrNull(e.projEnd),
        extraWorks: typeof e.extraWorks === 'number' ? e.extraWorks : null,
        overrideContract: jsonOrNull(e.overrideContract),
        replacementName: typeof e.replacementName === 'string' ? e.replacementName : null,
        curvaShift: jsonOrNull(e.curvaShift),
      }
      await tx.projCompletion.upsert({
        where: { year_projectId: { year, projectId } },
        create: { year, projectId, ...data },
        update: data,
      })
      count++
    }
    bump('ProjCompletion', count)
    return { ok: true }
  }

  // ── proj-snapshot:{year} → ProjSnapshot (derivado) ──────────────────────────
  m = RE_PROJ_SNAPSHOT.exec(key)
  if (m) {
    const year = Number(m[1])
    const s = (value ?? {}) as any
    const controlMonth = normUnCodeToInt(s.controlMonth) ?? 1
    // El snapshot del monolito mezcla controlMonth/ts con el payload; aislamos
    // el payload (ingresos/costos/oc/otrosIngresos/anticipos), preservando extras.
    const { controlMonth: _cm, ts: _ts, year: _y, ...payload } = s
    await tx.projSnapshot.upsert({
      where: { year },
      create: { year, controlMonth, payload: payload as Prisma.InputJsonValue, isDerived: true, ts: new Date() },
      update: { controlMonth, payload: payload as Prisma.InputJsonValue, isDerived: true, ts: new Date() },
    })
    bump('ProjSnapshot')
    return { ok: true }
  }

  // ── cashflow:{year} → CashFlow ──────────────────────────────────────────────
  m = RE_CASHFLOW.exec(key)
  if (m) {
    const year = Number(m[1])
    const cf = (value ?? {}) as any
    const num = (v: unknown, d?: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
    const obj = (v: unknown) => (v != null && typeof v === 'object' ? (v as Prisma.InputJsonValue) : ({} as Prisma.InputJsonValue))

    const data: any = {
      cxp: obj(cf.cxp),
      cxc: obj(cf.cxc),
      aportes: obj(cf.aportes),
      devoluciones: obj(cf.devoluciones),
      updatedById: actorId,
    }
    // Escalares: solo si vienen (preservan defaults del schema).
    for (const k of ['cajaInicialEnero', 'saldoIVADicAnterior', 'pctIVACostos', 'pctIVAOC', 'impuestoRenta', 'cajaFinalDic', 'saldoIVADicFinal'] as const) {
      const v = num(cf[k])
      if (v !== undefined) data[k] = v
    }
    data.cajaMensual = jsonOrNull(cf.cajaMensual)
    data.cajaMensualTs = toDateOrNull(cf.cajaMensualTs)

    await tx.cashFlow.upsert({
      where: { year },
      create: { year, ...data },
      update: data,
    })
    bump('CashFlow')
    return { ok: true }
  }

  // ── control-obras:{year} → ControlObras (fila por projectId/mes/área) ───────
  m = RE_CONTROL_OBRAS.exec(key)
  if (m) {
    const year = Number(m[1])
    const blob = (value ?? {}) as Record<string, any>
    let count = 0
    for (const [projectId, byMonth] of Object.entries(blob)) {
      if (byMonth == null || typeof byMonth !== 'object') continue
      for (const [mm, byArea] of Object.entries(byMonth as Record<string, any>)) {
        const month = normUnCodeToInt(mm)
        if (month === null || month < 1 || month > 12 || byArea == null || typeof byArea !== 'object') continue
        for (const [areaId, fields] of Object.entries(byArea as Record<string, any>)) {
          await tx.controlObras.upsert({
            where: { year_projectId_month_areaId: { year, projectId, month, areaId } },
            create: { year, projectId, month, areaId, fields: (fields ?? {}) as Prisma.InputJsonValue, updatedById: actorId },
            update: { fields: (fields ?? {}) as Prisma.InputJsonValue, updatedById: actorId, updatedAt: new Date() },
          })
          count++
        }
      }
    }
    bump('ControlObras', count)
    return { ok: true }
  }

  // ── plazo-curvas:{year} → PlazoCurvas (fila por projectId) ──────────────────
  m = RE_PLAZO_CURVAS.exec(key)
  if (m) {
    const year = Number(m[1])
    const blob = (value ?? {}) as Record<string, any>
    let count = 0
    for (const [projectId, curva] of Object.entries(blob)) {
      if (curva == null || typeof curva !== 'object') continue
      const c = curva as any
      const data = {
        meses: Array.isArray(c.meses) ? (c.meses as string[]) : [],
        programada: (Array.isArray(c.programada) ? c.programada : []) as Prisma.InputJsonValue,
        controlada: (Array.isArray(c.controlada) ? c.controlada : []) as Prisma.InputJsonValue,
      }
      await tx.plazoCurvas.upsert({
        where: { year_projectId: { year, projectId } },
        create: { year, projectId, ...data },
        update: data,
      })
      count++
    }
    bump('PlazoCurvas', count)
    return { ok: true }
  }

  // ── {modulo}-snapshot:{year} → ModuleSnapshotLive ───────────────────────────
  m = RE_MODULE_SNAPSHOT.exec(key)
  if (m) {
    const modulo = m[1] as typeof LIVE_MODULES[number]
    const year = Number(m[2])
    const payload = (value ?? null) as Prisma.InputJsonValue
    await tx.moduleSnapshotLive.upsert({
      where: { modulo_year: { modulo, year } },
      create: { modulo, year, payload },
      update: { payload, ts: new Date() },
    })
    bump('ModuleSnapshotLive')
    return { ok: true }
  }

  // ── cierre:{year}:{mm} → Cierre (snapshot inmutable) ────────────────────────
  m = RE_CIERRE.exec(key)
  if (m) {
    const year = Number(m[1])
    const mes = Number(m[2])
    const c = (value ?? {}) as any
    const data = {
      mesLabel: typeof c.mesLabel === 'string' ? c.mesLabel : `${year}-${String(mes).padStart(2, '0')}`,
      modulos: (c.modulos ?? {}) as Prisma.InputJsonValue,
      cerradoPorId: actorId,
      fechaCierre: toDateOrNull(c.fechaCierre) ?? new Date(),
    }
    // El cierre es inmutable por regla de app: en import usamos upsert para que el
    // bootstrap sea idempotente (reimportar el mismo export no falla).
    await tx.cierre.upsert({
      where: { year_mes: { year, mes } },
      create: { year, mes, ...data },
      update: data,
    })
    bump('Cierre')
    return { ok: true }
  }

  // ── saved-reports:{year} → SavedReport (una fila por entry del array) ────────
  if (/^saved-reports:(\d{4})$/.test(key)) {
    const year = Number(/^saved-reports:(\d{4})$/.exec(key)![1])
    if (!Array.isArray(value)) return { ok: false, todo: false, motivo: 'saved-reports no es un array' }
    let count = 0
    for (const entry of value as any[]) {
      if (entry == null || typeof entry !== 'object') continue
      // El array mezcla 3 formas; el discriminador `tipo` se infiere por presencia
      // del sub-objeto (report | projResumen | cashflow), como hace el monolito.
      let tipo: 'report' | 'projResumen' | 'cashflow' | null = null
      if (entry.report !== undefined) tipo = 'report'
      else if (entry.projResumen !== undefined) tipo = 'projResumen'
      else if (entry.cashflow !== undefined) tipo = 'cashflow'
      if (tipo === null) continue // entry sin sub-objeto reconocible: se ignora
      await tx.savedReport.create({
        data: {
          year,
          tipo,
          label: typeof entry.label === 'string' ? entry.label : '(sin etiqueta)',
          cutoffDate: typeof entry.cutoffDate === 'string' ? entry.cutoffDate : null,
          controlMonth: normUnCodeToInt(entry.controlMonth),
          payload: (entry[tipo] ?? {}) as Prisma.InputJsonValue,
          savedById: actorId,
        },
      })
      count++
    }
    bump('SavedReport', count)
    return { ok: true }
  }

  // ── No mapea ────────────────────────────────────────────────────────────────
  return { ok: false, todo: false, motivo: 'clave no reconocida (sin mapeo a tabla destino)' }
}

// ── projects → Project (+ ProjectGestion + BudgetByCategory) ───────────────────

/**
 * Cada Project del monolito = {id, name, unCode, contractType, status, isOffBudget,
 * startDate, endDate, durationMonths, replacesProject, contract, budgetByCategory,
 * costCurve, revenueCurve}.
 *
 * Reparto a 3 tablas:
 *   - Project          : id (== el id del monolito), nombre, unidadNegocioCodigo (unCode Int).
 *   - ProjectGestion   : 1:1 con Project (contractType, status, isOffBudget, fechas,
 *                        durationMonths, replacesProject, contract, costCurve, revenueCurve).
 *   - BudgetByCategory : una fila por categoría de budgetByCategory.
 *
 * replacesProject (FK self) se aplica en una SEGUNDA pasada: así no falla si el
 * proyecto referenciado aparece más adelante en el array.
 */
async function importProjects(
  tx: Tx,
  projects: any[],
  bump: (table: string, n?: number) => void,
): Promise<void> {
  // Pasada 1: Project + ProjectGestion (sin replacesProject) + BudgetByCategory.
  for (const p of projects) {
    if (p == null || typeof p !== 'object' || typeof p.id !== 'string') continue

    const unCode = normUnCodeToInt(p.unCode)

    // Project (ancla). id del monolito se reusa como Project.id.
    await tx.project.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        nombre: typeof p.name === 'string' ? p.name : '(sin nombre)',
        unidadNegocioCodigo: unCode,
      },
      update: {
        nombre: typeof p.name === 'string' ? p.name : undefined,
        unidadNegocioCodigo: unCode,
      },
    })
    bump('Project')

    // ProjectGestion (1:1). replacesProject se difiere a la pasada 2.
    const gestion = {
      contractType: typeof p.contractType === 'string' ? p.contractType : 'suma_alzada',
      status: typeof p.status === 'string' ? p.status : 'presupuestado',
      isOffBudget: p.isOffBudget === true,
      startDate: toDateOrNull(p.startDate),
      endDate: toDateOrNull(p.endDate),
      durationMonths: typeof p.durationMonths === 'number' ? p.durationMonths : null,
      contract: (p.contract ?? {}) as Prisma.InputJsonValue,
      costCurve: (Array.isArray(p.costCurve) ? p.costCurve : []) as Prisma.InputJsonValue,
      revenueCurve: (Array.isArray(p.revenueCurve) ? p.revenueCurve : []) as Prisma.InputJsonValue,
    }
    await tx.projectGestion.upsert({
      where: { projectId: p.id },
      create: { projectId: p.id, ...gestion },
      update: gestion,
    })
    bump('ProjectGestion')

    // BudgetByCategory (una fila por cat). El monolito guarda montosMensuales como
    // total por cat (number) o ya como vector; persistimos TAL CUAL en el Json.
    const bbc = (p.budgetByCategory ?? {}) as Record<string, unknown>
    for (const categoria of COST_CATS) {
      if (!(categoria in bbc)) continue
      const montosMensuales = bbc[categoria] as Prisma.InputJsonValue
      await tx.budgetByCategory.upsert({
        where: { projectId_categoria: { projectId: p.id, categoria } },
        create: { projectId: p.id, categoria, montosMensuales },
        update: { montosMensuales },
      })
      bump('BudgetByCategory')
    }
  }

  // Pasada 2: aplicar replacesProject solo si apunta a un Project que existe
  // (evita violar la FK self por referencias huérfanas; no valida ciclos acá).
  const knownIds = new Set(
    projects.filter((p) => p && typeof p.id === 'string').map((p) => p.id as string),
  )
  for (const p of projects) {
    if (p == null || typeof p.id !== 'string') continue
    const ref = p.replacesProject
    if (typeof ref === 'string' && ref !== '' && knownIds.has(ref) && ref !== p.id) {
      await tx.projectGestion.update({
        where: { projectId: p.id },
        data: { replacesProject: ref },
      })
    }
  }
}

export default router
