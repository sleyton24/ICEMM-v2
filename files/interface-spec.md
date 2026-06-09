# Especificación de Interfaz - Resumen

## Layout General
- Sidebar izquierdo fijo: menú de módulos con iconos
- Header: logo "ICEMM", selector de año, indicador mes de control
- Área principal: contenido del módulo activo
- Colores: azul oscuro (#1e3a5f), gris (#6b7280), blanco
- Positivo: verde (#059669), Negativo: rojo (#dc2626)
- Override manual: amarillo suave (#fef3c7)

## Módulos

### 1. Dashboard
- 5 tarjetas KPI (Resultado FY, Margen Op., Desviación, Caja, Mes Control)
- Gráfico barras: resultado mensual Real/Ppto/Proy
- Gráfico línea: flujo de caja acumulado
- Tabla resumen YTD/FY

### 2. Gestión de Proyectos
- Lista de proyectos (tabla)
- Formulario CRUD con campos según tipo contrato
- Tabla presupuesto por 8 clasificaciones
- Tablas de curvas editables (% mensuales, validar suma=100%)

### 3. Presupuesto Anual
- Selector año, estado borrador/fijado
- Tabla ingresos por proyecto (mensual)
- Tabla costos por proyecto × 8 clasificaciones (mensual)
- Tabla oficina central 16 categorías (mensual)
- Resultado = Ingresos − Costos − Of.Central
- Read-only una vez fijado

### 4. Carga de Datos
- Selector mes de control
- Botón cargar Reporte Manager (.xlsx/.csv)
- Botón cargar Mayor ICEMM (.xlsx/.csv)
- Tabla UF editable
- Historial de cargas
- Resumen pre-confirmación

### 5. Proyección Editable
- Tabs por proyecto + Of.Central + Ingresos
- Grilla 8 clasificaciones × 12 meses
- 3 estados de celda: gris(real), blanco(proyectado), amarillo(override)
- Botón restaurar por celda
- Recálculo automático al cambiar override

### 6. Informe de Gestión
- 12 meses × 4 columnas (Real/Ppto/Proy/Diff)
- Secciones: Ingresos, Costos por proyecto, Resultado Op., Of.Central, EBITDA
- Totales: YTD, YTG, FY con % desviación
- Flechas color para desviaciones

### 7. Flujo de Caja
- Ingresos (anticipos, EdP, otros, IVA débito)
- Egresos (costos obra por proyecto, of.central)
- Tributos (IVA, PPM, Renta)
- CxP/CxC (manual, amarillo)
- Inversionistas
- FC Mes, Caja Inicial, Caja Final
- Gráfico línea de caja con zona roja bajo cero

### 8. Check Contable
- Izquierda: resumen gestión (gastos activados UF)
- Derecha: balance contable (del Mayor ICEMM)
- Indicador cuadratura (verde/rojo)

### 9. Escenarios
- Auto-generación por combinaciones de proyectos
- Tabla: Resultados FY + Flujo Caja FY por escenario
- Of.Central fija en todos
- Notas automáticas

### 10. Multi-Año (Fase 8)
- Selector año con crear año siguiente
- Caja concatenada entre años
- Timeline Gantt de proyectos
- Años cerrados read-only

## Formato de Números
- Separador miles: punto (1.234.567)
- Decimales: 2 (1.234,56)
- Sufijo: "UF" donde corresponda
- Negativos: rojo, con signo menos
