# DineFlow – Inventory Management System (IMS)
## Technical Specification & Architecture Design
**Date:** 21 November 2026
**Document Version:** 1.0.0
**Status:** Approved & Implemented
**Scope:** Complete Restaurant Inventory Management, Stock Movements, Purchasing, Recipe BOM & Order Deductions, Physical Audits, and Cost Reporting

---

## 1. Executive Summary & Architecture Overview

The **Inventory Management System (IMS)** is implemented as a core enterprise module within the existing DineFlow monorepo (`Restaurant-Repo`). Operating on the existing PostgreSQL database and FastAPI backend with a React.js / Vite / Tailwind CSS frontend, IMS automates stock tracking, supplier management, purchase order fulfillment, bill image attachments, recipe Bill of Materials (BOM), atomic kitchen order stock deductions, physical count reconciliations, and financial food costing.

### Business Context Boundary
- **Exclusively RESTAURANT Domain:** Inventory is exclusively scoped to restaurant operations. All APIs require `require_restaurant_context` and `require_roles("MANAGER")`.
- **Zero-Touch Spa Isolation:** The 11 Spa tables (`spa_*`), Spa routes (`/spa/*`), and `SPA` business context operate completely untouched and independent.

### Monorepo Architecture Layout
```
Restaurant-Repo/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── inventory.py         # Complete IMS endpoints (Items, Categories, Suppliers, POs, GRNs, Recipes, Stock Counts, Reports)
│   │   │   ├── order.py             # Order lifecycle hook: Atomic stock deduction on 'Preparing', reversal on 'Cancelled'
│   │   │   ├── menu.py              # Live inventory readiness badge computation (IN_STOCK, LOW_STOCK, OUT_OF_STOCK)
│   │   │   └── dashboard.py         # Inventory KPI cards (Total Items, Low Stock, Out of Stock, Valuation)
│   │   ├── core/
│   │   │   └── image_upload.py      # Authenticated vendor bill image uploads (backend/uploads/bills/)
│   │   ├── models/
│   │   │   ├── inventory.py         # 13 SQLAlchemy 2.0 models (Categories, Items, Suppliers, POs, GRNs, Recipes, Movements, StockCounts)
│   │   │   └── __init__.py          # Central registry of all models
│   │   ├── schemas/
│   │   │   ├── inventory.py         # Pydantic v2 schemas for all 13 entities, movement types, reports & availability
│   │   │   ├── menu.py              # Extended with inventory_status & max_preparable_servings
│   │   │   └── dashboard.py         # Extended with 4 inventory metrics
│   │   └── services/
│   │       ├── inventory_service.py # Core transactional engine (WAC, row locking, BOM order deduction/reversal, variances)
│   │       └── order_service.py     # Background auto-cancellation stale order stock reversal
│   ├── migrations/versions/
│   │   └── 425b4608eada_add_inventory_management_tables.py  # Additive Alembic migration (head: 425b4608eada)
│   └── tests/
│       └── test_inventory_module.py # Comprehensive automated test suite (9 test suites, covering all 5 phases)
├── frontend/
│   └── src/
│       ├── components/
│       │   └── Sidebar.jsx          # Package icon & /inventory navigation link for Restaurant context
│       ├── modules/
│       │   └── inventory/
│       │       └── pages/
│       │           ├── InventoryStock.jsx      # Stock ledger, items master, category modal, opening balance
│       │           ├── InventoryPurchases.jsx  # PO builder, vendor dispatch, GRN receipt, bill image upload
│       │           ├── InventorySuppliers.jsx  # Supplier directory & ingredient catalog mapping
│       │           ├── InventoryRecipes.jsx    # Menu item BOM builder, food cost % & margin calculations
│       │           ├── InventoryWastage.jsx    # Wastage tracking, reason logging, manual adjustments & audit log
│       │           ├── InventoryStockCount.jsx  # Physical audit sessions (Draft -> Submitted -> Approved)
│       │           └── InventoryReports.jsx     # Valuation, consumption, wastage, margins, double-entry reconciliation
│       ├── pages/
│       │   ├── Inventory.jsx        # Top-level tabbed navigation host
│       │   ├── Dashboard.jsx        # Inventory Health KPI section
│       │   └── Menu.jsx             # Live stock availability badges & max preparable servings
│       ├── services/
│       │   └── inventoryService.js  # Centralized Axios client for all inventory endpoints
│       └── App.jsx                  # Protected route registration under /inventory
└── docs/
    ├── INVENTORY_MANAGEMENT_SYSTEM_SPEC.md
    └── SPA_MANAGEMENT_SYSTEM_SPEC.md
```

