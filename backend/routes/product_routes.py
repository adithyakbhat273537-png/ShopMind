"""Catalogue read APIs backed by Supabase PostgreSQL."""
from flask import Blueprint, g, jsonify, request

from database.db import get_db_connection
from utils.auth import require_user

product_bp = Blueprint("product", __name__)


@product_bp.get("/categories")
def get_categories():
    try:
        with get_db_connection() as connection, connection.cursor() as cursor:
            cursor.execute("select category_id, category_name from public.categories order by category_name")
            return jsonify(categories=cursor.fetchall()), 200
    except Exception:
        return jsonify(message="Unable to retrieve categories"), 503


@product_bp.post("/categories")
@require_user("admin")
def create_category():
    data = request.get_json(silent=True) or {}
    name = str(data.get("category_name") or "").strip()
    description = str(data.get("description") or "").strip() or None
    if not name or len(name) > 100:
        return jsonify(message="Category name is required and must be under 100 characters"), 400
    try:
        with get_db_connection() as connection, connection.cursor() as cursor:
            cursor.execute("insert into public.categories (category_name, description) values (%s,%s) returning category_id, category_name", (name, description))
            category = cursor.fetchone()
        return jsonify(category=category), 201
    except Exception as error:
        if "unique" in str(error).lower():
            return jsonify(message="That category already exists"), 409
        return jsonify(message="Unable to create category"), 503


@product_bp.get("/products")
def get_products():
    search = request.args.get("search", "").strip()[:120]
    category = request.args.get("category", type=int)
    try:
        with get_db_connection() as connection, connection.cursor() as cursor:
            query = """select p.product_id, p.product_name, p.sku, p.category_id, c.category_name,
                              p.brand, p.description, p.price, p.stock_quantity, p.reorder_level,
                              p.rack_number, p.shelf_number, p.image_url, p.size, p.unit_of_measure
                       from public.products p left join public.categories c using(category_id)
                       where (coalesce(%s::text, '') = '' or p.product_name ilike %s::text or p.sku ilike %s::text or coalesce(p.brand,'') ilike %s::text
                              or coalesce(p.description,'') ilike %s or coalesce(p.size,'') ilike %s)
                         and (%s::bigint is null or p.category_id = %s::bigint)
                       order by p.product_name limit 200"""
            pattern = f"%{search}%"
            cursor.execute(query, (search, pattern, pattern, pattern, pattern, pattern, category, category))
            products = cursor.fetchall()
        return jsonify(status="success", products=products), 200
    except Exception as error:
        print("Product API error:", type(error).__name__)
        return jsonify(status="error", message="Unable to retrieve products"), 503


def _validated_product(data, require_size=False):
    required = ("product_name", "sku", "price")
    if not isinstance(data, dict) or any(data.get(key) in (None, "") for key in required):
        return None, "Product name, SKU, and price are required"
    try:
        price = float(data["price"])
        stock = int(data.get("stock_quantity", 0))
        reorder = int(data.get("reorder_level", 0))
        category_id = int(data["category_id"]) if data.get("category_id") else None
        purchase_price = float(data["purchase_price"]) if data.get("purchase_price") not in (None, "") else None
        if price < 0 or stock < 0 or reorder < 0 or (purchase_price is not None and purchase_price < 0):
            raise ValueError
    except (TypeError, ValueError):
        return None, "Prices and quantities must be valid non-negative numbers"
    fields = {key: (str(data.get(key) or "").strip() or None) for key in ("product_name", "sku", "brand", "description", "barcode", "rack_number", "shelf_number", "image_url", "size")}
    unit = str(data.get("unit_of_measure") or "piece").strip().lower()
    allowed_units = {"piece", "unit", "pack", "packet", "box", "pair", "set", "dozen", "bundle", "kg", "g", "litre", "ml", "metre", "m", "cm", "mm", "inch", "foot", "yard", "roll"}
    if require_size and not fields["size"]:
        return None, "Size or product specification is required when adding an item"
    if fields["size"] and len(fields["size"]) > 100:
        return None, "Size or specification must be under 100 characters"
    if unit not in allowed_units:
        return None, "Choose a valid stock unit"
    if len(fields["product_name"] or "") > 180 or len(fields["sku"] or "") > 80:
        return None, "Product name or SKU is too long"
    return {**fields, "unit_of_measure": unit, "category_id": category_id, "price": price, "purchase_price": purchase_price, "stock_quantity": stock, "reorder_level": reorder}, None


@product_bp.post("/products")
@require_user("admin")
def create_product():
    product, error = _validated_product(request.get_json(silent=True), require_size=True)
    if error:
        return jsonify(message=error), 400
    columns = list(product)
    try:
        with get_db_connection() as connection, connection.cursor() as cursor:
            cursor.execute(f"insert into public.products ({', '.join(columns)}) values ({', '.join(['%s'] * len(columns))}) returning product_id", tuple(product[c] for c in columns))
            product_id = cursor.fetchone()["product_id"]
        return jsonify(message="Product created", product_id=product_id), 201
    except Exception as error:
        if "unique" in str(error).lower():
            return jsonify(message="SKU or barcode is already in use"), 409
        return jsonify(message="Unable to create product"), 503


