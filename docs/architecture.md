# ShopMind architecture

```text
React + Vite browser → Flask business API → Supabase PostgreSQL
                                  └──────→ Supabase Auth token verification
                                  └──────→ Supabase Storage (catalogue media)
                                  └──────→ Ollama chat API (local or secured HTTPS Colab gateway)
```

The browser never receives a PostgreSQL connection string or Supabase service key. It sends the Supabase Auth access token to Flask. Flask verifies that token with Supabase Auth, loads the user's role from `public.profiles`, and enforces the role for each business endpoint. Flask accesses PostgreSQL over TLS with the server-only URI in `backend/.env`.

The ShopMind AI Assistant is called through Flask only. Flask verifies the signed-in user's ShopMind role, reads relevant product, price, stock, and rack data from Supabase, and supplies that context to Ollama. The browser never calls Ollama directly and no database credentials are sent to the model. Ollama can run locally or behind a secured HTTPS gateway for a Colab runtime; do not publish an unauthenticated Ollama endpoint.

Database changes live in `database/migrations` and are additive where existing store records need to survive. Apply outstanding SQL migrations in order in the Supabase SQL Editor. The invoice history enhancement is `0011_invoice_history.sql`; it backfills invoice display snapshots from the saved order and order-item records without deleting records. Existing payment methods/statuses were not stored, so old invoices are marked `unknown`; newly completed bills save the selected method and `paid` status.

Product measurements are stored in `products.size` as a human-readable specification (for example, pipe diameter/length or electrical wattage/voltage). `products.unit_of_measure` is the quantity unit used for inventory and sales (for example, grams for nails or metres for wire). Migrations `0014`–`0016` expand allowed units and snapshot the unit on stock movements and billed order items. A unit change with existing stock requires an explicit recount so quantities are never silently reinterpreted.

Invoice creation is one PostgreSQL transaction: product rows are locked, totals are computed on the server, stock and stock movement are written, and the order, invoice, and item snapshots commit together. `request_id` makes a retried checkout idempotent. The invoice PDF and detail view read saved invoice/order values, never current catalogue prices.

Run Flask from `backend` with `python -m flask --app app run --host 127.0.0.1 --port 5000`, then start Vite from `frontend` with `npm run dev`. See [invoice history](invoice-history.md) and [the Ollama assistant guide](ollama-assistant.md) for setup details.
