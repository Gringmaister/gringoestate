# Wispy Master Architecture

## Idea central
Wispy no es solo chat, ni solo Trello, ni solo panel.
Es un **router operativo** entre conversación, tareas, análisis, memoria y documentos.

---

## 1. Entradas posibles

### A. Chat directo con Franco
- texto
- audio
- imágenes/capturas
- documentos
- links

### B. Panel Wispy Office
- comando manual
- botones/shortcuts
- creación de tareas
- follow-ups
- consultas operativas

### C. Trello
- tarjetas creadas manualmente por Franco
- tarjetas creadas por Wispy
- cambios de estado
- prioridades / bloqueos

### D. Documentos / fuentes
- Google Drive
- contratos
- PDFs
- JSON maestro
- hojas de cálculo

### E. Colaboradores
- mensajes
- seguimiento
- estado de respuesta
- tareas en curso

---

## 2. Capa crítica: Intake + clasificación
Cada input entra por una bandeja temporal y Wispy decide qué tipo de trabajo es.

### Tipos principales
1. **Consulta instantánea**
2. **Análisis puntual**
3. **Tarea operativa**
4. **Workflow / automatización**
5. **Memoria / contexto**
6. **Seguimiento con colaborador**
7. **Documento / extracción de info**

---

## 3. Router de decisiones

### Si es consulta instantánea
- responde directo
- no crea tarjeta
- opcionalmente deja log

Ejemplos:
- resumime esto
- decime qué seguir
- pensá conmigo
- haceme un copy

### Si es análisis puntual
- usa skill/GPT/subagente especializado
- devuelve output limpio
- no crea tarjeta salvo que surja una acción real

Ejemplos:
- leer contrato
- analizar propiedad
- extraer puntos importantes
- procesar audio

### Si es tarea operativa
- crea tarjeta en Trello
- asigna board/lista
- define owner, prioridad y próximo paso
- deja log operativo

Ejemplos:
- seguí esto con Pamela
- cargá esta mejora
- mover esto a mantenimiento
- agendar esta ejecución

### Si es workflow / automatización
- crea tarea si corresponde
- dispara secuencia
- deja log
- arma seguimiento

Ejemplos:
- crear tarea + follow-up + alerta
- rutina diaria
- ruteo de audio a tareas

### Si es memoria / contexto
- guarda hecho durable
- no ensucia Trello
- sube a memoria curada o temática

Ejemplos:
- preferencia de Franco
- dato estable de colaborador
- criterio de negocio

### Si es seguimiento con colaborador
- actualiza panel colaborador
- propone o dispara follow-up
- vincula con tarea si la hay

Ejemplos:
- Pamela no respondió
- Marcelo está bloqueado
- Augusto necesita confirmación

### Si es documento / extracción
- lee fuente
- saca campos, fechas, montos, pendientes
- genera resumen o tareas derivadas

Ejemplos:
- contrato
- PDF
- carpeta Drive
- archivo maestro

---

## 4. Cinco capas del sistema

### 1. Conversación / follow-up
Objetivo:
- gestionar personas y respuesta

Módulos:
- colaboradores reales
- panel de estado por persona
- próximo mensaje sugerido
- histórico ejecutivo

### 2. Tareas / ejecución
Objetivo:
- mover operación real

Módulos:
- Trello
- owners
- prioridades
- automatizaciones
- cadena de ejecución

### 3. Análisis puntual
Objetivo:
- procesar información sin crear fricción

Módulos:
- skills especializadas
- GPTs por dominio
- subagentes de investigación

### 4. Conocimiento / memoria
Objetivo:
- conservar contexto importante

Módulos:
- memoria curada
- memoria diaria
- temas por unidad/persona/proyecto

### 5. Documentos / fuentes
Objetivo:
- leer, extraer y usar información base

Módulos:
- Drive
- contratos
- PDFs
- JSONs
- hojas

---

## 5. Regla madre
**No todo va a Trello.**
Todo entra por Wispy, y Wispy decide el destino correcto.

Destino posible:
- respuesta directa
- skill/GPT
- subagente
- Trello
- memoria
- colaborador/follow-up
- documento/lectura
- automatización

---

## 6. Qué debe hacer el panel
El panel no tiene que ser un dashboard lindo.
Tiene que ser la superficie para:
- ver pulso del sistema
- cargar trabajo
- leer boards
- disparar acciones
- seguir colaboradores
- ver logs reales
- entender bloqueos

---

## 7. Orden recomendado de construcción

### Fase 1
- runtime real
- boards reales
- acciones reales desde Ops

### Fase 2
- colaboradores reales
- live log real
- follow-up engine

### Fase 3
- intake/routing engine formal
- memoria más automatizada
- documentos/Drive integrados

### Fase 4
- workflows avanzados
- subagentes por dominio
- GPTs especialistas reutilizables

---

## 8. Métrica de éxito
El sistema está bien hecho cuando Franco puede:
- hablar o mandar audio
- cargar algo desde el panel
- crear algo directo en Trello
- pedir análisis puntual

y todo eso converge en una sola lógica operativa sin fricción.
