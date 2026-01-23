# GetOrderStack API - AI Features Session Handoff
**Date:** January 22, 2026  
**Session:** AI Features Implementation for January 31st Demo

---

## QUICK START FOR NEW SESSION

Say: "I'm continuing GetOrderStack. Profit insight is live in POS checkout. Next: redesign MenuScreen layout to add upsell suggestions before order placement."

---

## ✅ COMPLETED THIS SESSION

### 1. Checkout Profit Insight - ✅ LIVE & TESTED!
**Screenshot confirmed working:** Shows after order placement
- 💰 65% margin | $27.90 profit
- ⭐ Star item: Pescado a lo Macho - Fish
- Quick tip for staff

**Endpoints:**
```bash
# Single order insight
GET /api/restaurant/:id/orders/:orderId/profit-insight

# Recent orders summary  
GET /api/restaurant/:id/orders/recent-profit
```

### 2. Table Handling Fix - ✅
- Fixed foreign key constraint error for manual table numbers
- Dine-in now works with or without configured tables

### 3. All Backend AI Features - ✅ DEPLOYED
- Menu Engineering Report
- Sales Insights Dashboard
- Inventory Tracking
- Order Profit Insight

---

## 📋 NEXT PRIORITY: MenuScreen Redesign + Upsell Suggestions

### Current Layout Problem
```
[Primary Category Pills]
[Subcategory Pills] ←── Takes horizontal space, limits visibility
[Items Grid - only shows ONE subcategory at a time]
[Cart Sidebar]
```

### Proposed New Layout
```
[Primary Category Pills]
[Scrollable Menu Area]
  ═══ Subcategory Name (highlight ribbon) ═══
  [Item] [Item] [Item]
  ═══ Next Subcategory ═══
  [Item] [Item] [Item]
  ... (ALL items from primary category visible)
  
[🔥 Upsell Bar] ←── NEW!
  "💡 Suggest: Yuca a la Huancaina - 68% margin"
  [+ Add]
  
[Cart Sidebar]
```

### Benefits
1. **Better browsing** - All items visible in one scroll, not hidden behind subcategory tabs
2. **Subcategory headers** - Highlighted ribbon separators instead of tabs
3. **Upsell suggestions** - Fixed bar shows AI recommendations based on cart
4. **More selling** - Staff sees what to suggest BEFORE completing order

### Implementation Plan (3-4 hours)

**Step 1: Flatten Menu Display**
- Remove subcategory tabs
- Show all subcategories as sections with header ribbons
- Scrollable list shows everything from selected primary category

**Step 2: Add Upsell Bar Component**
```tsx
// New component: UpsellBar.tsx
interface UpsellBarProps {
  restaurantId: string;
  cartItemIds: string[];
  onAddItem: (item: MenuItem) => void;
}
```

**Step 3: Fetch Upsell Suggestions**
```typescript
// When cart changes, call:
GET /api/restaurant/:id/analytics/upsell-suggestions?cartItems=id1,id2

// Response:
{
  suggestions: [
    { menuItemId: "xxx", name: "Yuca a la Huancaina", margin: 68, reason: "High margin appetizer" }
  ]
}
```

**Step 4: Display in Fixed Bar**
- Subtle green/gold bar above cart
- Shows 1-2 suggestions max
- Tap to add directly to cart
- Auto-hides when cart is empty

### Files to Modify
- `/apps/pos/src/screens/MenuScreen.tsx` - Flatten subcategory display
- `/apps/pos/src/components/UpsellBar.tsx` - NEW component
- Backend endpoint already exists: `/analytics/upsell-suggestions`

---

## 🔑 KEY CONTEXT

### Restaurant IDs (Taipa)
```
f2cfe8dd-48f3-4596-ab1e-22a28b23ad38
```

### Production URLs
- **Backend:** https://get-order-stack-restaurant-backend.onrender.com
- **POS Frontend:** https://get-order-stack-restaurant-mobile.vercel.app

### Local Development
- **Backend Port:** `http://localhost:3000`
- **POS:** `npm run pos` (runs on localhost:8081)
- **Mobile Path:** `/Users/jam/development/Get-Order-Stack-Restaurant-Mobile`
- **Backend Path:** `/Users/jam/development/Get-Order-Stack-Restaurant-Backend`

---

## 📊 API ENDPOINTS SUMMARY

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/:id/analytics/menu-engineering` | GET | 4-quadrant menu analysis |
| `/:id/analytics/upsell-suggestions` | GET | Real-time upsell prompts |
| `/:id/analytics/sales/daily` | GET | Daily sales with AI |
| `/:id/analytics/sales/weekly` | GET | Weekly sales summary |
| `/:id/orders/:orderId/profit-insight` | GET | Single order profit |
| `/:id/orders/recent-profit` | GET | Recent orders summary |
| `/:id/inventory` | GET/POST | Inventory CRUD |
| `/:id/inventory/alerts` | GET | Low stock warnings |
| `/:id/inventory/predictions` | GET | Stock runout predictions |

---

## 🗂️ FILES MODIFIED THIS SESSION

### Backend
| File | Change |
|------|--------|
| `/src/services/order-profit.service.ts` | NEW - Profit insight service |
| `/src/app/analytics.routes.ts` | Added profit insight endpoints |
| `/src/app/app.ts` | Fixed route ordering (analytics before menu routes) |

### Frontend (Mobile)
| File | Change |
|------|--------|
| `/apps/pos/src/screens/MenuScreen.tsx` | Added profit insight display in success modal |
| `/apps/pos/src/components/CheckoutModal.tsx` | Added orderId to receipt data, fixed table handling |

---

## 💡 DEMO SCRIPT FOR JAN 31

### Demo Flow (with new features)
1. **Browse menu** - "See how all items are organized by category"
2. **Add items to cart** - Upsell bar appears: "💡 Try the Yuca - 68% margin!"
3. **Tap upsell suggestion** - Item added instantly
4. **Complete checkout** - Order placed!
5. **See profit insight** - "65% margin, $27.90 profit! Star item: Pescado"
6. **WOW moment** - "Your staff knows what to sell AND how profitable each order is"

### Key Talking Points
- "This isn't just a POS - it's a profit optimization system"
- "Your staff gets real-time coaching on what to recommend"
- "Every order shows you the profit instantly"
- "No more guessing which items make money"

---

## ⚠️ REMAINING TASKS

| # | Task | Est. Hours | Status |
|---|------|------------|--------|
| 1 | **MenuScreen redesign + Upsell bar** | 3-4 | 🎯 NEXT |
| 2 | Seed sample inventory data | 1 | Not started |
| 3 | Menu Engineering Dashboard | 4 | Not started |
| 4 | Sales Insights Dashboard | 4 | Not started |

---

*Last Updated: January 22, 2026 ~3:50pm EST*
*Status: Checkout Profit Insight ✅ LIVE | Upsell Redesign 🎯 NEXT*
