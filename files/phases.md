# Fases de Construcción - Prompts para Claude Code

## Instrucciones de Uso

Copiar el prompt de cada fase y pegarlo en Claude Code. Cada fase produce un archivo .jsx funcional.
Al iniciar la fase siguiente, indicar "Partiendo del archivo de la fase anterior, agregar..."
NO saltar fases. Construir en orden.

---

## FASE 1: Estructura Base + Gestión de Proyectos

### Prompt:

```
Genera un archivo React .jsx con una aplicación de control presupuestario para una constructora chilena.
Todos los montos están en UF (Unidad de Fomento).

FASE 1 - Solo construir:

1. NAVEGACIÓN: Sidebar izquierdo con menú de módulos (solo "Proyectos" activo por ahora, 
   los demás como placeholders deshabilitados: Presupuesto, Carga Datos, Proyección, 
   Informe Gestión, Flujo Caja, Check Contable, Escenarios, Dashboard).
   Header con logo "ICEMM" y selector de año activo.

2. GESTIÓN DE PROYECTOS - Pantalla con:
   
   a) Lista de proyectos existentes (tabla con: nombre, código UN, tipo contrato, estado, 
      monto contrato, fecha inicio, fecha término)
   
   b) Botón "Agregar Proyecto" que abre un formulario con:
      - Nombre del proyecto (texto)
      - Código Unidad de Negocio (número, ej: 02, 03, 04)
      - Tipo de contrato: selector "Suma Alzada" o "Administración Delegada"
      - Estado: Presupuestado / En Ejecución / Terminado
      - Fecha inicio (mes/año)
      - Fecha término proyectada (mes/año)
      
      Si es SUMA ALZADA:
      - Monto contrato original (UF)
      - % Anticipo (default 10)
      - % Retención (default 5)
      
      Si es ADMINISTRACIÓN DELEGADA:
      - Anticipo de caja (UF)
      - GG Oficina Central mensual (UF)
      - Honorario mensual (UF)
      - Costo total presupuestado (UF)
      
      Para ambos tipos:
      - Proyecto que reemplaza en el presupuesto (selector opcional)
      
   c) Presupuesto de costos: tabla editable con 8 filas (clasificaciones):
      Materiales, Mano de Obra, Subcontratos, Gastos Generales, 
      Equipos y Maquinarias, Edificaciones Comerciales, Post Venta, Otros
      Cada fila con campo de monto en UF. Total calculado automáticamente.
   
   d) Curvas de costo y facturación: dos tablas editables.
      Columnas = meses del proyecto (desde inicio hasta término).
      Una fila de porcentajes que deben sumar 100%.
      Mostrar acumulado debajo. Validar suma = 100%.
      Botón "Generar curva S" que proponga una distribución automática tipo S.

3. PERSISTENCIA: Usar window.storage API con try-catch.
   Key: "budget-control:projects" para guardar array de proyectos.
   Cargar al inicio, guardar al crear/editar/eliminar.

4. DATOS DE PRUEBA: Precargar 3 proyectos al primer uso:
   - "La Quebrada" (UN:02, Suma Alzada, En Ejecución, contrato 285,391 UF, inicio jul-2025)
   - "Olá Costanera" (UN:03, Admin Delegada, Presupuestado, costo 263,152 UF, inicio jul-2026)
   - "Agua del Palo" (UN:04, Suma Alzada, Presupuestado, contrato 483,046 UF, inicio oct-2026)

Usar React con hooks, Tailwind CSS. Diseño profesional, colores corporativos sobrios 
(azul oscuro, gris, blanco). Formatear números con separador de miles y 2 decimales.
```

---

## FASE 2: Presupuesto Anual

### Prompt:

