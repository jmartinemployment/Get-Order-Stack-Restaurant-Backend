# Tax Implementation Notes

**Last Updated:** January 19, 2026  
**Applies To:** GetOrderStack Restaurant API

---

## Current Implementation (Florida Only)

### How It Works
1. Restaurant created with ZIP code
2. System looks up tax rate: DB → AI → 7% fallback
3. Rate stored on restaurant record
4. Orders use restaurant's tax rate for all items

### Why This Works for Florida
| Complexity | Florida Status |
|------------|----------------|
| State base rate | 6% statewide |
| County surtax | 0% - 1.5% (varies by county) |
| City-level tax | **None** - Florida prohibits city sales tax |
| Special districts | **None** for restaurant sales |
| Alcohol rate | **Same as food** |
| Grocery rate | **Same as food** |

**Florida = State + County only. No other complications.**

---

## What's NOT Needed for Florida

- ❌ Modifier-level tax categories (alcohol taxed same as food)
- ❌ State tax rules table (single rate applies to all categories)
- ❌ City or special district lookups
- ❌ Different rates by item category

---

## WHEN EXPANDING BEYOND FLORIDA - READ THIS

### States With Different Rules

| State | Complication |
|-------|-------------|
| California | Alcohol EXEMPT from sales tax, food taxed |
| New York | Different rates for alcohol vs food |
| Colorado | City-level taxes vary, including alcohol |
| Oregon | No sales tax at all |
| Texas | Similar to Florida (simple) |

### What You'll Need to Build

1. **State Tax Rules Table**
```
   state | category      | rate    | notes
   CA    | prepared_food | 0.0725  | 
   CA    | alcohol       | 0       | exempt
   CA    | grocery       | 0       | exempt
```

2. **Modifier Tax Category Field**
   - Already exists in schema as nullable field
   - Would need: UI dropdown in modifier editor
   - Default: "Same as item" (null = inherit)

3. **OR: Integrate Tax API**
   - TaxJar, Avalara, etc.
   - ~$50-500/month
   - They handle all complexity
   - **Recommended over building yourself**

### Decision Point
When first non-Florida restaurant signs up:
1. Check their state's rules
2. If simple (like Texas): extend current system
3. If complex (like California): integrate TaxJar

---

## Database Schema Reference

### Current Tax-Related Fields
```prisma
model Restaurant {
  taxRate  Decimal  @default(0.07)  // Stored rate from ZIP lookup
  zip      String?                   // Used for initial lookup
  state    String   @default("FL")
}

model MenuItem {
  taxCategory  String  @default("prepared_food")
  // Values: "prepared_food", "grocery", "alcohol", "tax_exempt"
  // Currently unused - all categories taxed at same rate in FL
}

model TaxJurisdiction {
  zipCode    String
  state      String
  taxRate    Decimal
  breakdown  Json     // { state: 0.06, county: 0.01 }
  source     String   // "ai", "manual", "api"
}
```

### Modifier Tax Category (NOT IMPLEMENTED)
Schema supports it but UI/logic not built:
```prisma
model Modifier {
  taxCategory  String?  // null = inherit from parent MenuItem
}
```

---

## Contact / Questions

This was discussed on January 19, 2026. If revisiting, search Claude conversation history for "tax category" or "alcohol tax" for full context.

---

## Recommended Future Architecture (Added January 19, 2026)

### Clean Category-Based Tax Calculation

When expanding beyond Florida, **don't loop through items in tax service**. Instead:

**Order creation groups subtotals:**
```typescript
let foodSubtotal = 0;
let alcoholSubtotal = 0;

for (item of orderItems) {
  if (menuItem.taxCategory === 'alcohol') {
    alcoholSubtotal += itemTotal;
  } else {
    foodSubtotal += itemTotal;
  }
}

const foodRate = taxService.getRate(state, 'prepared_food', baseRate);
const alcoholRate = taxService.getRate(state, 'alcohol', baseRate);

const tax = (foodSubtotal * foodRate) + (alcoholSubtotal * alcoholRate);
```

### StateTaxRule Table (Build When Needed)
```prisma
model StateTaxRule {
  id        String   @id @default(uuid())
  state     String
  category  String   // 'prepared_food', 'alcohol'
  rate      Decimal  @db.Decimal(5, 4)
  source    String   @default("ai")  // "ai", "manual", "api"
  notes     String?
  updatedAt DateTime @updatedAt

  @@unique([state, category])
  @@map("state_tax_rules")
}
```

**Example data:**
| state | category | rate | notes |
|-------|----------|------|-------|
| CA | alcohol | 0 | exempt at POS |
| CA | prepared_food | 0.0725 | |
| NY | alcohol | 0.08 | higher than food |

**Florida:** No rows needed - uses base ZIP rate for everything.

### taxService.getRate() Pattern

**Today (Florida-only):**
```typescript
getRate(state: string, category: string, baseRate: number): number {
  return baseRate;  // Florida: same rate for all
}
```

**Future (with StateTaxRule):**
```typescript
async getRate(state: string, category: string, baseRate: number): Promise<number> {
  // Check for state-specific override
  const rule = await prisma.stateTaxRule.findUnique({
    where: { state_category: { state, category } }
  });
  
  if (rule) return Number(rule.rate);
  
  // No override - use base rate
  return baseRate;
}
```

### Key Principle

**Order creation code stays the same.** Only `taxService.getRate()` internals change when adding new states.
