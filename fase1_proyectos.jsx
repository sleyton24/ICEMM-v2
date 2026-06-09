/**
 * FASE 1 — Gestión de Proyectos
 * Sistema de Control Presupuestario - Constructora ICEMM
 *
 * Para ejecutar con Vite:
 *   npm create vite@latest icemm-presupuesto -- --template react
 *   cd icemm-presupuesto && npm install
 *   Reemplazar src/App.jsx con este archivo
 *   Instalar Tailwind: https://tailwindcss.com/docs/guides/vite
 *   npm run dev
 */

import { useState, useEffect, useMemo } from 'react'

// ─── CONSTANTES ───────────────────────────────────────────────────────────────

const COST_CATS = [
  { id: 'materiales',              label: 'Materiales' },
  { id: 'mano_de_obra',            label: 'Mano de Obra' },
  { id: 'subcontratos',            label: 'Subcontratos' },
  { id: 'gastos_generales',        label: 'Gastos Generales' },
  { id: 'equipos_maquinarias',     label: 'Equipos y Maquinarias' },
  { id: 'edificaciones_comerciales', label: 'Edificaciones Comerciales' },
  { id: 'post_venta',              label: 'Post Venta' },
  { id: 'otros',                   label: 'Otros' },
]

const MONTH_ABR = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const NAV_ITEMS = [
  { id: 'projects',   label: 'Proyectos',          icon: '🏗️',  enabled: true },
  { id: 'budget',     label: 'Presupuesto Anual',   icon: '📋',  enabled: false },
  { id: 'data',       label: 'Carga de Datos',      icon: '📂',  enabled: false },
  { id: 'projection', label: 'Proyección Editable', icon: '📈',  enabled: false },
  { id: 'report',     label: 'Informe de Gestión',  icon: '📊',  enabled: false },
  { id: 'cashflow',   label: 'Flujo de Caja',       icon: '💰',  enabled: false },
  { id: 'check',      label: 'Check Contable',      icon: '✅',  enabled: false },
  { id: 'scenarios',  label: 'Escenarios',          icon: '🎯',  enabled: false },
  { id: 'dashboard',  label: 'Dashboard',           icon: '📉',  enabled: false },
]

// ─── STORAGE ─────────────────────────────────────────────────────────────────

const storage = {
  get(key) {
    try {
      const raw = (window.storage?.getItem?.(key)) ?? localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  },
  set(key, value) {
    const raw = JSON.stringify(value)
    try { window.storage?.setItem?.(key, raw) } catch {}
    try { localStorage.setItem(key, raw) } catch {}
  },
}

// ─── UTILIDADES ───────────────────────────────────────────────────────────────

const fUF = v =>
  v == null || v === '' || isNaN(+v)
    ? '–'
    : (+v).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function monthsBetween(start, end) {
  if (!start || !end) return 0
  const [sy, sm] = start.split('-').map(Number)
  const [ey, em] = end.split('-').map(Number)
  const n = (ey - sy) * 12 + (em - sm) + 1
  return n > 0 ? n : 0
}

function getMonthLabels(startDate, n) {
  if (!startDate || !n) return []
  const [year, month] = startDate.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(year, month - 1 + i)
    return `${MONTH_ABR[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`
  })
}

function generateSCurve(n) {
  if (n <= 0) return []
  const sCum = t => 3 * t * t - 2 * t * t * t
  const values = Array.from({ length: n }, (_, i) => {
    const t1 = (i + 1) / n
    const t0 = i / n
    return sCum(t1) - sCum(t0)
  })
  const total = values.reduce((a, b) => a + b, 0)
  const curve = values.map(v => +((v / total) * 100).toFixed(4))
  // Ajustar redondeo para que sume exactamente 100
  const diff = +(100 - curve.reduce((a, b) => a + b, 0)).toFixed(4)
  if (diff !== 0) curve[curve.length - 1] = +(curve[curve.length - 1] + diff).toFixed(4)
  return curve
}

function emptyBudget() {
  return Object.fromEntries(COST_CATS.map(c => [c.id, '']))
}

// ─── DATOS DE PRUEBA ──────────────────────────────────────────────────────────

