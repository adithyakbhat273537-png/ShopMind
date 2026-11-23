"""ShopMind Flask API entry point."""
import os

from dotenv import load_dotenv
from flask import Flask, jsonify
from flask_cors import CORS

from database.db import check_database
from routes.product_routes import product_bp
from routes.sales_routes import sales_bp
from routes.assistant_routes import assistant_bp

load_dotenv()


def create_app():
    app = Flask(__name__)
    allowed_origins = [
        origin.strip()
        for origin in os.getenv("FRONTEND_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174").split(",")
        if origin.strip()
    ]
    CORS(app, resources={r"/api/*": {"origins": allowed_origins}})
    app.register_blueprint(product_bp, url_prefix="/api")
    app.register_blueprint(sales_bp, url_prefix="/api")
    app.register_blueprint(assistant_bp, url_prefix="/api")

    @app.get("/")
    def home():
        return jsonify(project="ShopMind", status="ok", message="Flask API is running")

    @app.get("/api/health")
    def health():
        database = check_database()
        status_code = 200 if database["configured"] and database["connected"] else 503
        status = "ok" if status_code == 200 else "degraded"
        return jsonify(status=status, api="ok", database=database), status_code

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.getenv("PORT", "5000")), debug=os.getenv("FLASK_DEBUG", "false").lower() == "true")