```
Partiendo del archivo de la Fase 1, agregar el módulo de PRESUPUESTO ANUAL.
Activar el item "Presupuesto" en el menú.

FASE 2 - Agregar:

1. PRESUPUESTO ANUAL - Pantalla con:

   a) Selector de año (default 2026)
   b) Estado: "Borrador" o "Fijado" (indicador visual)
   c) Botón "Fijar Presupuesto" (una vez fijado, no se puede editar)
   
   d) Tabla de INGRESOS presupuestados:
      - Filas: un bloque por cada proyecto del año
      - Columnas: Ene a Dic + Total Año
      - Para Suma Alzada: mostrar fila de facturación neta mensual
        (calculada: contrato × curvaFacturación[mes] − devAnticipo − retención)
      - Para Admin Delegada: rendición + GG + honorario mensual
      - Fila "Otros Ingresos" (asesorías) editable
      - Fila TOTAL INGRESOS
   
   e) Tabla de COSTOS presupuestados:
      - Por cada proyecto: 8 filas (clasificaciones) con montos mensuales
        (calculados: presupuesto clasificación × curvaCosto[mes])
      - Total por proyecto
      - TOTAL COSTOS
   
   f) Tabla de OFICINA CENTRAL presupuestada:
      - 16 filas editables (categorías de costo de oficina):
        Back Office, RRHH, Marketing, Software/Redes, Cuentas servicio,
        GG Oficina, Arriendo oficinas, Costos financieros, Costos legales,
        Arriendo bodega, Asesorías, Directorio, Post venta, Dev. capital,
        Incentivos, Otros
      - Columnas: Ene a Dic + Total
      - TOTAL OFICINA CENTRAL
   
   g) Línea de RESULTADO = Total Ingresos − Total Costos − Oficina Central
   
   h) Persistencia: key "budget-control:budget:{año}"

Los montos presupuestados de costos de proyecto se calculan automáticamente
desde el presupuesto por clasificación del proyecto × su curva de costo mensual.
Los de oficina central son editables manualmente.
Si el presupuesto está "Fijado", toda la tabla se muestra read-only con fondo gris suave.
```

---

## FASE 3: Carga de Datos Mensuales

### Prompt:

```
Partiendo del archivo de la Fase 2, agregar el módulo de CARGA DE DATOS.
Activar el item "Carga Datos" en el menú.

FASE 3 - Agregar:

1. CARGA DE DATOS MENSUALES - Pantalla con:

   a) Selector de "Mes de Control" (mes/año hasta el cual hay datos reales)
   
   b) Sección REPORTE MANAGER:
      - Botón "Cargar Reporte Manager" que acepta .xlsx y .csv
      - Al cargar, usar SheetJS (xlsx) para leer el archivo
      - Procesar: filtrar por mes/año, clasificar por:
        * Columna "Codigo Unidad de Negocio" (col 2) → proyecto
        * Columna "concepto1_codigo" (col 19) → clasificación de gestión
          Mapeo: 100-149=Materiales, 200-249=Mano Obra, 300-399=Subcontratos,
          400-499=GG, 500-549=Equipos, 600-649=Edificaciones, 700-749=PostVenta,
          800-899=Otros, 900+=Oficina Central
        * Sumar columnas "exento_detalle_uf" (col 14) + "afecto_detalle_uf" (col 16)
      - Mostrar tabla resumen de lo procesado:
        Proyecto | Clasificación | Monto UF
      - Botón "Confirmar carga" para guardar
   
   c) Sección MAYOR ICEMM:
      - Botón "Cargar Mayor ICEMM" que acepta .xlsx y .csv
      - Procesar y almacenar para uso en Check Contable (fase posterior)
   
   d) Sección TABLA UF:
      - Tabla editable con meses del año y valor UF promedio del mes
      - Se usa para conversiones CLP→UF cuando sea necesario
   
   e) Historial de cargas:
      - Tabla mostrando qué meses ya fueron cargados, fecha de carga, archivo fuente
   
   f) Persistencia: 
      - "budget-control:actuals:{año}:{mes}" para datos reales
      - "budget-control:config" para mes de control activo
      - "budget-control:uf-table" para tabla UF

Validaciones: warning si el mes ya fue cargado, error si código UN no existe
en proyectos registrados, mostrar registros no clasificados.
```

