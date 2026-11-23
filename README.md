# ShopMind — setup

ShopMind uses React + Vite for the browser interface, Flask for business logic and API endpoints, and Supabase PostgreSQL for persistent data. Supabase Auth verifies sign-ins; Flask checks each user's saved profile role before serving sales and owner APIs. The browser communicates with Flask and never receives the database URL or service-role key. Existing MySQL source files remain for migration reference.

## Folder map

```text
ShopMind/
├── frontend/                 React + Vite application
│   ├── src/                  Screens, styles, and browser entry point
│   └── .env.example          Public API base URL only
├── backend/                  Flask API
│   ├── app.py                App factory and health endpoint
│   ├── database/db.py        Secure Supabase PostgreSQL connection
│   ├── routes/ models/        Existing implementation retained for migration
│   ├── requirements.txt      Python dependencies
│   └── .env.example          Backend-only connection settings
├── database/migrations/      Supabase schema migrations
└── docs/                     Architecture, setup, and invoice workflow
```

## Install on Windows 11 (PowerShell)

Install Python 3.11+, Node.js 20+, and Git. Create a Supabase project at [supabase.com/dashboard](https://supabase.com/dashboard), choose a strong database password, and wait for the project to finish provisioning. From the project dashboard, open **Connect** or **Project Settings → Database** and copy a PostgreSQL connection URI. Use the session pooler URI if your network cannot reach the direct database host. URL-encode special characters in the password.

```powershell
cd C:\Users\user\Desktop\ShopMind
Copy-Item backend\.env.example backend\.env
notepad backend\.env
cd backend
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
flask --app app run --host 127.0.0.1 --port 5000
```

Set `SUPABASE_DB_URL` in `backend\.env`; never put it in a `VITE_*` variable or commit it. In a second PowerShell window:

```powershell
cd C:\Users\user\Desktop\ShopMind\frontend
Copy-Item .env.example .env.local
npm install
npm run dev
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). Verify the backend at `http://127.0.0.1:5000/api/health`; it should return HTTP 200 with `database.connected: true`. Without credentials or network access, the API returns 503 and safe configuration status. Never paste database credentials into chat.

Before using invoices on a fresh database, apply outstanding files under `database/migrations` in order in the Supabase SQL Editor. In particular, apply `0011_invoice_history.sql` for the persistent Invoice History screen, payment details, safe bill retries, and invoice snapshots. Configure optional invoice store details in `backend\.env` (see `backend\.env.example`). Full history is at `/sales/invoices` after Sales sign-in. Read [the invoice workflow guide](docs/invoice-history.md) for available filters, PDF/print behaviour, and the reason old invoices appeared missing.

Apply `0013_product_size_units.sql` in Supabase before using the updated product or stock forms. It adds optional size/specification and stock-unit fields while preserving existing catalogue rows.

For measurable inventory, also apply `0014_inventory_measurement_units.sql`, `0015_stock_movement_units.sql`, and `0016_order_item_unit_snapshots.sql` in order. These expand stock-count choices (including grams, millimetres, metres, packets, and bundles), preserve units on stock movements, and print the billed unit on invoices. Product specifications such as pipe diameter/length or electrical wattage/voltage are entered in the product's Measurements / rating field. Existing stock values remain unchanged and keep their current unit; recount and update stock when changing a product's unit.

ShopMind AI Assistant uses Ollama through Flask and adds live product catalogue context from Supabase. Install/run Ollama locally and set `OLLAMA_BASE_URL` and `OLLAMA_MODEL` in `backend\.env`, or use the HTTPS endpoint of your secured Colab Ollama gateway. Never expose an unauthenticated model endpoint publicly. Open **AI Assistant** from the Owner or Sales workspace. See [the Ollama assistant guide](docs/ollama-assistant.md) for connection setup.

The previous MySQL settings and modules remain for safe migration planning; they are not deleted. Flask's active product, inventory, authentication, and sales paths use Supabase PostgreSQL.