function makeSampleProjects() {
  const n1 = 24, n2 = 18, n3 = 33
  return [
    {
      id: 'proj-002',
      name: 'La Quebrada',
      unCode: '02',
      contractType: 'suma_alzada',
      status: 'en_ejecucion',
      startDate: '2025-07',
      endDate: '2027-06',
      durationMonths: n1,
      replacesProject: null,
      contract: {
        originalAmount: 285390.89,
        advancePercent: 10,
        retentionPercent: 5,
        extraordinaryWorks: [],
      },
      budgetByCategory: {
        materiales: 50000, mano_de_obra: 65000, subcontratos: 90000,
        gastos_generales: 15000, equipos_maquinarias: 12000,
        edificaciones_comerciales: 0, post_venta: 3546.76, otros: 500,
      },
      costCurve: generateSCurve(n1),
      revenueCurve: generateSCurve(n1),
    },
    {
      id: 'proj-003',
      name: 'Olá Costanera',
      unCode: '03',
      contractType: 'admin_delegada',
      status: 'presupuestado',
      startDate: '2026-07',
      endDate: '2027-12',
      durationMonths: n2,
      replacesProject: null,
      contract: {
        cashAdvance: 1500,
        monthlyGG: 858.63,
        monthlyFee: 1188.50,
        totalBudgetedCost: 263151.63,
      },
      budgetByCategory: {
        materiales: 60000, mano_de_obra: 70000, subcontratos: 95000,
        gastos_generales: 20000, equipos_maquinarias: 15000,
        edificaciones_comerciales: 0, post_venta: 2000, otros: 1151.63,
      },
      costCurve: generateSCurve(n2),
      revenueCurve: generateSCurve(n2),
    },
    {
      id: 'proj-004',
      name: 'Agua del Palo',
      unCode: '04',
      contractType: 'suma_alzada',
      status: 'presupuestado',
      startDate: '2026-10',
      endDate: '2029-06',
      durationMonths: n3,
      replacesProject: null,
      contract: {
        originalAmount: 483046.00,
        advancePercent: 10,
        retentionPercent: 5,
        extraordinaryWorks: [],
      },
      budgetByCategory: {
        materiales: 90000, mano_de_obra: 120000, subcontratos: 180000,
        gastos_generales: 30000, equipos_maquinarias: 25000,
        edificaciones_comerciales: 0, post_venta: 5000, otros: 1000,
      },
      costCurve: generateSCurve(n3),
      revenueCurve: generateSCurve(n3),
    },
  ]
}

// ─── COMPONENTES UI BASE ──────────────────────────────────────────────────────

function Btn({ children, onClick, variant = 'primary', size = 'md', type = 'button', disabled = false, className = '' }) {
  const base = 'rounded-lg font-medium transition-colors inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap'
  const sizes = { sm: 'px-2.5 py-1 text-xs', md: 'px-3.5 py-1.5 text-sm', lg: 'px-4 py-2 text-sm' }
  const variants = {
    primary: 'bg-blue-700 hover:bg-blue-800 text-white shadow-sm',
    danger:  'bg-red-600  hover:bg-red-700  text-white shadow-sm',
    ghost:   'bg-white hover:bg-gray-50 text-gray-700 border border-gray-300',
    success: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm',
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>
      {children}
    </button>
  )
}

function Label({ children, required }) {
  return (
    <label className="block text-xs font-medium text-gray-600 mb-1">
      {children}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  )
}

function InputField({ label, value, onChange, type = 'text', required, placeholder, min, max, step }) {
  return (
    <div>
      {label && <Label required={required}>{label}</Label>}
      <input
        type={type} value={value ?? ''} required={required}
        placeholder={placeholder} min={min} max={max} step={step}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </div>
  )
}

