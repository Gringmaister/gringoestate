# Wispy Docker Isolation Plan

## Objetivo
Dejar Wispy portable y aislado del server compartido, para que Ariel solo tenga que rutear un contenedor y no procesos sueltos en host.

## Diagnóstico actual
Hoy el setup está partido:
- panel privado en Netlify
- runtime bridge corriendo como proceso Node en host
- OpenClaw principal y sesiones viviendo en el host
- proxy externo fuera del perímetro de Franco

Eso hace que el bridge dependa del host y complique el ruteo desde un proxy dockerizado.

## Decisión correcta
No alcanza con dockerizar solo el bridge.

Si queremos que quede **portable de verdad**, hay que llevar al contenedor propio de Wispy al menos estas piezas:
1. runtime bridge
2. proceso principal del bot / chat
3. volúmenes persistentes de datos
4. variables de entorno propias

## Arquitectura recomendada
### Contenedor 1: wispy-app
Responsable de:
- proceso principal del bot
- lógica de chat
- tools y memoria local
- acceso al workspace persistente

### Contenedor 2: wispy-bridge
Responsable de:
- exponer `/wispy-runtime`
- healthcheck
- bearer token del bridge
- lectura de estado del contenedor/app de Wispy

### Contenedor 3: wispy-data (volúmenes)
Persistencia de:
- `.openclaw`
- memoria diaria
- logs
- estado del panel

## Resultado
Ariel solo tendría que rutear algo tipo:
- `wispy-bridge:8787`

y no un proceso directo en el host.

## Qué NO recomiendo
- seguir corriendo el bridge como proceso Node fuera de Docker
- mezclar el runtime de Wispy con el stack de GringoPMS
- depender de root/sudo para cada ajuste de proxy

## Fases sugeridas
### Fase 1
Dockerizar bridge + estado del panel.

### Fase 2
Mover el proceso del bot/chat a contenedor propio.

### Fase 3
Cerrar proxy a subdominio estable (`runtime.gringo.estate`) apuntando al servicio Docker.

## Conclusión ejecutiva
Sí, se puede aislar al 100%, pero la versión prolija no es “meter solo el bridge en Docker”.
La versión correcta es:
**Wispy como stack Docker propio, con bridge y chat dentro del mismo perímetro.**