@product_bp.patch("/products/<int:product_id>")
@require_user("admin")
def update_product(product_id):
    product, error = _validated_product(request.get_json(silent=True))
    if error:
        return jsonify(message=error), 400
    columns = list(product)
    try:
        with get_db_connection() as connection, connection.cursor() as cursor:
            cursor.execute("select unit_of_measure, stock_quantity from public.products where product_id = %s for update", (product_id,))
            current = cursor.fetchone()
            if not current:
                return jsonify(message="Product not found"), 404
            if (current["unit_of_measure"] != product["unit_of_measure"] and current["stock_quantity"] > 0
                    and current["stock_quantity"] == product["stock_quantity"]):
                return jsonify(message="Changing the stock unit changes what the current quantity means. Recount the inventory and enter its quantity in the new unit before saving."), 409
            cursor.execute(f"update public.products set {', '.join(f'{c} = %s' for c in columns)}, updated_at = now() where product_id = %s", tuple(product[c] for c in columns) + (product_id,))
            if cursor.rowcount == 0:
                return jsonify(message="Product not found"), 404
        return jsonify(message="Product updated"), 200
    except Exception:
        return jsonify(message="Unable to update product"), 503


@product_bp.delete("/products/<int:product_id>")
@require_user("admin")
def delete_product(product_id):
    try:
        with get_db_connection() as connection, connection.cursor() as cursor:
            cursor.execute("delete from public.products where product_id = %s", (product_id,))
            if cursor.rowcount == 0:
                return jsonify(message="Product not found"), 404
        return jsonify(message="Product deleted"), 200
    except Exception:
        return jsonify(message="Unable to delete product"), 503


@product_bp.post("/products/<int:product_id>/stock-movements")
@require_user("admin", "staff")
def create_stock_movement(product_id):
    data = request.get_json(silent=True) or {}
    movement_type = data.get("movement_type")
    note = str(data.get("note") or "").strip()[:500] or None
    try:
        quantity = int(data.get("quantity"))
    except (TypeError, ValueError):
        return jsonify(message="Quantity must be a positive whole number"), 400
    if movement_type not in ("stock_in", "stock_out", "adjustment") or quantity <= 0:
        return jsonify(message="Choose stock_in, stock_out, or adjustment and enter a positive quantity"), 400
    size = str(data.get("size") or "").strip() or None
    unit = str(data.get("unit_of_measure") or "piece").strip().lower()
    allowed_units = {"piece", "unit", "pack", "packet", "box", "pair", "set", "dozen", "bundle", "kg", "g", "litre", "ml", "metre", "m", "cm", "mm", "inch", "foot", "yard", "roll"}
    if movement_type == "stock_in" and not size:
        return jsonify(message="Enter the size or specification for incoming stock"), 400
    if size and len(size) > 100:
        return jsonify(message="Size or specification must be under 100 characters"), 400
    if unit not in allowed_units:
        return jsonify(message="Choose a valid stock unit"), 400
    try:
        with get_db_connection() as connection, connection.cursor() as cursor:
            cursor.execute("select stock_quantity,size,unit_of_measure from public.products where product_id = %s for update", (product_id,))
            row = cursor.fetchone()
            if not row:
                return jsonify(message="Product not found"), 404
            if unit != row["unit_of_measure"]:
                return jsonify(message="Stock movements must use the product’s current unit. Edit the product and recount its total stock to change units safely."), 409
            previous = row["stock_quantity"]
            new = previous + quantity if movement_type == "stock_in" else previous - quantity if movement_type == "stock_out" else quantity
            if new < 0:
                return jsonify(message="Stock cannot be reduced below zero"), 409
            updated_size = size or row["size"]
            cursor.execute("update public.products set stock_quantity = %s, size = %s, unit_of_measure = %s, updated_at = now() where product_id = %s", (new, updated_size, unit, product_id))
            cursor.execute("insert into public.stock_movements (product_id, changed_by, movement_type, quantity, previous_quantity, new_quantity, unit_of_measure, note) values (%s,%s,%s,%s,%s,%s,%s,%s) returning movement_id", (product_id, g.user_id, movement_type, quantity, previous, new, unit, note))
            movement_id = cursor.fetchone()["movement_id"]
        return jsonify(message="Stock updated", movement_id=movement_id, previous_quantity=previous, new_quantity=new), 201
    except Exception:
        return jsonify(message="Unable to record stock movement"), 503


@product_bp.get("/products/<int:product_id>/stock-movements")
@require_user("admin", "staff")
def get_stock_movements(product_id):
    try:
        with get_db_connection() as connection, connection.cursor() as cursor:
            cursor.execute("select movement_id, movement_type, quantity, previous_quantity, new_quantity, unit_of_measure, note, created_at from public.stock_movements where product_id = %s order by created_at desc limit 100", (product_id,))
            return jsonify(movements=cursor.fetchall()), 200
    except Exception:
        return jsonify(message="Unable to retrieve stock history"), 503
