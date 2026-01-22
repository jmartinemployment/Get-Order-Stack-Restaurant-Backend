# GetOrderStack API - AI Features Session Handoff
**Date:** January 22, 2026  
**Session:** AI Features Implementation for January 31st Demo

---

## QUICK START FOR NEW SESSION

Say: "I'm continuing GetOrderStack. All AI backend features deployed including Checkout Profit Insight. Ready to integrate into POS frontend or build upsell prompts."

---

## ✅ ALL BACKEND AI FEATURES DEPLOYED

### 1. Menu Engineering Report - ✅ LIVE
```bash
curl "https://get-order-stack-restaurant-backend.onrender.com/api/restaurant/f2cfe8dd-48f3-4596-ab1e-22a28b23ad38/analytics/menu-engineering"
```
- 125 menu items analyzed into 4 quadrants
- AI-generated insights & upsell recommendations

---

### 2. Sales Insights Dashboard - ✅ LIVE
```bash
curl "https://get-order-stack-restaurant-backend.onrender.com/api/restaurant/f2cfe8dd-48f3-4596-ab1e-22a28b23ad38/analytics/sales/daily"
```
- Daily/weekly sales summaries with AI recommendations

---

### 3. Inventory Tracking - ✅ LIVE (Needs Data)
```bash
curl "https://get-order-stack-restaurant-backend.onrender.com/api/restaurant/f2cfe8dd-48f3-4596-ab1e-22a28b23ad38/inventory"
```
- Stock tracking, alerts, "run out by Thursday" predictions

---

### 4. Checkout Profit Insight - ✅ LIVE (NEW!)
```bash
# Single order insight (for checkout confirmation)
curl "https://get-order-stack-restaurant-backend.onrender.com/api/restaurant/f2cfe8dd-48f3-4596-ab1e-22a28b23ad38/orders/ORDER_ID/profit-insight"

# Recent orders summary (for dashboard)
curl "https://get-order-stack-restaurant-backend.onrender.com/api/restaurant/f2cfe8dd-48f3-4596-ab1e-22a28b23ad38/orders/recent-profit"
```

**Sample Response:**
```json
{
  "orderId": "da114622-a122-4753-8757-4138693ccff4",
  "orderNumber": "ORD-MKO42QYJ-I8KB",
  "subtotal": 32,
  "estimatedCost": 10.5,
  "estimatedProfit": 21.5,
  "profitMargin": 67,
  "starItem": {
    "name": "Jalea Mixta",
    "profit": 14.75,
    "margin": 67
  },
  "insightText": "✅ Order ORD-MKO42QYJ-I8KB placed - 67% margin ($21.50 profit). Jalea Mixta performed well.",
  "quickTip": "Solid order. Try suggesting appetizers or drinks for even better margins."
}
```

---

## 📋 TO-DO PRIORITY LIST

### Priority 1: POS Checkout Integration (2 hrs) - FRONTEND
**Goal:** Show profit insight after order is placed

**Files to modify:**
- `/apps/pos/src/components/CheckoutModal.tsx`

**Implementation:**
1. After successful order submission, call `/orders/:orderId/profit-insight`
2. Display insight in a success toast or modal:
   ```
   ✅ Order #ORD-MKO42QYJ-I8KB placed!
   💰 67% margin ($21.50 profit)
   ⭐ Star item: Jalea Mixta
   ```
3. Auto-dismiss after 5 seconds or on tap

---

### Priority 2: POS Upsell Prompt Component (3 hrs) - FRONTEND
**Goal:** Show staff upsell suggestions while taking orders

**Endpoint:** `GET /:restaurantId/analytics/upsell-suggestions?cartItems=item1,item2`

**Implementation:**
1. Create `UpsellPrompt.tsx` component
2. Call endpoint when cart changes
3. Display floating prompt: "💡 Suggest: Yuca a la Huancaina (68% margin)"
4. Subtle, non-intrusive design

---

### Priority 3: Seed Sample Inventory Data (1 hr) - BACKEND
**Goal:** Make inventory predictions work for demo

```bash
curl -X POST "http://localhost:3000/api/restaurant/f2cfe8dd-48f3-4596-ab1e-22a28b23ad38/inventory" \
  -H "Content-Type: application/json" \
  -d '{"name": "Pollo", "nameEn": "Chicken", "unit": "lbs", "currentStock": 25, "minStock": 10, "costPerUnit": 3.50, "category": "protein"}'
```

