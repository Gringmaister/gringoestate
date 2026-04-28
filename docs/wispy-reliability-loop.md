# Wispy Reliability Loop

## Objetivo
Hacer que Wispy no solo ejecute flujos, sino que también verifique si funcionaron, detecte fallos, los registre y los convierta en mejoras.

---

## 1. Regla madre
Todo flujo importante debería tener:
- disparo
- ejecución
- verificación
- log
- manejo de error
- aprendizaje / backlog

---

## 2. Qué hay que verificar

### Acciones desde Ops
- se creó la tarea
- fue al tablero correcto
- quedó owner/prioridad/próximo paso
- dejó log

### Follow-ups
- el mensaje salió
- fue entregado o quedó intentado
- quedó próxima revisión

### Automatizaciones
- arrancaron
- terminaron
- devolvieron estado claro
- si fallaron, quedó causa

### Runtime / panel
- functions responden
- panel carga módulos clave
- bridge responde
- métricas no mienten

---

## 3. Tipos de error a registrar
- fallo técnico
- integración caída
- dato faltante
- routing incorrecto
- tarea mal creada
- follow-up no enviado
- crash de function
- timeout
- error de permiso o aprobación

---

## 4. Dónde registrar
### A. Consola / logs vivos
Para diagnóstico inmediato.

### B. Bitácora de bugs
Registro persistente de:
- fecha
- flujo afectado
- error
- impacto
- estado
- fix sugerido

### C. Trello / backlog
Si el bug merece trabajo real o mejora estructural.

---

## 5. Flujo ideal de manejo de error
1. detectar
2. clasificar gravedad
3. reintentar si corresponde
4. dejar log
5. avisar a Franco si impacta operación
6. mandar a backlog si requiere fix estructural

---

## 6. Gravedad sugerida
- **critical**: rompe operación o genera riesgo real
- **high**: bloquea flujo importante
- **medium**: degrada pero hay workaround
- **low**: detalle o mejora

---

## 7. Mecanismos concretos a implementar
- panel de errores / notificaciones
- live log con estado real
- bug journal persistente
- health checks por flujo
- retries donde tenga sentido
- alertas por fallos críticos
- creación automática de bug card cuando corresponda

---

## 8. Métrica de éxito
Wispy es robusto cuando:
- detecta sus propios fallos
- no oculta errores
- deja trazabilidad
- avisa cuando importa
- convierte errores repetidos en backlog de mejora