function SelectField({ label, value, onChange, options, required }) {
  return (
    <div>
      {label && <Label required={required}>{label}</Label>}
      <select value={value ?? ''} onChange={e => onChange(e.target.value)} required={required}
        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

function MonthField({ label, value, onChange, required }) {
  return (
    <div>
      {label && <Label required={required}>{label}</Label>}
      <input type="month" value={value ?? ''} required={required} onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </div>
  )
}

function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-10">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-2xl flex flex-col max-h-[88vh]
        ${wide ? 'w-full max-w-5xl' : 'w-full max-w-lg'}`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose}
            className="text-gray-400 hover:text-gray-700 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-lg">
            ✕
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

function SectionBox({ title, children }) {
  return (
    <div className="mb-5">
      <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3 pb-1 border-b border-gray-100">
        {title}
      </div>
      {children}
    </div>
  )
}

function StatusBadge({ status }) {
  const map = {
    presupuestado: 'bg-blue-50 text-blue-700',
    en_ejecucion:  'bg-emerald-50 text-emerald-700',
    terminado:     'bg-gray-100 text-gray-500',
  }
  const labels = { presupuestado: 'Presupuestado', en_ejecucion: 'En Ejecución', terminado: 'Terminado' }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100'}`}>
      {labels[status] || status}
    </span>
  )
}

function TypeBadge({ type }) {
  return type === 'suma_alzada'
    ? <span className="px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700">Suma Alzada</span>
    : <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700">Adm. Delegada</span>
}

// ─── CURVA EDITOR ────────────────────────────────────────────────────────────