---

## FASE 4: Proyección Editable

### Prompt:

```
Partiendo del archivo de la Fase 3, agregar el módulo de PROYECCIÓN EDITABLE.
Activar el item "Proyección" en el menú.

FASE 4 - Agregar:

1. PROYECCIÓN EDITABLE - Pantalla con:

   a) Selector de proyecto (tabs o dropdown)
   
   b) Por cada proyecto, tabla con:
      - Filas: 8 clasificaciones de gestión + fila TOTAL
      - Columnas: Ene a Dic + Total Año
      - Celdas de meses ≤ mes de control:
        * Muestran datos REALES (de la carga de datos)
        * Fondo gris claro, NO editables
        * Si no hay datos cargados para ese mes, mostrar 0
      - Celdas de meses > mes de control:
        * Muestran datos PROYECTADOS calculados automáticamente
        * Fondo blanco, SÍ editables (click para editar)
        * Cálculo: saldoPendiente × curvaCosto[mes] / sumaCurvaRestante
          donde saldoPendiente = presupuesto_clasificación − Σ(reales) − Σ(overrides)
        * Si el usuario escribe un valor: fondo AMARILLO SUAVE
        * Botón pequeño "↺" junto a celda amarilla para restaurar el calculado
        * Al cambiar un override, recalcular las demás celdas proyectadas
   
   c) Tab "Oficina Central":
      - Filas: 16 categorías de costo
      - Misma lógica real/proyectado
      - Proyección default: repetir promedio de meses reales
      - También editable con override
   
   d) Tab "Ingresos":
      - Por cada proyecto: facturación proyectada mensual
      - Para Suma Alzada: contrato × curvaFacturación − devAnticipo − retención
      - Para Admin Delegada: rendición(=costo) + GG + honorario
      - También editable con override
   
   e) Persistencia:
      - "budget-control:projection:{año}" para proyección completa
      - "budget-control:overrides:{año}" para overrides manuales

Importante: distinguir visualmente los 3 estados de celda:
- Gris = real (no editable)
- Blanco = proyectado automático (editable)  
- Amarillo suave = override manual (editable, con botón restaurar)
```

---

## FASE 5: Informe de Gestión

### Prompt:

```
Partiendo del archivo de la Fase 4, agregar el módulo de INFORME DE GESTIÓN.
Activar el item "Informe Gestión" en el menú.

FASE 5 - Agregar:

1. INFORME DE GESTIÓN - Pantalla con tabla principal:

   a) Estructura de columnas POR CADA MES (Ene a Dic):
      4 sub-columnas: Real | Ppto | Proy | Diff Ppto
      - Real: dato real si mes ≤ control, vacío si mes > control
      - Ppto: del presupuesto fijado
      - Proy: de la proyección (real si ≤ control, proyectado si > control)
      - Diff Ppto: Proy − Ppto (verde si favorable, rojo si desfavorable)
   
   b) Estructura de filas:
      
      INGRESOS OPERACIONALES:
      - [Nombre Proyecto 1]
      - [Nombre Proyecto 2]  
      - [Nombre Proyecto N]
      - Otros Ingresos
      - **Total Ingresos Ops.**
      
      COSTOS DE OBRA (bloque por proyecto):
      - [Proyecto]: 8 sub-filas (clasificaciones) + subtotal
      - (repetir por cada proyecto)
      - **Total Gastos Ops.**
      
      **RESULTADO OPERACIONAL** = Ingresos − Costos
      
      GASTOS OFICINA CENTRAL:
      - 16 categorías
      - **Total Oficina Central**
      
      **EBITDA** = Resultado Operacional − Oficina Central
   
   c) Sección de TOTALES al final (columnas adicionales):
      - YTD Real | YTD Ppto | YTD Diff | YTD % Ppto
      - YTG Proy | YTG Ppto
      - FY Proy | FY Ppto | FY Diff | FY % Ppto
      
      YTD = suma de meses 1 hasta mes de control
      YTG = suma de meses (control+1) hasta 12
      FY = YTD + YTG
   
   d) Formato visual:
      - Valores negativos en rojo
      - Desviaciones: flecha ↑ verde (favorable) o ↓ roja (desfavorable)
      - Filas de totales en negrita con fondo más oscuro
      - Tabla scrolleable horizontalmente
      - Botón para exportar/imprimir

Los datos se toman de: presupuesto fijado (Ppto), datos reales cargados + 
proyección editada (Real y Proy).
```

