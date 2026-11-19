# Clover SNPD — API Reference

All amounts are in **cents** (integer). $1500.50 = `150050`.

## Listener Registration

```typescript
cloverConnector.addCloverConnectorListener(listener);
cloverConnector.initializeConnection(); // must be called after adding listeners
```

---

## Connection Events

```typescript
onDeviceDisconnected(): void
// Device not reachable. Log and update UI status.

onDeviceConnected(): void
// Connected but not yet ready. Do not send requests yet.

onDeviceReady(merchantInfo: MerchantInfo): void
// Ready to process transactions.
// Called again on reconnection — use for recovery (see nestjs-patterns.md).
// Do NOT initiate transactions directly from here.
```

---

## Sale

```typescript
// Request
const saleRequest = new clover.remotepay.SaleRequest();
saleRequest.setExternalId(clover.CloverID.getNewId()); // min 13 alphanumeric chars
saleRequest.setAmount(amountInCents);
saleRequest.setAutoAcceptSignature(true);        // required for unattended kiosk
saleRequest.setDisableDuplicateChecking(true);   // required for kiosk

cloverConnector.sale(saleRequest);

// Response callback
onSaleResponse(response: SaleResponse): void {
  response.getSuccess()         // boolean
  response.getResult()          // 'SUCCESS' | 'FAIL' | 'UNSUPPORTED' | 'CANCEL' | 'ERROR'
  response.getReason()          // string — additional info
  response.getMessage()         // string — detailed info

  const payment = response.getPayment();
  payment.getId()                                  // Clover payment ID
  payment.getExternalPaymentId()                   // your ExternalId — verify match
  payment.getAmount()                              // amount charged in cents
  payment.getTipAmount()                           // tip in cents
  payment.getTaxAmount()                           // tax in cents (included in amount)
  payment.getOffline()                             // boolean — processed offline
  payment.getIsSale()                              // false if came back as tip-adjustable Auth

  const card = payment.getCardTransaction();
  card.getCardType()                               // 'VISA' | 'MASTERCARD' | etc.
  card.getLast4()
  card.getAuthCode()
  card.getEntryType()                              // 'CHIP' | 'SWIPE' | 'CONTACTLESS' | etc.
}
```

### Payment Confirmation (must handle)

```typescript
onConfirmPaymentRequest(request: ConfirmPaymentRequest): void {
  // Device is asking POS to accept or reject a payment challenge
  // (duplicate payment, offline payment, etc.)
  // If not responded to, device waits indefinitely.

  // For kiosk — auto-accept:
  cloverConnector.acceptPayment(request.getPayment());

  // To reject:
  // cloverConnector.rejectPayment(request.getPayment(), request.getChallenges()[0]);
}

onVerifySignatureRequest(request: VerifySignatureRequest): void {
  // For kiosk with AutoAcceptSignature=true, this should not fire.
  // If it does, auto-accept:
  cloverConnector.acceptSignature(request);
}
```

---

## Refund Payment (with original payment reference)

```typescript
// Full refund
const rpr = new clover.remotepay.RefundPaymentRequest();
rpr.setPaymentId(payment.getId());
rpr.setOrderId(payment.getOrder().getId());
rpr.setFullRefund(true);
cloverConnector.refundPayment(rpr);

// Partial refund
const rpr = new clover.remotepay.RefundPaymentRequest();
rpr.setPaymentId(payment.getId());
rpr.setOrderId(payment.getOrder().getId());
rpr.setFullRefund(false);
rpr.setAmount(partialAmountInCents);
cloverConnector.refundPayment(rpr);

// Response callback
onRefundPaymentResponse(response): void {
  response.getSuccess()
  response.getResult()
}
```

---

## Void Payment

```typescript
const vpr = new clover.remotepay.VoidPaymentRequest();
vpr.setPaymentId(payment.getId());
vpr.setOrderId(payment.getOrder().getId());
vpr.setVoidReason('USER_CANCEL');
cloverConnector.voidPayment(vpr);

// Response callback
onVoidPaymentResponse(response): void {
  response.getSuccess()
  response.getResult()
}
```

---

## Manual Refund (no original payment — store credit on terminal)

```typescript
const mrr = new clover.remotepay.ManualRefundRequest();
mrr.setExternalId(clover.CloverID.getNewId());
mrr.setAmount(amountInCents);
cloverConnector.manualRefund(mrr);

// Response callback
onManualRefundResponse(response): void {
  response.getSuccess()
  const credit = response.getCredit();
  credit.getAmount()
  credit.getTaxAmount()
}
```

---

## Retrieve Payment (reconciliation)

```typescript
const retrieveRequest = new clover.remotepay.RetrievePaymentRequest();
retrieveRequest.setExternalPaymentId(externalId); // the ExternalId you saved
cloverConnector.retrievePayment(retrieveRequest);

// Response callback
onRetrievePaymentResponse(response): void {
  response.getExternalPaymentId()  // verify matches your pending ExternalId
  response.getQueryStatus()        // 'FOUND' | 'IN_PROGRESS' | 'NOT_FOUND'

  if (response.getQueryStatus() === 'FOUND') {
    // Payment complete — process the payment object
    const payment = response.getPayment();
  } else if (response.getQueryStatus() === 'IN_PROGRESS') {
    // Payment still processing on device — warn operator before any reset
  } else {
    // NOT_FOUND — payment not taken or voided — clear pending state
  }
}
```

---

## Retrieve Device Status

```typescript
const statusRequest = new clover.remotepay.RetrieveDeviceStatusRequest();
statusRequest.setSendLastMessage(true); // device resends last message (useful for recovery)
cloverConnector.retrieveDeviceStatus(statusRequest);

// Response callback
onRetrieveDeviceStatusResponse(response): void {
  response.getState()  // 'IDLE' | 'BUSY' | 'WAITING_ON_CUSTOMER' | 'WAITING_FOR_POS' | 'DISCONNECTED' | 'UNKNOWN'
  // Only initiate new payment when state === 'IDLE'
}
```

### Device States

| State | Meaning |
|---|---|
| `IDLE` | Ready for new transaction |
| `BUSY` | Payment in progress — do NOT initiate new payment |
| `WAITING_ON_CUSTOMER` | Device waiting for customer input (tip, receipt, etc.) |
| `WAITING_FOR_POS` | Device waiting for POS to respond (e.g. confirm challenge) |
| `DISCONNECTED` | Device unreachable |
| `UNKNOWN` | Rare internal state |

---

## Reset Device

```typescript
// WARNING: may void payment in progress
// Always call retrievePayment() BEFORE calling resetDevice()
cloverConnector.resetDevice();

// Response callback
onResetDeviceResponse(response): void {
  // After reset, re-check payment status
  // The reset generally voids in-progress payments, but not always
  retrievePayment(pendingExternalId); // verify what happened to pending payment
}
```

---

## Display Message

```typescript
cloverConnector.showMessage('Procesando pago...');
cloverConnector.showWelcomeScreen();
cloverConnector.showThankYouScreen();
```

---

## Dispose (call on app shutdown)

```typescript
cloverConnector.dispose();
// Cleanly closes WSS connection.
// Failure to call may prevent reconnection on next startup.
```

---

## Error Codes (Result enum)

| Code | Description |
|---|---|
| `SUCCESS` | Operation succeeded |
| `FAIL` | Invalid value, invalid card, insufficient funds |
| `UNSUPPORTED` | Merchant config does not support this operation |
| `CANCEL` | Merchant or customer pressed Cancel/Back on device |
| `ERROR` | Unexpected error: device not connected, empty request, blank ExternalId, zero amount |
