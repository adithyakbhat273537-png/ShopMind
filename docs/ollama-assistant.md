# ShopMind AI Assistant (Ollama)

The Owner and Sales workspaces include a general AI chat assistant. Chat requests go to Flask, which checks the signed-in role and reads live catalogue, inventory, rack, invoice, sales, and stock-movement data from Supabase before calling Ollama. Owners receive store-wide metrics; Sales staff receive their own sales totals plus shared catalogue and inventory information. React never connects to the model service directly.

## Local Ollama

1. Install and start Ollama on the computer that runs Flask.
2. Download a model in Ollama (for example, `llama3.2`).
3. Set these values in `backend/.env`:

```dotenv
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2
OLLAMA_API_KEY=
```

4. Restart Flask, sign in as the Owner or approved Sales user, and open **AI Assistant**.

## Use your Ollama runtime in Google Colab

Your Colab runtime must be running Ollama and expose its API through the included authenticated gateway. Install the tunnel helper with `!pip -q install pyngrok`, upload `colab/shopmind_ollama_proxy.py` to `/content/shopmind_ollama_proxy.py`, then run a cell like this (replace the model tag with one you actually pulled):

```python
import os, subprocess, sys, time
from getpass import getpass
from pyngrok import ngrok

# Your existing notebook should already have installed Ollama and pulled a model.
# Start Ollama only if your existing setup does not already have it running.
subprocess.Popen(["ollama", "serve"])
time.sleep(3)

os.environ["SHOPMIND_OLLAMA_TOKEN"] = getpass("Create a long ShopMind gateway secret: ")
subprocess.Popen([sys.executable, "/content/shopmind_ollama_proxy.py"])
ngrok.set_auth_token(getpass("Your ngrok auth token: "))
tunnel = ngrok.connect(8000, "http")
print("ShopMind Ollama URL:", tunnel.public_url)
```

Install `pyngrok` in Colab if it is missing. Keep the runtime and tunnel running while ShopMind uses the assistant. In `backend/.env`, set `OLLAMA_BASE_URL` to the printed HTTPS URL, `OLLAMA_MODEL` to your pulled model tag, and `OLLAMA_API_KEY` to the same ShopMind gateway secret. Restart Flask. Do not put either secret in React, `VITE_*` settings, or a committed notebook.

The gateway only permits authenticated `GET /api/tags` and `POST /api/chat`, and forwards them to Ollama running on the same Colab machine. If your existing notebook uses a different model API instead of Ollama, it needs an adapter that exposes this Ollama-compatible request format. The Flask connection status reports whether the service and configured model are available.

## Troubleshooting

- **AI offline:** start Ollama or the Colab runtime and verify the base URL in `backend/.env`.
- **Model unavailable:** set `OLLAMA_MODEL` to an installed tag shown by Ollama, including its suffix if needed.
- **Colab URL changed:** update `OLLAMA_BASE_URL` with the current HTTPS gateway address and restart Flask.
- **Catalogue unavailable:** verify `SUPABASE_DB_URL` and `http://127.0.0.1:5000/api/health`.

The retired VisionRack SQL migration is archived at `database/archive/retired_0012_visionrack.sql` and is not part of the active migration sequence. If it was already applied to your Supabase project, its old tables and stored images are left untouched; the ShopMind application no longer exposes or uses them.
