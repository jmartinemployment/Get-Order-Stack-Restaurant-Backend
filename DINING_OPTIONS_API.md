# Dining Options API Reference

## Overview

GetOrderStack supports 5 dining options, each with specific data requirements and workflows:

| Dining Option | Order Type | Behavior | Required Data | Approval |
|---------------|------------|----------|---------------|----------|
| **Dine-In** | `dine-in` | DINE_IN | `tableId` or `tableNumber` | Auto |
| **Takeout** | `takeout` | TAKE_OUT | `customerInfo` | Auto |
| **Curbside** | `curbside` | TAKE_OUT (curbside=true) | `customerInfo` + `curbsideInfo` | Auto |
| **Delivery** | `delivery` | DELIVERY | `customerInfo` + `deliveryInfo` | Auto |
| **Catering** | `catering` | CATERING | `customerInfo` + `cateringInfo` | AI/Manual |

---

## Order Creation

### Endpoint
```
POST /api/restaurant/:restaurantId/orders
```

### Common Fields (All Order Types)
```json
{
  "orderType": "dine-in|takeout|curbside|delivery|catering",
  "orderSource": "online|pos|phone|kiosk",
  "items": [
    {
      "menuItemId": "uuid",
      "quantity": 1,
      "modifiers": [
        {
          "modifierId": "uuid",
          "modifierName": "Extra Cheese",
          "priceAdjustment": 2.00
        }
      ]
    }
  ],
  "specialInstructions": "Optional notes",
  "scheduledTime": "2026-02-15T18:30:00Z"
}
```

### Dining Option Specific Fields

#### 1. Dine-In Orders
```json
{
  "orderType": "dine-in",
  "tableId": "uuid",
  // OR
  "tableNumber": "12",
  "serverId": "uuid"  // Optional
}
```

**Validation:**
- Must provide either `tableId` or `tableNumber`
- If `tableNumber` provided, backend resolves to `tableId`

---

#### 2. Takeout Orders
```json
{
  "orderType": "takeout",
  "customerInfo": {
    "firstName": "John",
    "lastName": "Doe",
    "phone": "5551234567",
    "email": "john@example.com"  // Optional
  }
}
```

**Validation:**
- `customerInfo` required
- `firstName`, `lastName`, `phone` required
- `phone` must be at least 10 digits
- `email` must be valid email format (if provided)

---

#### 3. Curbside Pickup Orders
```json
{
  "orderType": "curbside",
  "customerInfo": {
    "firstName": "Jane",
    "lastName": "Smith",
    "phone": "5559876543",
    "email": "jane@example.com"
  },
  "curbsideInfo": {
    "vehicleDescription": "Red Honda Civic, License ABC123"
  }
}
```

**Validation:**
- All `takeout` validations apply
- `curbsideInfo.vehicleDescription` required (min 1 character)

**Workflow:**
1. Order created with `arrivalNotified: false`
2. Customer notifies arrival: `PATCH /:orderId/arrival`
3. Staff fulfills order

---

#### 4. Delivery Orders
```json
{
  "orderType": "delivery",
  "customerInfo": {
    "firstName": "Mike",
    "lastName": "Johnson",
    "phone": "5551112222",
    "email": "mike@example.com"
  },
  "deliveryInfo": {
    "address": "123 Main St",
    "address2": "Apt 4B",  // Optional
    "city": "Fort Lauderdale",
    "state": "FL",  // 2-letter state code
    "zip": "33301",  // 5 or 9 digits
    "deliveryNotes": "Ring doorbell twice",  // Optional
    "estimatedDeliveryTime": "2026-02-15T19:00:00Z"  // Optional
  }
}
```

**Validation:**
- All `takeout` validations apply
- `deliveryInfo.address` required
- `deliveryInfo.city` required
- `deliveryInfo.state` required (must be 2-letter uppercase code, e.g., "FL")
- `deliveryInfo.zip` required (format: `12345` or `12345-6789`)

**Delivery State Machine:**
```
PREPARING → OUT_FOR_DELIVERY → DELIVERED
```

**State Transitions:**
```
PATCH /api/restaurant/:restaurantId/orders/:orderId/delivery-status
{
  "deliveryStatus": "OUT_FOR_DELIVERY"
}
```

