# Clover SNPD — NestJS Patterns

## Module Structure

```
src/clover/
  clover.module.ts
  clover.service.ts
  clover.listener.ts
  clover.controller.ts
  clover.types.ts
  clover-websocket.ts   // NodeWebSocketImpl — CRITICAL, see setup.md
```

---

## CloverService — Proven Architecture

```typescript
@Injectable()
export class CloverService implements OnModuleInit, OnModuleDestroy {
  private connector: any = null;
  private deviceConnected = false;
  private pairingCode: string | null = null;
  private readonly pendingPayments = new Map<string, PendingPayment>();
  private readonly deviceReadyResolvers: Array<() => void> = [];

  async onModuleInit() { await this.connect(); }
  onModuleDestroy() { this.connector?.dispose(); }
}
```

**Key facts:**
- SDK is async/event-driven — bridge to Promises via `Map<externalId, {resolve, reject}>`
- `connector` typed as `any` — SDK types incomplete for Node.js usage
- `pairingCode` stored in memory, exposed via `getStatus()` endpoint for UI polling

---

## Connection Init (Proven Working)

```typescript
private async connect(): Promise<void> {
  // IP, RAID and pairing token live on the Terminal row (one per Clover device)
  const terminal = await this.loadActiveTerminal();
  if (!terminal) return; // silently skip if not configured

  // RAID: per terminal (filled from env when the terminal is created), env as fallback
  const raid = terminal.cloverRaid ?? this.config.get<string>('CLOVER_RAID');
  if (!raid) return;

  const imageUtil = { getImage: (_: string, cb: (img: any) => void) => cb(null) };

  const deviceConfig = new (clover as any).WebSocketPairedCloverDeviceConfiguration(
    `ws://${terminal.cloverIp}:12345/remote_pay`,
    raid,
    this.config.get('CLOVER_POS_NAME', 'TotemFortin'),
    `TOTEM-${terminal.id}`,          // serial derived from the terminal id
    terminal.cloverPairingToken ?? null,
    (code: string) => { this.pairingCode = code; },
    async (token: string) => {
      this.pairingCode = null;
      await this.savePairingToken(terminal.id, token); // updates Terminal.cloverPairingToken
    },
    nodeWebSocketFactory,  // from clover-websocket.ts — NOT a raw ws WebSocket
    imageUtil,
  );

  this.connector = new (clover as any).CloverConnector(deviceConfig);
  this.connector.addCloverConnectorListener(listener as any); // cast needed
  this.connector.initializeConnection();
}
```

---

## Lazy Connect + Charge

When the terminal is off at startup, `connect()` is called but fails silently.
On payment request, if not connected, connect and wait for `onDeviceReady`:

```typescript
async charge(amountInCents: number): Promise<PaymentResult> {
  // Check no pending payment in DB
  const existing = await this.prisma.cloverPendingPayment.findFirst({
    where: this.currentTerminalId ? { terminalId: this.currentTerminalId } : {},
  });
  if (existing) throw new Error(`Pending payment: ${existing.externalId}`);

  // Lazy connect if needed
  if (!this.deviceConnected) {
    const terminal = await this.loadActiveTerminal();
    if (!terminal) throw new Error('Terminal not configured');
    if (!this.connector) await this.connect();
    await this.waitForDeviceReady(30_000); // 30s timeout
  }

  // Generate + persist ExternalId BEFORE sending request (linked to the terminal)
  const externalId = (clover as any).CloverID.getNewId();
  await this.prisma.cloverPendingPayment.create({
    data: {
      externalId,
      amount: amountInCents,
      ...(this.currentTerminalId && { terminalId: this.currentTerminalId }),
    },
  });

  return new Promise<PaymentResult>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      this.pendingPayments.delete(externalId);
      void this.clearPendingPayment(externalId);
      reject(new Error('Payment timeout'));
    }, 120_000);

    this.pendingPayments.set(externalId, { resolve, reject, timeoutId });

    const req = new (clover as any).remotepay.SaleRequest();
    req.setExternalId(externalId);
    req.setAmount(amountInCents);
    req.setAutoAcceptSignature(true);
    req.setDisableDuplicateChecking(true);
    this.connector.sale(req);
  });
}

private waitForDeviceReady(timeoutMs: number): Promise<void> {
  if (this.deviceConnected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = this.deviceReadyResolvers.indexOf(resolve);
      if (idx !== -1) this.deviceReadyResolvers.splice(idx, 1);
      reject(new Error('Timeout waiting for terminal'));
    }, timeoutMs);
    this.deviceReadyResolvers.push(() => { clearTimeout(timer); resolve(); });
  });
}
```

---

## onDeviceReady — Recovery on Reconnect

```typescript
private async onDeviceReady(): Promise<void> {
  this.deviceConnected = true;
  // Resolve any waitForDeviceReady promises (lazy connect)
  this.deviceReadyResolvers.splice(0).forEach(r => r());

  // Recovery: if pending payment in DB, check its status
  const pending = await this.prisma.cloverPendingPayment.findFirst();
  if (pending) {
    const statusReq = new (clover as any).remotepay.RetrieveDeviceStatusRequest();
    statusReq.setSendLastMessage(true); // may re-deliver onSaleResponse
    this.connector.retrieveDeviceStatus(statusReq);

    const payReq = new (clover as any).remotepay.RetrievePaymentRequest();
    payReq.setExternalPaymentId(pending.externalId);
    this.connector.retrievePayment(payReq);
  }
}
```

---

## Listener — Key Callbacks

```typescript
// onConfirmPaymentRequest — MUST handle or device waits indefinitely
onConfirmPaymentRequest(request: any): void {
  this.connector.acceptPayment(request.getPayment());
}