---

## 2. Database Architecture & Data Dictionary

The additive Alembic migration `425b4608eada` introduces 13 interconnected database tables with strict relational integrity, foreign key cascades/protects, unique constraints, and PostgreSQL `NUMERIC` types to completely eliminate floating-point rounding errors.

### 2.1 Table Inventory

| Table Name | Description | Key Foreign Keys | Key Constraints & Indexes |
|---|---|---|---|
| `inventory_categories` | Item categories (Vegetables, Dairy, Spices, Packaging, etc.) | None | Unique `name` |
| `inventory_items` | Master inventory items & stock levels | `category_id` -> `inventory_categories.id` | Unique `item_code`, `current_stock >= 0` check |
| `suppliers` | Vendors and raw material distributors | None | Unique `supplier_code`, `name` |
| `supplier_items` | Supplier-specific item catalog & agreed pricing | `supplier_id`, `item_id` | Unique `(supplier_id, item_id)` |
| `recipes` | BOM recipe headers mapped to `menu_items` | `menu_item_id` -> `menu_items.id` | Unique `menu_item_id` |
| `recipe_items` | Ingredients and quantities required per serving | `recipe_id`, `item_id` | Unique `(recipe_id, item_id)` |
| `purchase_orders` | Purchase order headers | `supplier_id` -> `suppliers.id`, `created_by` | Unique `po_number` |
| `purchase_order_items` | Line items on purchase orders | `po_id`, `item_id` | Unique `(po_id, item_id)` |
| `goods_receipts` | Inward shipment receipt notes (GRN) | `po_id`, `supplier_id`, `received_by` | Unique `grn_number` |
| `goods_receipt_items` | Received quantities, unit costs, and tax rates | `grn_id`, `po_item_id`, `item_id` | Foreign keys to item & PO item |
| `stock_movements` | Immutable double-entry stock movement journal | `item_id`, `created_by` | Index on `(item_id, created_at)` |
| `stock_counts` | Physical stock audit sessions | `initiated_by`, `approved_by` | Unique `count_number` |
| `stock_count_items` | Counted quantities, system snapshot, and variances | `stock_count_id`, `item_id` | Unique `(stock_count_id, item_id)` |

### 2.2 Enumerations

- **`MovementType`**: `PURCHASE_RECEIPT`, `ORDER_CONSUMPTION`, `ORDER_CANCELLATION_RETURN`, `WASTAGE`, `MANUAL_ADJUSTMENT`, `STOCK_COUNT_ADJUSTMENT`, `OPENING_STOCK`.
- **`UnitOfMeasure`**: `KG`, `G`, `L`, `ML`, `PCS`.
- **`POStatus`**: `DRAFT`, `ORDERED`, `PARTIALLY_RECEIVED`, `RECEIVED`, `CANCELLED`.
- **`StockCountStatus`**: `DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`.
- **`WastageReason`**: `SPOILED`, `EXPIRED`, `DAMAGED`, `PREPARATION_WASTE`, `SPILLAGE`, `OTHER`.
- **`InventoryAvailabilityStatus`**: `IN_STOCK`, `LOW_STOCK`, `OUT_OF_STOCK`, `NO_RECIPE`.

---

## 3. Core Business Rules & Transactional Engine

### 3.1 Strict Negative Stock Enforcement & Deadlock Prevention
1. **Zero Negative Stock:** Inventory quantities are guarded by a database check constraint (`current_stock >= 0`) and pre-validated in application logic.
2. **Order Transition to `Preparing`:**
   - When a kitchen order changes state to `Preparing`, the system aggregates all ingredients required across all order line items based on their active recipes (`Recipe` + `RecipeItem`).
   - If any ingredient has `item.current_stock < total_required`, the entire transition is aborted with HTTP 400.
   - The error payload returns structured details: `item_name`, `available_qty`, `required_qty`, and `deficit`.
   - No partial deductions are permitted.