---

## FASE 6: Flujo de Caja

### Prompt:

```
Partiendo del archivo de la Fase 5, agregar el módulo de FLUJO DE CAJA.
Activar el item "Flujo Caja" en el menú.

FASE 6 - Agregar:

1. FLUJO DE CAJA - Pantalla con:

   a) Tabla mensual (columnas: meses del año + Total):
   
      INGRESOS:
      - Anticipos (desglose por proyecto)
        * Suma Alzada: anticipo al inicio, devolución prorrateada en EdP
        * Admin Delegada: anticipo de caja al inicio
      - Estados de Pago / Rendiciones (por proyecto)
      - Asesorías / Otros ingresos
      - IVA Débito (19% sobre ingresos afectos)
      - Total Ingresos
      
      EGRESOS:
      - Costos Obra [Proyecto 1] (total de 8 clasificaciones, del módulo Proyección)
      - Costos Obra [Proyecto 2]
      - Costos Obra [Proyecto N]
      - Costos Oficina Central (total, del módulo Proyección)
      - Total Egresos
      
      IVA Y TRIBUTOS:
      - IVA Crédito (19% sobre egresos afectos)
      - Pago IVA = max(0, IVA Débito[mes-1] − IVA Crédito[mes-1])
      - PPM = Ingresos FC[mes-1] × 1%
      - Impuesto a la Renta (anual, en abril)
      - Total Tributos
      
      CUENTAS POR COBRAR/PAGAR:
      - CxP: celdas editables manualmente (ajuste de pagos a proveedores)
      - CxC: celdas editables manualmente (desfase cobro a mandantes)
        ** Fondo amarillo, siempre manual **
      - Total CxP/CxC
      
      FLUJO INVERSIONISTAS:
      - Aportes de Accionistas (editable)
      - Devoluciones (editable)
      
      RESUMEN:
      - FC del Mes = Ingresos + Egresos + Tributos + CxP/CxC + Inversionistas
      - Caja Inicial (= Caja Final mes anterior; el de enero es editable)
      - **Caja Final** = Caja Inicial + FC del Mes
   
   b) Gráfico debajo de la tabla:
      - Línea de Caja Final mensual
      - Línea horizontal en cero (referencia)
      - Zona roja si caja baja de cero
      - Usar Recharts LineChart
   
   c) Persistencia: "budget-control:cashflow:{año}"

Los ingresos y egresos se calculan desde la Proyección.
CxC y CxP son siempre input manual del usuario.
```

---

## FASE 7: Dashboard, Escenarios, Check Contable

### Prompt:

