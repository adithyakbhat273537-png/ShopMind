# Invoice history and billing

## Why older invoices appeared missing

The existing database contained saved invoice records, but the Sales Desk fetched only the latest ten rows. Its search matched mobile, order number, invoice number, or numeric order ID; it did not match customer names and had no date/status filters or pagination. The provided screenshot also showed HTTP 404 for invoice activity. The current source had the `/api/sales/recent` route, which means the running Flask process was older than this checkout or was started from another ShopMind folder. The full history below reads persisted invoice rows and is independent of React state.

## Database

`database/migrations/0011_invoice_history.sql` is additive and safe to re-run. It adds invoice snapshots for customer details, totals, discount, tax, payment method/status, plus a checkout request ID and history indexes. It backfills the existing rows from `orders`. Product names, SKUs, quantities and unit prices remain available from `order_items`, which already stores the sale-time snapshot. It does not delete or rewrite orders or line items.

The migration was applied to the configured Supabase database on 2026-11-19. Verification found **2 existing invoices before and after**, both with customer snapshots populated. Their payment status is `unknown`, because the previous schema did not record one. The migration does not invent payment-method values.

New bills calculate subtotal, discount, and configured GST on the Flask server, save a payment method and paid status, update stock, and create the invoice in the same PostgreSQL transaction. `request_id` prevents an identical network retry from creating a duplicate order/invoice. Invoice/order-item values are saved once and are not recalculated from later catalogue edits.

## API

All routes require a valid Supabase access token and a database role of `admin` or `staff`.

| Route | Purpose |
|---|---|
| `POST /api/sales` | Validate items/prices/stock, record a sale and invoice atomically |
| `GET /api/sales/invoices` | Persistent, paginated history with `q`, `from`, `to`, `status`, `sort`, `page`, and `per_page` filters |
| `GET /api/sales/invoices/<invoice_id>` | Saved invoice and item snapshots for view/print |
| `GET /api/sales/invoices/<invoice_id>/pdf` | Branded A4 PDF from saved invoice/order values |
| `GET /api/sales/<order_id>/invoice.pdf` | Backwards-compatible PDF route |
| `GET /api/sales/recent` | Backwards-compatible latest-ten Sales Desk summary |

The owner/admin and approved Sales staff share access under the existing Flask role checks. No invoice endpoint trusts a role sent from the browser. If customer accounts are reintroduced, the current staff-only view policy should be extended deliberately rather than exposing all invoices to a customer.

## Invoice branding

The PDF embeds the repository `logo.png` and uses a navy, blue, white, and orange A4 design. Optional real store details can be configured in `backend/.env`:

```env
SHOPMIND_STORE_NAME=Your store name
SHOPMIND_STORE_PHONE=Your store phone
SHOPMIND_STORE_EMAIL=Your store email
SHOPMIND_STORE_ADDRESS=Your store address
SHOPMIND_GSTIN=Your GSTIN
SHOPMIND_GST_RATE=0
```

GST rate is a percentage and defaults to 0. Add the store's actual contact details and GSTIN before issuing customer-facing invoices; no contact or GST information is fabricated by the app.

## Run and verify

Apply the migration in the Supabase Dashboard → SQL Editor if it has not been applied in the active project. Restart Flask from this checkout's `backend` folder so it registers invoice history and PDF routes. The React Sales Desk links to **Full history**. Search customer or invoice, set filters, and use View, Download PDF, or Print. The view's print stylesheet hides application navigation and controls.

Validation performed for this change: Python syntax compilation, Vite production build, targeted ESLint for the changed React files, PDF generation/rendering at A4 with the embedded logo and multi-page items, and live Supabase/Flask smoke checks. The authenticated API checks returned 200 for history, customer-name search, existing invoice detail, and PDF; a missing invoice returned 404; no-token access returned 401; a simulated database outage returned 503. A checkout request was exercised inside a forced rollback and confirmed no invoice or stock changes persisted. Supabase still contains the same two existing invoices. No synthetic invoice was inserted into the live store.