**Items to seed:** Chicken, Beef, Fish (Corvina), Shrimp, Rice, Potatoes, Aji Amarillo, Leche de Tigre

---

### Priority 4: Menu Engineering Dashboard (4 hrs) - FRONTEND
**Goal:** Visual display of menu quadrants

**New screen:** `MenuEngineeringScreen.tsx`
- 4-quadrant chart (Stars, Cash Cows, Puzzles, Dogs)
- List items by quadrant
- AI insights panel
- Tap item for details

---

### Priority 5: Sales Insights Dashboard (4 hrs) - FRONTEND
**Goal:** Daily sales intelligence

**New screen:** `SalesInsightsScreen.tsx`
- Today's sales vs yesterday
- Top sellers chart
- AI insights panel
- Trend indicators

---

### Priority 6: Recent Profit Dashboard Widget (2 hrs) - FRONTEND
**Goal:** Show profit summary on main POS screen

**Endpoint:** `GET /:restaurantId/orders/recent-profit`
- Display: "Today: $215 profit (67% avg margin)"
- Last 10 orders breakdown

---

## 🔑 KEY CONTEXT

### Restaurant IDs (Taipa)
```
f2cfe8dd-48f3-4596-ab1e-22a28b23ad38
e29f2f0a-9d2e-46cf-941c-b87ed408e892
```

### Production URLs
- **Backend:** https://get-order-stack-restaurant-backend.onrender.com
- **POS Frontend:** https://get-order-stack-restaurant-mobile.vercel.app

### Local Development
- **Backend Port:** `http://localhost:3000`
- **Mobile Path:** `/Users/jam/development/Get-Order-Stack-Restaurant-Mobile`
- **Backend Path:** `/Users/jam/development/Get-Order-Stack-Restaurant-Backend`

---

## 🗂️ FILES CREATED THIS SESSION

| File | Description |
|------|-------------|
| `/src/services/menu-engineering.service.ts` | 4-quadrant analysis |
| `/src/services/sales-insights.service.ts` | Sales analysis with AI |
| `/src/services/inventory.service.ts` | Stock tracking |
| `/src/services/order-profit.service.ts` | **NEW** - Checkout profit insight |
| `/src/app/analytics.routes.ts` | All AI API routes |

---

## ⚠️ IMPORTANT: Route Order Fix

In `app.ts`, analytics routes must be registered BEFORE menu routes:
```typescript
// Routes - ORDER MATTERS! More specific routes first
app.use('/api/restaurant', analyticsRoutes);  // Must be first
app.use('/api/restaurant', primaryCategoryRoutes);
app.use('/api/restaurant', menuRoutes);
```

This prevents `/orders/:orderId` from catching `/orders/recent-profit`.

---

## 💡 DEMO SCRIPT FOR JAN 31

### 1. Take Order → Show Profit (WOW moment!)
```
→ Ring up Jalea Mixta + Yuca a la Huancaina
→ Complete checkout
→ Screen shows: "67% margin - $21.50 profit! ⭐ Jalea Mixta is your star"
→ "Your staff knows instantly if it was a good sale"
```

### 2. Upsell Prompts
```
→ Add item to cart
→ Prompt appears: "💡 Suggest Chicha Sour - 67% margin"
→ "Real-time coaching for your staff"
```

### 3. Menu Engineering
```
→ Open analytics dashboard
→ "Here's your menu in 4 quadrants"
→ "Stars = promote, Puzzles = raise prices"
```

### 4. Daily Insights
```
→ "Here's your daily intelligence report"
→ Show AI recommendations
```

---

## 📊 API ENDPOINTS SUMMARY

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/:id/analytics/menu-engineering` | GET | 4-quadrant menu analysis |
| `/:id/analytics/upsell-suggestions` | GET | Real-time upsell prompts |
| `/:id/analytics/sales/daily` | GET | Daily sales with AI |
| `/:id/analytics/sales/weekly` | GET | Weekly sales summary |
| `/:id/orders/:orderId/profit-insight` | GET | **NEW** Single order profit |
| `/:id/orders/recent-profit` | GET | **NEW** Recent orders summary |
| `/:id/inventory` | GET/POST | Inventory CRUD |
| `/:id/inventory/alerts` | GET | Low stock warnings |
| `/:id/inventory/predictions` | GET | Stock runout predictions |

---

*Last Updated: January 22, 2026 ~4:15pm EST*
*Status: All Backend AI Features ✅ DEPLOYED | Frontend Integration Next*