function CurveEditor({ label, months, values, onChange }) {
  const total = values.reduce((a, b) => a + (+(b) || 0), 0)
  const isValid = Math.abs(total - 100) < 0.05

  function handleChange(i, v) {
    const next = [...values]
    next[i] = v === '' ? 0 : +v
    onChange(next)
  }

  function handleGenerate() {
    onChange(generateSCurve(values.length))
  }

  let acum = 0

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-mono font-semibold ${isValid ? 'text-emerald-600' : 'text-red-500'}`}>
            Σ = {total.toFixed(2)}%{!isValid && ` (falta ${(100 - total).toFixed(2)}%)`}
          </span>
          <Btn size="sm" variant="ghost" onClick={handleGenerate}>↺ Curva S automática</Btn>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="text-xs border-collapse w-max">
          <thead>
            <tr className="bg-gray-50">
              <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left font-medium text-gray-500 border-r border-gray-200 whitespace-nowrap">
                Mes
              </th>
              {months.map((m, i) => (
                <th key={i} className="px-2 py-2 font-medium text-gray-500 text-center whitespace-nowrap border-r border-gray-200 min-w-[58px]">
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="bg-white">
              <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-medium text-gray-600 border-r border-gray-200">
                % Mes
              </td>
              {values.map((v, i) => (
                <td key={i} className="border-r border-gray-200 p-0">
                  <input
                    type="number" value={v ?? 0}
                    onChange={e => handleChange(i, e.target.value)}
                    step="0.01" min="0" max="100"
                    className="w-full px-1 py-1.5 text-center text-xs focus:outline-none focus:bg-blue-50 min-w-[58px]"
                  />
                </td>
              ))}
            </tr>
            <tr className="bg-gray-50">
              <td className="sticky left-0 z-10 bg-gray-50 px-3 py-1.5 font-medium text-gray-500 border-r border-gray-200">
                Acumulado
              </td>
              {values.map((v, i) => {
                acum += +(v || 0)
                return (
                  <td key={i} className="px-2 py-1.5 text-center border-r border-gray-200 text-gray-400 font-mono">
                    {acum.toFixed(1)}%
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── TABLA PRESUPUESTO POR CLASIFICACIÓN ─────────────────────────────────────

function BudgetTable({ values, onChange }) {
  const total = COST_CATS.reduce((sum, c) => sum + (+(values[c.id]) || 0), 0)
  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-4 py-2.5 text-left font-medium text-gray-500">Clasificación</th>
            <th className="px-4 py-2.5 text-right font-medium text-gray-500 w-48">Presupuesto (UF)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {COST_CATS.map(cat => (
            <tr key={cat.id} className="hover:bg-gray-50">
              <td className="px-4 py-1.5 text-gray-700">{cat.label}</td>
              <td className="p-0">
                <input
                  type="number"
                  value={values[cat.id] ?? ''}
                  onChange={e => onChange({ ...values, [cat.id]: e.target.value === '' ? '' : +e.target.value })}
                  min="0" step="0.01" placeholder="0.00"
                  className="w-full px-4 py-1.5 text-right text-sm focus:outline-none focus:bg-blue-50"
                />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-blue-50 border-t-2 border-blue-200">
            <td className="px-4 py-2.5 font-semibold text-blue-800">Total Costos</td>
            <td className="px-4 py-2.5 text-right font-bold text-blue-800 font-mono">{fUF(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ─── FORMULARIO DE PROYECTO ───────────────────────────────────────────────────

function ProjectForm({ project, projects, onSave, onCancel }) {
  const isNew = !project

  const [form, setForm] = useState(() => {
    if (project) return { ...project }
    return {
      id: `proj-${Date.now().toString().slice(-6)}`,
      name: '',
      unCode: '',
      contractType: 'suma_alzada',
      status: 'presupuestado',
      startDate: '',
      endDate: '',
      durationMonths: 0,
      replacesProject: null,
      contract: { originalAmount: '', advancePercent: 10, retentionPercent: 5, extraordinaryWorks: [] },
      budgetByCategory: emptyBudget(),
      costCurve: [],
      revenueCurve: [],
    }
  })

  const months = useMemo(
    () => getMonthLabels(form.startDate, form.durationMonths),
    [form.startDate, form.durationMonths]
  )

  function set(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function setContract(key, value) {
    setForm(prev => ({ ...prev, contract: { ...prev.contract, [key]: value } }))
  }

  function handleDates(start, end) {
    const n = monthsBetween(start, end)
    setForm(prev => ({
      ...prev,
      startDate: start,
      endDate: end,
      durationMonths: n,
      costCurve: n > 0 ? generateSCurve(n) : [],
      revenueCurve: n > 0 ? generateSCurve(n) : [],
    }))
  }

  function handleContractType(type) {
    const defaultContract = type === 'suma_alzada'
      ? { originalAmount: '', advancePercent: 10, retentionPercent: 5, extraordinaryWorks: [] }
      : { cashAdvance: '', monthlyGG: '', monthlyFee: '', totalBudgetedCost: '' }
    setForm(prev => ({ ...prev, contractType: type, contract: defaultContract }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    // Validar que curvas sumen 100 si hay meses
    if (form.durationMonths > 0) {
      const sumCost = form.costCurve.reduce((a, b) => a + (+b || 0), 0)
      const sumRev  = form.revenueCurve.reduce((a, b) => a + (+b || 0), 0)
      if (Math.abs(sumCost - 100) > 0.1) return alert('La curva de costo debe sumar 100%')
      if (Math.abs(sumRev - 100) > 0.1)  return alert('La curva de facturación debe sumar 100%')
    }
    onSave(form)
  }

  const replaceable = projects.filter(p => p.id !== form.id)

  return (
    <form onSubmit={handleSubmit}>
      {/* Información general */}
      <SectionBox title="Información General">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <InputField label="Nombre del Proyecto" value={form.name}
              onChange={v => set('name', v)} required placeholder="ej: La Quebrada" />
          </div>
          <InputField label="Código Unidad de Negocio" value={form.unCode}
            onChange={v => set('unCode', v)} required placeholder="ej: 02" />
          <SelectField label="Tipo de Contrato" value={form.contractType}
            onChange={handleContractType} required options={[
              { value: 'suma_alzada',    label: 'Suma Alzada' },
              { value: 'admin_delegada', label: 'Administración Delegada' },
            ]} />
          <SelectField label="Estado" value={form.status} onChange={v => set('status', v)} options={[
            { value: 'presupuestado', label: 'Presupuestado' },
            { value: 'en_ejecucion',  label: 'En Ejecución' },
            { value: 'terminado',     label: 'Terminado' },
          ]} />
          <SelectField
            label="Reemplaza a (opcional)"
            value={form.replacesProject ?? ''}
            onChange={v => set('replacesProject', v || null)}
            options={[
              { value: '', label: '— Ninguno —' },
              ...replaceable.map(p => ({ value: p.id, label: `${p.name} (UN ${p.unCode})` })),
            ]}
          />
          <MonthField label="Fecha Inicio" value={form.startDate}
            onChange={v => handleDates(v, form.endDate)} required />
          <MonthField label="Fecha Término" value={form.endDate}
            onChange={v => handleDates(form.startDate, v)} required />
        </div>
        {form.durationMonths > 0 && (
          <p className="text-xs text-gray-400 mt-2">
            Duración calculada: <strong className="text-gray-600">{form.durationMonths} meses</strong>
            {' '}({form.startDate} → {form.endDate})
          </p>
        )}
      </SectionBox>

      {/* Datos del contrato */}
      <SectionBox title={form.contractType === 'suma_alzada' ? 'Datos Contrato – Suma Alzada' : 'Datos Contrato – Administración Delegada'}>
        {form.contractType === 'suma_alzada' ? (
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-3">
              <InputField label="Monto Contrato Original (UF)" type="number"
                value={form.contract.originalAmount}
                onChange={v => setContract('originalAmount', v)} required
                placeholder="285,390.89" min="0" step="0.01" />
            </div>
            <InputField label="% Anticipo" type="number" value={form.contract.advancePercent}
              onChange={v => setContract('advancePercent', v)} min="0" max="50" step="0.1" />
            <InputField label="% Retención" type="number" value={form.contract.retentionPercent}
              onChange={v => setContract('retentionPercent', v)} min="0" max="20" step="0.1" />
            <div className="bg-blue-50 rounded-lg p-2 text-xs text-blue-700">
              <div>Anticipo: <strong>{fUF((+form.contract.originalAmount || 0) * (+form.contract.advancePercent || 0) / 100)} UF</strong></div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <InputField label="Anticipo de Caja (UF)" type="number" value={form.contract.cashAdvance}
              onChange={v => setContract('cashAdvance', v)} min="0" step="0.01" />
            <InputField label="Costo Total Presupuestado (UF)" type="number" value={form.contract.totalBudgetedCost}
              onChange={v => setContract('totalBudgetedCost', v)} min="0" step="0.01" />
            <InputField label="GG Oficina Central Mensual (UF)" type="number" value={form.contract.monthlyGG}
              onChange={v => setContract('monthlyGG', v)} min="0" step="0.01" />
            <InputField label="Honorario Mensual (UF)" type="number" value={form.contract.monthlyFee}
              onChange={v => setContract('monthlyFee', v)} min="0" step="0.01" />
            {form.contract.durationMonths > 0 && (
              <div className="col-span-2 bg-amber-50 rounded-lg p-2 text-xs text-amber-700">
                Honorarios anuales: <strong>{fUF((+form.contract.monthlyFee || 0) * 12)} UF</strong>
              </div>
            )}
          </div>
        )}
      </SectionBox>

      {/* Presupuesto por clasificación */}
      <SectionBox title="Presupuesto de Costos por Clasificación">
        <BudgetTable values={form.budgetByCategory}
          onChange={v => set('budgetByCategory', v)} />
        {form.contractType === 'suma_alzada' && form.contract.originalAmount && (
          <p className="text-xs text-gray-400 mt-2">
            Margen estimado:{' '}
            <strong className="text-gray-600">
              {fUF(
                (+form.contract.originalAmount || 0) -
                COST_CATS.reduce((s, c) => s + (+form.budgetByCategory[c.id] || 0), 0)
              )} UF
            </strong>
          </p>
        )}
      </SectionBox>

      {/* Curvas */}
      {form.durationMonths > 0 && months.length > 0 && (
        <SectionBox title="Curvas de Distribución Temporal">
          <CurveEditor label="Curva de Costo" months={months}
            values={form.costCurve} onChange={v => set('costCurve', v)} />
          <CurveEditor label="Curva de Facturación" months={months}
            values={form.revenueCurve} onChange={v => set('revenueCurve', v)} />
        </SectionBox>
      )}

      {/* Botones */}
      <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
        <Btn variant="ghost" onClick={onCancel}>Cancelar</Btn>
        <Btn type="submit" variant="primary">
          {isNew ? '+ Agregar Proyecto' : '✓ Guardar Cambios'}
        </Btn>
      </div>
    </form>
  )
}

// ─── VISTA PROYECTOS ──────────────────────────────────────────────────────────

function ProjectManager({ projects, setProjects }) {
  const [showForm,    setShowForm]    = useState(false)
  const [editTarget,  setEditTarget]  = useState(null)
  const [confirmDel,  setConfirmDel]  = useState(null)

  function openNew()     { setEditTarget(null); setShowForm(true)  }
  function openEdit(p)   { setEditTarget(p);    setShowForm(true)  }
  function closeForm()   { setShowForm(false);  setEditTarget(null) }

  function handleSave(proj) {
    setProjects(prev =>
      prev.find(p => p.id === proj.id)
        ? prev.map(p => p.id === proj.id ? proj : p)
        : [...prev, proj]
    )
    closeForm()
  }

  function handleDelete(id) {
    setProjects(prev => prev.filter(p => p.id !== id))
    setConfirmDel(null)
  }

  function contractAmount(p) {
    return p.contractType === 'suma_alzada'
      ? +p.contract.originalAmount || 0
      : +p.contract.totalBudgetedCost || 0
  }

  const totalSA = projects
    .filter(p => p.contractType === 'suma_alzada')
    .reduce((s, p) => s + contractAmount(p), 0)
  const totalAD = projects
    .filter(p => p.contractType === 'admin_delegada')
    .reduce((s, p) => s + contractAmount(p), 0)
  const enEjecucion = projects.filter(p => p.status === 'en_ejecucion').length

  return (
    <div>
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Gestión de Proyectos</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {projects.length} proyecto{projects.length !== 1 ? 's' : ''} registrado{projects.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Btn size="lg" onClick={openNew}>+ Agregar Proyecto</Btn>
      </div>

      {/* Tarjetas de resumen */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'En Ejecución', value: enEjecucion, unit: 'proyectos', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
          { label: 'Volumen Suma Alzada', value: fUF(totalSA), unit: 'UF', color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200' },
          { label: 'Volumen Adm. Delegada', value: fUF(totalAD), unit: 'UF', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl p-4 border ${s.bg}`}>
            <p className="text-xs font-medium text-gray-500 mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>
              {s.value} <span className="text-sm font-normal text-gray-400">{s.unit}</span>
            </p>
          </div>
        ))}
      </div>

      {/* Tabla de proyectos */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {['UN', 'Proyecto', 'Tipo', 'Estado', 'Monto / Costo (UF)', 'Inicio', 'Término', 'Meses', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {projects.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-16 text-center">
                  <div className="text-4xl mb-2">🏗️</div>
                  <p className="text-gray-400 text-sm">No hay proyectos registrados</p>
                  <button onClick={openNew} className="text-blue-600 text-sm mt-1 hover:underline">
                    Agrega el primero
                  </button>
                </td>
              </tr>
            )}
            {projects.map(p => (
              <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-mono text-gray-500 text-sm">
                  <span className="bg-gray-100 px-2 py-0.5 rounded text-xs">UN {p.unCode}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="font-semibold text-gray-800 text-sm">{p.name}</div>
                  {p.replacesProject && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      Reemplaza: {projects.find(x => x.id === p.replacesProject)?.name || p.replacesProject}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3"><TypeBadge type={p.contractType} /></td>
                <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                <td className="px-4 py-3 text-right font-mono text-sm text-gray-700">
                  {fUF(contractAmount(p))}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{p.startDate}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{p.endDate}</td>
                <td className="px-4 py-3 text-center text-sm text-gray-500">{p.durationMonths}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <Btn size="sm" variant="ghost" onClick={() => openEdit(p)}>✏️ Editar</Btn>
                    <Btn size="sm" variant="danger" onClick={() => setConfirmDel(p.id)}>🗑</Btn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal: formulario */}
      <Modal
        open={showForm}
        onClose={closeForm}
        title={editTarget ? `Editar: ${editTarget.name}` : 'Nuevo Proyecto'}
        wide
      >
        <ProjectForm
          project={editTarget}
          projects={projects}
          onSave={handleSave}
          onCancel={closeForm}
        />
      </Modal>

      {/* Modal: confirmar eliminación */}
      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="Eliminar Proyecto">
        <p className="text-gray-600 text-sm mb-5">
          ¿Confirmas eliminar el proyecto{' '}
          <strong>{projects.find(p => p.id === confirmDel)?.name}</strong>?
          Esta acción no se puede deshacer.
        </p>
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={() => setConfirmDel(null)}>Cancelar</Btn>
          <Btn variant="danger" onClick={() => handleDelete(confirmDel)}>Sí, eliminar</Btn>
        </div>
      </Modal>
    </div>
  )
}

// ─── SIDEBAR ─────────────────────────────────────────────────────────────────

function Sidebar({ view, setView }) {
  return (
    <aside className="w-56 bg-[#1a2f4e] flex flex-col flex-shrink-0 select-none">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="text-white font-bold text-xl tracking-wide">ICEMM</div>
        <div className="text-blue-300 text-xs mt-0.5 font-medium">Control Presupuestario</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-0.5 px-2 overflow-y-auto">
        {NAV_ITEMS.map(item => {
          const active = view === item.id
          return (
            <button
              key={item.id}
              onClick={() => item.enabled && setView(item.id)}
              disabled={!item.enabled}
              title={!item.enabled ? 'Disponible en próxima fase' : undefined}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all
                flex items-center gap-2.5 group
                ${active
                  ? 'bg-blue-600 text-white font-semibold shadow-md'
                  : item.enabled
                    ? 'text-gray-300 hover:bg-white/10 hover:text-white'
                    : 'text-gray-600 cursor-not-allowed'
                }`}
            >
              <span className="text-base flex-shrink-0">{item.icon}</span>
              <span className="truncate flex-1">{item.label}</span>
              {!item.enabled && (
                <span className="text-[10px] bg-white/10 text-gray-500 px-1.5 py-0.5 rounded-md flex-shrink-0">
                  Fase +
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-white/10">
        <p className="text-xs text-gray-600">Fase 1 · v0.1.0</p>
        <p className="text-xs text-gray-700 mt-0.5">Todos los montos en UF</p>
      </div>
    </aside>
  )
}

// ─── HEADER ──────────────────────────────────────────────────────────────────

function Header({ activeYear, setActiveYear }) {
  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0 h-14">
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <span>Sistema de Control Presupuestario</span>
        <span className="text-gray-300">·</span>
        <span className="text-gray-500 font-medium">ICEMM Ltda.</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500 font-medium">Año activo:</span>
        <select
          value={activeYear}
          onChange={e => setActiveYear(+e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white
            text-gray-700 font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
        >
          {[2024, 2025, 2026, 2027, 2028].map(y => <option key={y}>{y}</option>)}
        </select>
      </div>
    </header>
  )
}

// ─── PLACEHOLDER ─────────────────────────────────────────────────────────────

function Placeholder({ module }) {
  const labels = {
    budget:     'Presupuesto Anual',
    data:       'Carga de Datos Mensuales',
    projection: 'Proyección Editable',
    report:     'Informe de Gestión',
    cashflow:   'Flujo de Caja',
    check:      'Check Contable',
    scenarios:  'Escenarios',
    dashboard:  'Dashboard Ejecutivo',
  }
  return (
    <div className="flex flex-col items-center justify-center h-96 text-center">
      <div className="w-20 h-20 rounded-2xl bg-gray-100 flex items-center justify-center text-4xl mb-4">🚧</div>
      <h2 className="text-xl font-semibold text-gray-600">{labels[module] || module}</h2>
      <p className="text-gray-400 mt-2 text-sm max-w-xs">
        Este módulo se implementará en la siguiente fase del desarrollo.
      </p>
    </div>
  )
}

// ─── APP PRINCIPAL ────────────────────────────────────────────────────────────

export default function App() {
  const [view,       setView]       = useState('projects')
  const [activeYear, setActiveYear] = useState(2026)
  const [projects,   setProjects]   = useState([])

  // Cargar desde storage al inicio
  useEffect(() => {
    const saved = storage.get('budget-control:projects')
    setProjects(saved && saved.length > 0 ? saved : makeSampleProjects())
  }, [])

  // Persistir cuando cambian los proyectos
  useEffect(() => {
    if (projects.length > 0) storage.set('budget-control:projects', projects)
  }, [projects])

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 font-sans text-sm">
      <Sidebar view={view} setView={setView} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header activeYear={activeYear} setActiveYear={setActiveYear} />
        <main className="flex-1 overflow-y-auto p-6">
          {view === 'projects'
            ? <ProjectManager projects={projects} setProjects={setProjects} />
            : <Placeholder module={view} />
          }
        </main>
      </div>
    </div>
  )
}
