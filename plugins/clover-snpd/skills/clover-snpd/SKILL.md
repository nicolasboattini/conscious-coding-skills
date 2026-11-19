---
name: clover-snpd
description: This skill should be used when integrating a NestJS backend with a Clover payment terminal using the remote-pay-cloud JavaScript SDK over SNPD (Secure Network Pay Display) for LAN-based card-present payments. Use when implementing CloverService, handling payment flows, managing device connection/recovery, or debugging Clover integration in the totem kiosk project.
---

# Clover SNPD Integration — remote-pay-cloud SDK

## Overview

This skill covers integrating a NestJS backend with a Clover Flex or Mini payment terminal using:

- **SDK**: `remote-pay-cloud` v4.1.2 (npm JavaScript SDK)
- **Connection**: SNPD (Secure Network Pay Display) over LAN — no OAuth required
- **Transport**: WebSocket Secure (WSS) to `wss://{device_ip}:12345/remote_pay`
- **Context**: Self-service kiosk (totem) in Argentina/Latam

## Key Concepts

1. **Async/callback architecture** — CloverConnector is event-driven. Requests are sent and responses arrive via `ICloverConnectorListener` callbacks. There is no `await cloverConnector.sale()`.
2. **No OAuth for SNPD** — Unlike Cloud Pay Display, SNPD connects directly to the device on LAN without authentication tokens.
3. **Pairing token** — First connection requires manual pairing on the device. After that, `pairingAuthToken` is saved and reused for automatic reconnection.
4. **Amount in cents** — All monetary values are integers in cents. $1500.50 = `150050`.
5. **ExternalId** — Must be generated and saved to DB **before** sending any request. Used for reconciliation if the connection drops.

## References

- [references/setup.md](references/setup.md) — Installation, connection configuration, pairing, certificates
- [references/api.md](references/api.md) — All request/response patterns: Sale, Refund, Void, Retrieve, Reset
- [references/nestjs-patterns.md](references/nestjs-patterns.md) — CloverService architecture, async wrapping, recovery patterns

## Workflow

### When implementing CloverModule from scratch:
1. Read `references/setup.md` for dependencies and connection config
2. Read `references/nestjs-patterns.md` for CloverService architecture
3. Read `references/api.md` for specific request/response patterns needed

### When adding a new payment operation:
1. Read `references/api.md` for the specific request type
2. Add the listener callback to the existing CloverService

### When debugging connection or recovery issues:
1. Read `references/nestjs-patterns.md` (Recovery section)
2. Read `references/api.md` (Device status and retrievePayment sections)

## Critical Rules

- Never start a Sale without first checking device status is `IDLE`
- Always save `ExternalId` to DB before calling `cloverConnector.sale()`
- Always call `cloverConnector.dispose()` on application shutdown
- Never call `resetDevice()` without first calling `retrievePayment()` to check pending state
- Handle `OnConfirmPaymentRequest` — if not responded to, the device waits indefinitely
- Set `AutoAcceptSignature: true` and `DisableDuplicateChecking: true` for unattended kiosk