3. **Deadlock Prevention via Ascending ID Sorting:**
   - When locking inventory items for atomic updates across concurrent kitchen orders, the system sorts `item_id`s in ascending numerical order before issuing SQLAlchemy `with_for_update()`.
   - This guarantees that two concurrent transactions competing for overlapping ingredients (e.g., Onions and Tomatoes) lock rows in identical sequence, completely avoiding PostgreSQL deadlocks.

### 3.2 Moving Weighted Average Cost (WAC)
Whenever new stock is received via Goods Receipt Note (GRN):
$$\text{New Average Cost} = \frac{(\text{Current Stock} \times \text{Current Avg Cost}) + (\text{Received Qty} \times \text{Received Unit Cost})}{\text{Current Stock} + \text{Received Qty}}$$
All calculations are performed using Python `Decimal` and rounded to 4 decimal places (`NUMERIC(14,4)` / `NUMERIC(12,4)`).

### 3.3 Order Cancellation & Auto-Cancellation Stock Reversal
- If an order in `Preparing`, `Ready`, or `Served` is cancelled, or if the background stale-order service automatically cancels an unpaid order, `reverse_order_inventory_deduction()` is invoked within the database transaction.
- Each deducted ingredient is credited back to `inventory_items.current_stock`.
- An immutable `ORDER_CANCELLATION_RETURN` movement is recorded in `stock_movements`.

### 3.4 Supplier Bill Image Uploads
- Vendor invoice scans and receipts are uploaded via `/api/inventory/upload-bill`.
- Files are validated against allowed MIME types (`image/jpeg`, `image/png`, `image/webp`, `application/pdf`) and a 5 MB maximum size.
- Stored on disk under `backend/uploads/bills/` with randomized, cryptographically safe UUID filenames.

### 3.5 Physical Stock Count 3-Phase Lifecycle
1. **Draft:** Session initiated. Snapshot of current book stock is captured for selected categories or all items.
2. **Submitted:** Physical counts entered by kitchen or inventory staff. Variances ($\text{Physical} - \text{Snapshot}$) calculated.
3. **Approved:** Manager reviews variances. Upon approval:
   - System updates `inventory_items.current_stock` to the physical count.
   - Generates a `STOCK_COUNT_ADJUSTMENT` movement for each non-zero variance.
   - Locks the count session permanently (`APPROVED`).

---

## 4. API Endpoints Reference

All endpoints are mounted under `/api/inventory` and require `MANAGER` role and `RESTAURANT` context:

| Method | Endpoint | Description |
|---|---|---|
| `GET` / `POST` | `/categories` | List and create inventory categories |
| `PUT` / `DELETE` | `/categories/{id}` | Update or soft-delete category |
| `GET` / `POST` | `/items` | List inventory items (with filters) and create item |
| `GET` / `PUT` | `/items/{id}` | Get item details and update item / reorder thresholds |
| `POST` | `/items/{id}/opening-stock` | Set initial opening balance & unit cost |
| `GET` / `POST` | `/suppliers` | List and register suppliers |
| `PUT` / `DELETE` | `/suppliers/{id}` | Update or deactivate supplier |
| `GET` / `POST` | `/suppliers/{id}/items` | Manage supplier item catalog & agreed pricing |
| `GET` / `POST` | `/recipes` | List and create/update recipe Bill of Materials |
| `GET` / `DELETE`| `/recipes/{id}` | Get recipe details and remove recipe |
| `GET` / `POST` | `/purchase-orders` | List and generate purchase orders |
| `PUT` | `/purchase-orders/{id}/status` | Update PO status (e.g. mark ORDERED or CANCELLED) |
| `GET` / `POST` | `/goods-receipts` | List GRNs and record physical goods receipt |
| `POST` | `/upload-bill` | Upload vendor bill image / PDF |
| `POST` | `/wastage` | Log ingredient spoilage / expiration / damage |
| `POST` | `/adjustments` | Manual stock corrections with audit reason |
| `GET` / `POST` | `/stock-counts` | Initiate and list physical stock audit sessions |
| `PUT` | `/stock-counts/{id}/submit` | Submit physical counts for audit |
| `PUT` | `/stock-counts/{id}/approve` | Manager approval & automated variance stock movement posting |
| `GET` | `/movements` | Query immutable stock movement ledger |
| `GET` | `/menu-availability` | Real-time maximum preparable servings for all menu items |
| `GET` | `/reports/valuation` | Total stock valuation by item and category |
| `GET` | `/reports/consumption` | Total ingredient consumption by date range |
| `GET` | `/reports/wastage` | Wastage loss breakdown by reason and cost |
| `GET` | `/reports/food-cost` | Recipe ingredient food cost % and gross margins |
| `GET` | `/reports/reconciliation` | Double-entry ledger audit ($\sum movements == current\_stock$) |