Allowed transitions enforced by backend.

---

#### 5. Catering Orders
```json
{
  "orderType": "catering",
  "customerInfo": {
    "firstName": "Sarah",
    "lastName": "Williams",
    "phone": "5553334444",
    "email": "sarah@company.com"
  },
  "cateringInfo": {
    "eventDate": "2026-03-01T18:00:00Z",
    "eventTime": "6:00 PM",
    "headcount": 50,
    "eventType": "Corporate Event",  // Optional
    "setupRequired": true,  // Optional
    "depositAmount": 500.00,  // Optional
    "depositPaid": false,  // Optional
    "specialInstructions": "Setup buffet by 5:30 PM"  // Optional
  }
}
```

**Validation:**
- All `takeout` validations apply
- `cateringInfo.eventDate` required (ISO datetime string)
- `cateringInfo.eventTime` required
- `cateringInfo.headcount` required (must be ≥ 1)

**Approval Workflow:**
1. Order created with `approvalStatus: "NEEDS_APPROVAL"`
2. Staff reviews order details
3. Staff approves or rejects:
```
PATCH /api/restaurant/:restaurantId/orders/:orderId/approval
{
  "status": "APPROVED",  // or "NOT_APPROVED"
  "approvedBy": "Manager Name"
}
```
4. On approval: order auto-transitions to `status: "confirmed"`
5. On rejection: order auto-transitions to `status: "cancelled"`

---

## Query Filtering

### Endpoint
```
GET /api/restaurant/:restaurantId/orders
```

### Query Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `status` | string | Order status (comma-separated) | `pending,confirmed` |
| `orderType` | string | Dining option type | `delivery` |
| `sourceDeviceId` | string | Device that created order | `uuid` |
| `deliveryStatus` | string | Delivery state filter | `OUT_FOR_DELIVERY` |
| `approvalStatus` | string | Catering approval filter | `NEEDS_APPROVAL` |
| `limit` | number | Max results (default 50) | `100` |

### Examples

**Get all pending deliveries:**
```
GET /api/restaurant/:id/orders?orderType=delivery&deliveryStatus=PREPARING
```

**Get catering orders needing approval:**
```
GET /api/restaurant/:id/orders?orderType=catering&approvalStatus=NEEDS_APPROVAL
```

**Get out-for-delivery orders:**
```
GET /api/restaurant/:id/orders?deliveryStatus=OUT_FOR_DELIVERY
```

---

## Validation Error Responses

### Format
```json
{
  "error": "Invalid dining option data",
  "details": [
    "Customer: firstName: First name is required",
    "Delivery: state: State must be 2-letter code",
    "Delivery: zip: ZIP code must be 5 or 9 digits (e.g., 12345 or 12345-6789)"
  ]
}
```

### Common Validation Errors

| Error Message | Cause | Fix |
|---------------|-------|-----|
| `Customer information is required for delivery orders` | Missing `customerInfo` | Add `customerInfo` object |
| `First name is required` | Missing or empty `firstName` | Provide valid first name |
| `Phone number must be at least 10 digits` | Phone too short | Use format: `5551234567` |
| `Valid email is required` | Invalid email format | Use valid email or omit field |
| `Delivery address information is required for delivery orders` | Missing `deliveryInfo` | Add `deliveryInfo` object |
| `City is required` | Missing `city` | Provide city name |
| `State must be 2-letter code` | Invalid state (e.g., "Florida") | Use 2-letter code (e.g., "FL") |
| `State must be uppercase 2-letter code` | Lowercase state code | Use uppercase (e.g., "FL" not "fl") |
| `ZIP code must be 5 or 9 digits` | Invalid ZIP format | Use `12345` or `12345-6789` |
| `Vehicle description is required for curbside pickup orders` | Missing `curbsideInfo` | Add `curbsideInfo.vehicleDescription` |
| `Catering event information is required for catering orders` | Missing `cateringInfo` | Add `cateringInfo` object |
| `Event date must be a valid ISO datetime` | Invalid date format | Use ISO 8601: `2026-03-01T18:00:00Z` |
| `Headcount must be at least 1` | Missing or zero headcount | Provide positive integer |
| `Table ID or table number is required for dine-in orders` | Missing both `tableId` and `tableNumber` | Provide one |

---