// onVerifySignatureRequest — auto-accept for unattended kiosk
onVerifySignatureRequest(request: any): void {
  this.connector.acceptSignature(request);
}

// onSaleResponse — resolve/reject the pending Promise
onSaleResponse(response: any): void {
  const externalId = response.getPayment()?.getExternalPaymentId?.();
  const pending = this.pendingPayments.get(externalId);
  if (!pending) return;
  clearTimeout(pending.timeoutId);
  this.pendingPayments.delete(externalId);
  void this.clearPendingPayment(externalId);
  if (response.getSuccess()) {
    const p = response.getPayment();
    pending.resolve({
      paymentId: p.getId(),
      externalId,
      amount: p.getAmount(),
      cardType: p.getCardTransaction()?.getCardType?.() ?? null,
      last4: p.getCardTransaction()?.getLast4?.() ?? null,
      authCode: p.getCardTransaction()?.getAuthCode?.() ?? null,
      offline: p.getOffline?.() ?? false,
    });
  } else {
    pending.reject(new Error(`${response.getResult()} - ${response.getReason()}`));
  }
}
```

---

## Loading the Terminal

```typescript
private async loadActiveTerminal() {
  if (this.currentTerminalId) {
    return this.prisma.terminal.findUnique({ where: { id: this.currentTerminalId } }).catch(() => null);
  }
  // No explicit terminal: first active one with an IP configured
  return this.prisma.terminal.findFirst({
    where: { status: 'active', cloverIp: { not: null } },
  }).catch(() => null);
}

private async savePairingToken(terminalId: number, token: string): Promise<void> {
  await this.prisma.terminal.update({
    where: { id: terminalId },
    data: { cloverPairingToken: token },
  }).catch(() => null);
}
```

---

## Status Endpoint

```typescript
async getStatus() {
  const terminal = this.currentTerminalId
    ? await this.prisma.terminal.findUnique({
        where: { id: this.currentTerminalId },
        select: { id: true, name: true, cloverIp: true },
      }).catch(() => null)
    : null;
  return {
    connected: this.deviceConnected,
    hasConfig: !!terminal?.cloverIp, // IP saved on the Terminal — enables pay button even when disconnected
    pairingCode: this.pairingCode,
    terminalId: this.currentTerminalId,
    terminalName: terminal?.name ?? null,
    pendingExternalId: this.pendingPayments.size > 0
      ? this.pendingPayments.keys().next().value ?? null
      : null,
  };
}
```

UI polls this every 2s. `hasConfig` enables the payment button. `pairingCode` shows the modal.

---

## Unlink

```typescript
async unlink(): Promise<void> {
  this.connector?.dispose();
  this.connector = null;
  this.deviceConnected = false;
  this.pairingCode = null;
  if (this.currentTerminalId) {
    // Keeps the IP; drops the token so the next connection pairs again
    await this.prisma.terminal.update({
      where: { id: this.currentTerminalId },
      data: { cloverPairingToken: null, status: 'available' },
    }).catch(() => null);
  }
  this.currentTerminalId = null;
}
```

---

## Connect to a Terminal (`POST /clover/connect { terminalId }`)

The IP is edited in the terminals CRUD (`Terminal.cloverIp`), not here. This only switches the connector to a terminal:

```typescript
async connectTerminal(terminalId: number): Promise<void> {
  this.connector?.dispose();
  this.connector = null;
  this.deviceConnected = false;
  this.pairingCode = null;
  this.currentTerminalId = terminalId;
  await this.connect();
}
```

---

## DB Models

```prisma
model CloverPendingPayment {
  id         Int      @id @default(autoincrement())
  externalId String   @unique @db.NVarChar(50)
  amount     Int      // in cents
  terminalId Int?
  createdAt  DateTime @default(now())
  terminal   Terminal? @relation(fields: [terminalId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  @@map("clover_pending_payment")
  @@schema("bartotem")
}

model Terminal {
  id                 Int       @id @default(autoincrement())
  name               String    @db.NVarChar(100)
  status             String    @default("available") @db.NVarChar(20) // available | active | offline
  cloverIp           String?   @db.NVarChar(50)
  cloverRaid         String?   @db.NVarChar(100)
  cloverPairingToken String?   @db.NVarChar(500)
  lastActiveAt       DateTime?
  createdAt          DateTime  @default(now())
  // ...
}
// Device IP, RAID and pairing token live on Terminal — there is no key-value Config entry for Clover
```

---

## Listener Registration Note

The SDK's `ICloverConnectorListener` interface has ~30 required methods.
Cast the listener to `any` to avoid implementing all of them:

```typescript
this.connector.addCloverConnectorListener(listener as any);
```

Only implement the callbacks you actually need.