---

## 5. Frontend User Interface Architecture

The frontend is implemented under `frontend/src/modules/inventory/pages/` and organized into a unified tabbed interface accessed via the sidebar's **Inventory** menu (`/inventory`):

1. **Stock Ledger (`InventoryStock.jsx`):**
   - Displays real-time stock levels, base units, average unit costs, and calculated stock valuations.
   - Status indicators for Healthy Stock, Low Stock (below reorder point), and Out of Stock.
   - Category management dialog and Opening Stock initialisation modal.
2. **Purchasing & GRN (`InventoryPurchases.jsx`):**
   - PO Creation workflow with supplier selection, line-item pricing, tax rate calculation, and notes.
   - Vendor dispatch actions and multi-step GRN receipt modal supporting full or partial deliveries.
   - Bill image upload with drag-and-drop file preview.
3. **Suppliers Directory (`InventorySuppliers.jsx`):**
   - Supplier contact information, payment terms, and active/inactive status toggles.
   - Sub-panel mapping suppliers to inventory items with supplier item codes and negotiated prices.
4. **Recipe BOM Manager (`InventoryRecipes.jsx`):**
   - Visual recipe builder allowing chef/manager to map restaurant menu items to ingredients and quantities.
   - Real-time cost calculations showing total portion cost, menu selling price, Food Cost Percentage, and Gross Margin.
5. **Wastage & Adjustments (`InventoryWastage.jsx`):**
   - Wastage logging form with mandatory reason classification and financial loss computation.
   - Manual stock corrections and a complete movement journal filterable by movement type and date range.
6. **Physical Stock Count (`InventoryStockCount.jsx`):**
   - Audit session manager with Draft, Submitted, and Approved workflow states.
   - Interactive count sheet highlighting positive/negative discrepancies and total variance values.
7. **Reports & Analytics (`InventoryReports.jsx`):**
   - Stock Valuation summary and category breakdown.
   - Consumption metrics and top consumed ingredients.
   - Wastage loss analytics categorized by reason.
   - Menu item food cost margins.
   - Double-entry ledger audit verification engine ensuring $0.00 discrepancy between movement journal sums and current stock.

---

## 6. Verification & Test Suite Matrix

The implementation is verified by 32 automated unit tests (`Ran 32 tests in 4.271s - OK`) and a production frontend build:

| Test ID | Test Category | Coverage Scope | Status |
|---|---|---|---|
| `test_01` | Master Data Foundation | Category & Item creation, unique constraints, opening stock, audit trails | Pass |
| `test_02` | Suppliers & Purchasing | Supplier registration, catalog mapping, PO creation, full/partial GRN receipt, WAC recalculation | Pass |
| `test_03` | Recipe BOM & Deductions | Multi-ingredient BOM creation, atomic deduction when order enters `Preparing`, cancellation reversal | Pass |
| `test_04` | Negative Stock Prevention | Order transition to `Preparing` rejected when stock is insufficient, structured deficit details | Pass |
| `test_05` | Wastage & Adjustments | Spoilage logging, negative stock prevention on wastage, manual adjustment audit trail | Pass |
| `test_06` | Stock Count Lifecycle | Draft snapshot, count entry submission, manager approval, automated variance movement posting | Pass |
| `test_07` | Reports & Ledger Audit | Valuation, consumption, wastage, food cost margin calculations, double-entry mathematical reconciliation | Pass |
| `test_08` | Cross-Context Security | Zero-leakage verification: SPA users rejected with 403 Forbidden on all Inventory endpoints | Pass |
| `test_09` | Missing Recipe Graceful Fallback | Orders containing menu items without recipes process successfully without crashing | Pass |
| `test_01-23`| Regression Suite | Core Restaurant & Spa operations (Auth, Orders, Tables, Invoices, Bookings) remain 100% green | Pass |
| `Vite Build`| Frontend Compilation | 2,198 modules transformed into optimized production bundle with zero syntax/import errors | Pass |

---
*Signed and Approved for Production Deployment.*