## Response Format

All order responses are enriched with nested dining objects:

```json
{
  "id": "uuid",
  "restaurantId": "uuid",
  "orderType": "delivery",
  "orderSource": "online",
  "status": "pending",
  "subtotal": 45.00,
  "tax": 3.71,
  "total": 48.71,
  "specialInstructions": "No onions",

  "deliveryInfo": {
    "address": "123 Main St",
    "address2": "Apt 4B",
    "city": "Fort Lauderdale",
    "state": "FL",
    "zip": "33301",
    "deliveryNotes": "Ring doorbell twice",
    "deliveryState": "PREPARING",
    "estimatedDeliveryTime": "2026-02-15T19:00:00Z",
    "dispatchedDate": null,
    "deliveredDate": null
  },

  "curbsideInfo": null,
  "cateringInfo": null,

  "orderItems": [...],
  "customer": {...},
  "createdAt": "2026-02-15T18:30:00Z",
  "updatedAt": "2026-02-15T18:30:00Z"
}
```

**Note:** Only the relevant nested object is populated based on `orderType`. Others are `null`.

---

## State Machines

### Delivery Status Workflow
```
┌──────────┐
│ PREPARING │ ← Initial state (auto-set on order creation)
└─────┬────┘
      │ (Staff marks ready + driver assigned)
      ▼
┌───────────────────┐
│ OUT_FOR_DELIVERY  │
└─────┬─────────────┘
      │ (Driver confirms delivery)
      ▼
┌───────────┐
│ DELIVERED │ ← Terminal state
└───────────┘
```

### Catering Approval Workflow
```
┌─────────────────┐
│ NEEDS_APPROVAL  │ ← Initial state (auto-set on order creation)
└────────┬────────┘
         │
    ┌────┴────┐
    │ Review  │ (Staff evaluates order)
    └────┬────┘
         │
    ┌────┴──────┐
    │           │
    ▼           ▼
┌──────────┐  ┌──────────────┐
│ APPROVED │  │ NOT_APPROVED │
└────┬─────┘  └──────┬───────┘
     │               │
     │ (Auto)        │ (Auto)
     ▼               ▼
┌───────────┐  ┌────────────┐
│ confirmed │  │ cancelled  │
└───────────┘  └────────────┘
```

---

## Integration Examples

### Frontend Service Call (TypeScript)
```typescript
// Create delivery order
const order = await orderService.createOrder(restaurantId, {
  orderType: 'delivery',
  orderSource: 'online',
  customerInfo: {
    firstName: 'John',
    lastName: 'Doe',
    phone: '5551234567',
    email: 'john@example.com',
  },
  deliveryInfo: {
    address: '123 Main St',
    city: 'Fort Lauderdale',
    state: 'FL',
    zip: '33301',
    deliveryNotes: 'Ring doorbell',
  },
  items: [
    { menuItemId: 'item-uuid', quantity: 2, modifiers: [] }
  ],
});

// Update delivery status
await orderService.updateDeliveryStatus(orderId, 'OUT_FOR_DELIVERY');

// Notify curbside arrival
await orderService.notifyArrival(orderId);

// Approve catering order
await orderService.approveCateringOrder(orderId, 'APPROVED', 'Manager Name');
```

---

## Testing Checklist

- [ ] Delivery order without address → 400 error
- [ ] Delivery order with invalid state (e.g., "Florida") → 400 error
- [ ] Delivery order with invalid ZIP → 400 error
- [ ] Catering order without headcount → 400 error
- [ ] Curbside order without vehicle → 400 error
- [ ] Takeout order without customer info → 400 error
- [ ] Dine-in order without table → 400 error
- [ ] Valid delivery order → 201 Created
- [ ] Query filter by deliveryStatus → returns filtered results
- [ ] Query filter by approvalStatus → returns filtered results
- [ ] Delivery state transition (PREPARING → OUT_FOR_DELIVERY) → success
- [ ] Invalid delivery transition (PREPARING → DELIVERED) → 409 error
- [ ] Catering approval workflow (NEEDS_APPROVAL → APPROVED → confirmed) → success
- [ ] Curbside arrival notification → sets `arrivalNotified: true`

---

*Last Updated: February 12, 2026*
*GetOrderStack Backend v1.0*
