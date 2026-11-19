# clover-snpd

Skill para integrar un backend NestJS con una terminal Clover Flex o Mini por SNPD (Secure Network Pay Display), en la red local y sin OAuth, con el SDK `remote-pay-cloud` 4.1.2. Está pensada para tótems de autoservicio y sale de una integración que funciona en producción.

Se activa cuando Claude implementa o depura `CloverService`, flujos de pago, la conexión con el dispositivo o la recuperación de pagos pendientes.

## Qué incluye

| Archivo | Contenido |
|---|---|
| `SKILL.md` | Conceptos (callbacks, pairing, montos en centavos, ExternalId), flujo de trabajo y reglas críticas |
| `references/setup.md` | Dependencias, configuración SNPD en el dispositivo (`ws://` sin TLS), pairing, RAID y dónde guardar la IP |
| `references/api.md` | Venta, devolución, anulación, devolución manual, `retrievePayment`, estado del dispositivo y reset |
| `references/nestjs-patterns.md` | Arquitectura de `CloverService`, conexión por terminal (IP, RAID y token en el modelo `Terminal`), paso de callbacks a promesas, recuperación y endpoints de estado |

## Instalación

```text
/plugin install clover-snpd@conscious-coding-skills
```

O solo la skill:

```bash
npx skills add nicolasboattini/conscious-coding-skills --skill clover-snpd
```