```
Partiendo del archivo de la Fase 6, agregar los módulos finales.
Activar "Dashboard", "Escenarios" y "Check Contable" en el menú.
Dashboard debe ser la pantalla inicial al abrir la app.

FASE 7 - Agregar:

1. DASHBOARD (pantalla principal):
   
   a) 5 tarjetas KPI en la parte superior:
      - Resultado Proyectado FY (UF y % vs Ppto) — semáforo color
      - Margen Operacional Proyectado (UF)
      - Desviación vs Presupuesto (UF y %)
      - Caja Proyectada Fin de Año (UF)
      - Mes de Control actual
   
   b) Gráfico de barras: Resultado mensual Real vs Ppto vs Proy (Recharts BarChart)
   
   c) Gráfico de línea: Flujo de caja acumulado (Recharts LineChart)
   
   d) Tabla resumen compacta:
      | Concepto | YTD Real | YTD Ppto | Diff | FY Proy | FY Ppto | Diff | % |
      Filas: Ingresos por proyecto, Total, Costos por proyecto, Total, 
      Resultado Op, Of. Central, EBITDA

2. ESCENARIOS:

   a) Generación automática de escenarios combinando proyectos:
      - Esc. Base: todos los proyectos activos
      - Por cada proyecto: un escenario sin ese proyecto
      - Escenario mínimo: solo el proyecto más avanzado
   
   b) Tabla comparativa:
      Columnas: Concepto | Esc.1 | Esc.2 | Esc.3 | ... | Notas
      
      Sección RESULTADOS FY:
      - Ingresos por proyecto (0 si excluido)
      - Total Ingresos
      - Costos por proyecto (0 si excluido)
      - Total Costos
      - Resultado Operacional
      - Oficina Central (IGUAL en todos — anotar "Fijo")
      - EBITDA
      
      Sección FLUJO DE CAJA FY:
      - Ingresos proyectos
      - Egresos obra
      - Oficina Central (IGUAL en todos)
      - Flujo Anual
      - Caja Final
   
   c) Nota "Proyecto no se ejecuta" para proyectos excluidos

3. CHECK CONTABLE (simplificado):

   a) Dos columnas:
      - Izquierda: Resumen de gestión (gastos activados por clasificación en UF)
        Datos tomados de los reales cargados YTD
      - Derecha: Balance contable (del Mayor ICEMM si fue cargado)
   
   b) Línea de cuadratura: Diferencia entre gestión y contabilidad
      Si diferencia < 1 UF: verde "Cuadrado"
      Si diferencia > 1 UF: rojo con el monto de descuadre
   
   c) Si no hay Mayor ICEMM cargado, mostrar mensaje indicándolo

Persistencia: "budget-control:scenarios:{año}"

Marcar el Dashboard como la vista default al abrir la aplicación.
```

---

## FASE OPCIONAL 8: Gestión Multi-Año

### Prompt:

```
Partiendo del archivo de la Fase 7, agregar soporte MULTI-AÑO.

FASE 8 - Agregar:

1. En el header, el selector de año ahora permite:
   - Navegar entre años existentes
   - Botón "Crear Año Siguiente" que:
     * Crea estructura de presupuesto vacía para el nuevo año
     * Copia proyectos en curso con su saldo pendiente
     * La caja inicial del nuevo año = caja final del año anterior
     * El presupuesto del nuevo año queda en estado "Borrador"

2. Todos los módulos respetan el año seleccionado:
   - Cada año tiene su propio presupuesto, proyección, reales, flujo de caja
   - Los proyectos son transversales (aparecen en múltiples años)

3. Vista "Timeline" accesible desde Dashboard:
   - Gantt simplificado mostrando proyectos cruzando años
   - Barras horizontales con fecha inicio y término de cada proyecto
   - Indicador del mes de control actual
   - Usar div+CSS, no requiere librería externa

4. Los datos reales de años cerrados no se pueden modificar.
   Un año se "cierra" cuando su presupuesto del año siguiente se fija.
```

---

## Notas para Claude Code

- Cada fase produce un archivo .jsx FUNCIONAL e independiente
- No generar código parcial ni pseudocódigo — siempre código completo y ejecutable
- Usar export default para el componente principal
- Manejar errores de storage con try-catch (storage puede fallar)
- NO usar localStorage ni sessionStorage — usar window.storage API
- Formatear números: separador de miles (punto), 2 decimales, sufijo "UF"
- Diseño responsive pero priorizar desktop (pantalla de gerencia)
- Colores corporativos: azul oscuro (#1e3a5f), gris (#6b7280), blanco, 
  acentos en verde (#059669) para positivo y rojo (#dc2626) para negativo
