# AI Features Implementation - January 22, 2026

## Overview

Three AI-powered features have been built for the OrderStack restaurant management system:

1. **Menu Engineering Report** - Four-quadrant analysis with upsell suggestions
2. **AI Sales Insights Dashboard** - Daily/weekly summaries with AI recommendations  
3. **Simple Inventory Tracking** - Stock management with AI predictions

---

## 1. Menu Engineering Report

### What It Does
Analyzes all menu items and classifies them into the classic four-quadrant matrix:

| Quadrant | Criteria | Recommendation |
|----------|----------|----------------|
| ⭐ **Stars** | High profit, high sales | "Promote heavily. This is a winner." |
| 🐄 **Cash Cows** | High profit, LOW sales | "Train staff to upsell. Hidden gem!" |
| ❓ **Puzzles** | LOW profit, high sales | "Raise price or reduce cost." |
| 🐕 **Dogs** | Low profit, low sales | "Consider removing from menu." |

### API Endpoints

```
GET /api/restaurant/:restaurantId/analytics/menu-engineering
  Query params: days (default: 30)
  Returns: Full report with quadrants, AI insights, recommendations

GET /api/restaurant/:restaurantId/analytics/upsell-suggestions
  Query params: cartItems (comma-separated item IDs)
  Returns: Top 3 high-margin items to suggest
```

### POS Integration (Upsell Prompts)
The upsell suggestions endpoint can be called from the POS to show waitstaff:
- Which items to recommend
- Why (profit margin, popularity)
- Suggested script: "Would you like to add our [item]? It's one of our most popular items!"

### Files Created
- `/src/services/menu-engineering.service.ts`

---

## 2. AI Sales Insights Dashboard

### What It Does
- Daily and weekly sales summaries
- Comparison to previous period (yesterday, last week)
- AI-generated insights like:
  - "You sold 12 Lomo Saltados today - your most profitable item"
  - "Ceviche sold 3x more than last week. Consider prepping extra tomorrow"
  - "Average ticket $24.50 - 8% higher than typical Tuesday"
  - "If you raised Aji de Gallina by $1.50, you'd make an extra $847/month"

### API Endpoints

```
GET /api/restaurant/:restaurantId/analytics/sales/daily
  Query params: date (YYYY-MM-DD, default: today)
  Returns: Daily insights report

GET /api/restaurant/:restaurantId/analytics/sales/weekly
  Query params: weeksAgo (0 = current week)
  Returns: Weekly insights report

GET /api/restaurant/:restaurantId/analytics/sales/summary
  Query params: startDate, endDate (required)
  Returns: Sales summary for custom date range
```

### Insights Generated
- Revenue changes (vs yesterday, vs same day last week)
- Top selling items
- Most profitable items
- Profit margin analysis
- Peak hours identification
- Actionable recommendations

### Files Created
- `/src/services/sales-insights.service.ts`

---

## 3. Simple Inventory Tracking

### What It Does
- Track stock levels for ingredients
- Record usage and restocking
- Predict when items will run out
- Generate alerts for low/out of stock

### API Endpoints

```
# Basic CRUD
GET    /api/restaurant/:restaurantId/inventory
GET    /api/restaurant/:restaurantId/inventory/:itemId
POST   /api/restaurant/:restaurantId/inventory
PATCH  /api/restaurant/:restaurantId/inventory/:itemId/stock
POST   /api/restaurant/:restaurantId/inventory/:itemId/usage
POST   /api/restaurant/:restaurantId/inventory/:itemId/restock

# AI-Powered Analytics
GET /api/restaurant/:restaurantId/inventory/alerts
  Returns: Low stock, out of stock, overstock alerts

GET /api/restaurant/:restaurantId/inventory/predictions
  Returns: "You'll run out of chicken by Thursday"

GET /api/restaurant/:restaurantId/inventory/report
  Returns: Comprehensive inventory report with reorder list

GET /api/restaurant/:restaurantId/inventory/:itemId/predict
  Returns: AI prediction for specific item
```

### Prediction Logic
- Analyzes last 30 days of usage
- Calculates average daily consumption
- Predicts days until stockout
- Suggests reorder quantities

### Files Created
- `/src/services/inventory.service.ts`

---

## Database Changes

### New Tables (Migration: `20260122_add_inventory_management`)

```sql
inventory_items
  - id, restaurant_id, name, name_en
  - unit, current_stock, min_stock, max_stock
  - cost_per_unit, supplier, category
  - last_restocked, last_count_date

inventory_logs
  - id, inventory_item_id
  - previous_stock, new_stock, change_amount
  - reason, created_by, created_at

recipe_ingredients
  - menu_item_id, inventory_item_id
  - quantity, unit, notes
```

### Prisma Schema Updates
- Added `InventoryItem`, `InventoryLog`, `RecipeIngredient` models
- Added relation from `Restaurant` to `InventoryItem`
- Added relation from `MenuItem` to `RecipeIngredient`

---

## Route Registration

All routes are registered in `/src/app/app.ts`:

```typescript
app.use('/api/restaurant', analyticsRoutes);
```

---

## Demo Script

### Menu Engineering Demo
1. Open: `GET /api/restaurant/{id}/analytics/menu-engineering`
2. Show the four quadrants with real menu items
3. Highlight the AI insights
4. Show upsell suggestions for POS

### Sales Insights Demo  
1. Open: `GET /api/restaurant/{id}/analytics/sales/daily`
2. Show today's summary with comparison to yesterday
3. Point out the AI-generated insights
4. Show recommendations

### Inventory Demo
1. Create a few inventory items
2. Record some usage
3. Show: `GET /api/restaurant/{id}/inventory/predictions`
4. "You'll run out of chicken by Thursday"

---

## Next Steps

### To Deploy
1. Run Prisma migration: `npx prisma migrate deploy`
2. Generate Prisma client: `npx prisma generate`
3. Deploy to Render

### To Test Locally
```bash
cd /Users/jam/development/Get-Order-Stack-Restaurant-Backend
npm install
npx prisma migrate dev
npm run dev
```

### Frontend Integration
- Add Menu Engineering dashboard component
- Add Sales Insights dashboard component
- Add Inventory management screen
- Add upsell prompt component to POS checkout

---

## AI Service Details

All AI features use Claude (Anthropic API) for:
- Generating natural language insights
- Analyzing patterns in data
- Creating actionable recommendations

The services gracefully degrade if ANTHROPIC_API_KEY is not set, falling back to rule-based insights.

---

*Created: January 22, 2026*
*For: OrderStack Restaurant Management System*
