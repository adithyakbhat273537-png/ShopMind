"""Staff billing and owner sales summary APIs."""
from flask import Blueprint, g, jsonify, request, send_file
from io import BytesIO
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from datetime import date
import os
import re
from database.db import get_db_connection
from utils.auth import require_user
from utils.invoice_pdf import create_invoice_pdf
from uuid import UUID

sales_bp = Blueprint("sales", __name__)


PAYMENT_METHODS = {"cash", "upi", "card", "bank_transfer", "other"}


def _invoice_query(cur, invoice_id):
    cur.execute("""
        select i.invoice_id, i.invoice_number, i.order_id, i.issued_at,
               coalesce(i.customer_name, o.customer_name) as customer_name,
               coalesce(i.customer_mobile, o.customer_mobile) as customer_mobile,
               coalesce(i.customer_email, o.customer_email) as customer_email,
               coalesce(i.subtotal, o.subtotal) as subtotal,
               coalesce(i.tax_amount, o.tax_amount) as tax_amount,
               coalesce(i.discount_amount, o.discount_amount, 0) as discount_amount,
               coalesce(i.total, o.total) as total,
               coalesce(i.payment_method, o.payment_method, 'unspecified') as payment_method,
               i.payment_status, o.order_number, o.created_at
        from public.invoices i join public.orders o using (order_id)
        where i.invoice_id = %s
    """, (invoice_id,))
    return cur.fetchone()


def _invoice_items(cur, order_id):
    cur.execute("""
        select order_item_id, product_id, product_name, sku, unit_price, quantity, unit_of_measure, line_total
        from public.order_items where order_id = %s order by order_item_id
    """, (order_id,))
    return cur.fetchall()


def _pdf_response(invoice_row, items):
    pdf = create_invoice_pdf(invoice_row, items, invoice_row)
    safe_number = re.sub(r"[^A-Za-z0-9_-]", "_", invoice_row["invoice_number"])
    return send_file(BytesIO(pdf), mimetype="application/pdf", as_attachment=True,
                     download_name=f"ShopMind-{safe_number}.pdf", max_age=0, conditional=False)


@sales_bp.post("/sales")
@require_user("admin", "staff")
def create_sale():
    data=request.get_json(silent=True) or {}
    name=str(data.get("customer_name") or "").strip()[:160]
    mobile=str(data.get("customer_mobile") or "").strip()[:32]
    email=str(data.get("customer_email") or "").strip()[:254] or None
    items=data.get("items")
    if not name or not mobile or not isinstance(items,list) or not items:
        return jsonify(message="Customer name, mobile, and at least one item are required"),400
    request_id = data.get("request_id")
    if request_id:
        try:
            request_id = str(UUID(str(request_id)))
        except (TypeError, ValueError):
            return jsonify(message="Invalid sale request ID"), 400
    payment_method = str(data.get("payment_method") or "unspecified").strip().lower()
    if payment_method not in PAYMENT_METHODS | {"unspecified"}:
        return jsonify(message="Choose a valid payment method"), 400
    try:
        with get_db_connection() as conn, conn.cursor() as cur:
            if request_id:
                cur.execute("select pg_advisory_xact_lock(hashtextextended(%s, 0))", (request_id,))
                cur.execute("select order_id from public.orders where request_id = %s", (request_id,))
                prior = cur.fetchone()
                if prior:
                    cur.execute("select * from public.orders where order_id = %s", (prior["order_id"],))
                    order = cur.fetchone()
                    cur.execute("select i.invoice_id,i.invoice_number,i.issued_at,i.payment_status,i.payment_method from public.invoices i where i.order_id = %s", (order["order_id"],))
                    invoice = cur.fetchone()
                    saved_items = _invoice_items(cur, order["order_id"])
                    return jsonify(order=order, invoice=invoice, subtotal=float(order["subtotal"]),
                                   tax=float(order["tax_amount"]), total=float(order["total"]), items=saved_items,
                                   idempotent_replay=True), 200
            requested = {}
            for item in items:
                pid=int(item.get("product_id")); qty=int(item.get("quantity"))
                if qty<1: raise ValueError
                requested[pid] = requested.get(pid, 0) + qty
            validated=[]; subtotal=Decimal("0.00")
            for pid, qty in sorted(requested.items()):
                cur.execute("select product_id,product_name,sku,price,stock_quantity,unit_of_measure from public.products where product_id=%s for update",(pid,))
                p=cur.fetchone()
                if not p: return jsonify(message=f"Product {pid} not found"),404
                if p["stock_quantity"]<qty: return jsonify(message=f"Insufficient stock for {p['product_name']}"),409
                line=(Decimal(str(p["price"]))*qty).quantize(Decimal("0.01"),rounding=ROUND_HALF_UP)
                subtotal+=line;validated.append((p,qty,line))
            try:
                discount=Decimal(str(data.get("discount_amount", 0) or 0)).quantize(Decimal("0.01"),rounding=ROUND_HALF_UP)
            except (InvalidOperation, TypeError):
                return jsonify(message="Discount must be a valid amount"),400
            if discount < 0 or discount > subtotal:
                return jsonify(message="Discount must be between zero and the subtotal"),400
            try:
                tax_rate=Decimal(os.getenv("SHOPMIND_GST_RATE", "0"))
            except (InvalidOperation, TypeError, ValueError):
                tax_rate=Decimal("0")
            if not tax_rate.is_finite() or tax_rate < 0 or tax_rate > 100:
                tax_rate=Decimal("0")
            taxable=(subtotal-discount).quantize(Decimal("0.01"),rounding=ROUND_HALF_UP)
            tax=(taxable*tax_rate/Decimal("100")).quantize(Decimal("0.01"),rounding=ROUND_HALF_UP)
            total=(taxable+tax).quantize(Decimal("0.01"),rounding=ROUND_HALF_UP)
            cur.execute("""insert into public.orders
                (customer_name,customer_mobile,customer_email,created_by,subtotal,tax_amount,
                 discount_amount,total,payment_method,request_id)
                values(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                returning order_id,order_number,created_at,subtotal,tax_amount,discount_amount,total,payment_method""",
                (name,mobile,email,g.user_id,subtotal,tax,discount,total,payment_method,None if request_id == "" else request_id))
            order=cur.fetchone()
            for p,qty,line in validated:
                cur.execute("insert into public.order_items(order_id,product_id,product_name,sku,unit_price,quantity,unit_of_measure,line_total) values(%s,%s,%s,%s,%s,%s,%s,%s)",(order["order_id"],p["product_id"],p["product_name"],p["sku"],p["price"],qty,p["unit_of_measure"],line))
                new=p["stock_quantity"]-qty
                cur.execute("update public.products set stock_quantity=%s,updated_at=now() where product_id=%s",(new,p["product_id"]))
                cur.execute("insert into public.stock_movements(product_id,changed_by,movement_type,quantity,previous_quantity,new_quantity,unit_of_measure,note) values(%s,%s,'stock_out',%s,%s,%s,%s,%s)",(p["product_id"],g.user_id,qty,p["stock_quantity"],new,p["unit_of_measure"],f"Sale {order['order_number']}"))
            cur.execute("""insert into public.invoices
                (order_id,issued_by,customer_name,customer_mobile,customer_email,subtotal,tax_amount,
                 discount_amount,total,payment_method,payment_status)
                values(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'paid') returning invoice_id,invoice_number,issued_at,payment_status,payment_method""",
                (order["order_id"],g.user_id,name,mobile,email,subtotal,tax,discount,total,payment_method))
            invoice=cur.fetchone()
        return jsonify(order=order,invoice=invoice,subtotal=float(subtotal),tax=float(tax),discount=float(discount),total=float(total),items=[{"product_id":p["product_id"],"product_name":p["product_name"],"sku":p["sku"],"unit_price":float(p["price"]),"quantity":qty,"unit_of_measure":p["unit_of_measure"],"line_total":float(line)} for p,qty,line in validated],idempotent_replay=False),201
    except (TypeError,ValueError): return jsonify(message="Each product needs a valid ID and positive quantity"),400
    except Exception: return jsonify(message="Unable to create bill"),503


@sales_bp.get("/sales/lookup")
@require_user("admin", "staff")
def lookup_sale():
    term=request.args.get("term","").strip()[:254]
    if not term:return jsonify(message="Enter a mobile number, order ID, order number, or invoice number"),400
    try:
        with get_db_connection() as conn, conn.cursor() as cur:
            cur.execute("select o.*,i.invoice_id,i.invoice_number,i.issued_at,i.payment_status from public.orders o left join public.invoices i using(order_id) where o.customer_mobile ilike %s or o.customer_name ilike %s or o.order_number ilike %s or i.invoice_number ilike %s or cast(o.order_id as text)=%s order by o.created_at desc limit 30",(f"%{term}%",f"%{term}%",f"%{term}%",f"%{term}%",term))
            orders=cur.fetchall()
            ids=[o["order_id"] for o in orders]
            if ids:
                cur.execute("select * from public.order_items where order_id = any(%s) order by order_item_id",(ids,));items=cur.fetchall()
            else: items=[]
        for order in orders: order["items"]=[i for i in items if i["order_id"]==order["order_id"]]
        return jsonify(orders=orders),200
    except Exception:return jsonify(message="Unable to look up bills"),503


@sales_bp.get("/sales/recent")
@require_user("admin", "staff")
def recent_sales():
    """Give the Sales Desk a visible invoice count and recent bills on first load."""
    try:
        with get_db_connection() as conn, conn.cursor() as cur:
            cur.execute("select count(*)::int as invoice_count from public.invoices")
            invoice_count = cur.fetchone()["invoice_count"]
            cur.execute("""
                select i.invoice_id, i.order_id, o.order_number,
                       coalesce(i.customer_name,o.customer_name) customer_name,
                       coalesce(i.customer_mobile,o.customer_mobile) customer_mobile,
                       coalesce(i.customer_email,o.customer_email) customer_email,
                       o.created_at, coalesce(i.total,o.total) total,
                       i.invoice_number, i.issued_at, i.payment_status
                from public.orders o join public.invoices i using(order_id)
                order by i.issued_at desc, i.invoice_id desc limit 10
            """)
            invoices = cur.fetchall()
        return jsonify(invoice_count=invoice_count, invoices=invoices), 200
    except Exception:
        return jsonify(message="Unable to load recent invoices"), 503


@sales_bp.get("/sales/invoices")
@require_user("admin", "staff")
def invoice_history():
    """Query persistent invoice rows with search, filtering, stable sorting and paging."""
    try:
        page=max(1, min(int(request.args.get("page", 1)), 100000))
        per_page=max(1, min(int(request.args.get("per_page", 20)), 100))
    except (TypeError, ValueError):
        return jsonify(message="Page and page size must be whole numbers"),400
    q=request.args.get("q", "").strip()[:120]
    status=request.args.get("status", "all").strip().lower()
    if status not in {"all", "paid", "unpaid", "partial", "refunded", "void", "unknown"}:
        return jsonify(message="Invalid payment status filter"),400
    start=request.args.get("from", "").strip()
    end=request.args.get("to", "").strip()
    try:
        if start: date.fromisoformat(start)
        if end: date.fromisoformat(end)
    except ValueError:
        return jsonify(message="Date filters must use YYYY-MM-DD"),400
    sort="asc" if request.args.get("sort", "newest").lower()=="oldest" else "desc"
    conditions=[]; values=[]
    if q:
        conditions.append("(i.invoice_number ilike %s or o.customer_name ilike %s or o.customer_mobile ilike %s or o.order_number ilike %s or cast(o.order_id as text)=%s)")
        pattern=f"%{q}%"; values.extend([pattern,pattern,pattern,pattern,q])
    if status != "all":
        conditions.append("i.payment_status = %s"); values.append(status)
    if start:
        conditions.append("i.issued_at >= %s::date"); values.append(start)
    if end:
        conditions.append("i.issued_at < (%s::date + interval '1 day')"); values.append(end)
    where=" where "+" and ".join(conditions) if conditions else ""
    try:
        with get_db_connection() as conn, conn.cursor() as cur:
            cur.execute("select count(*)::int as count,coalesce(sum(i.total),0)::numeric(14,2) as billed from public.invoices i join public.orders o using(order_id)")
            summary=cur.fetchone()
            cur.execute("select count(*)::int as count from public.invoices i join public.orders o using(order_id)"+where, values)
            total_count=cur.fetchone()["count"]
            cur.execute("""select i.invoice_id,i.invoice_number,i.order_id,o.order_number,
                       coalesce(i.customer_name,o.customer_name) customer_name,
                       coalesce(i.customer_mobile,o.customer_mobile) customer_mobile,
                       coalesce(i.customer_email,o.customer_email) customer_email,
                       coalesce(i.subtotal,o.subtotal) subtotal,coalesce(i.tax_amount,o.tax_amount) tax_amount,
                       coalesce(i.discount_amount,o.discount_amount,0) discount_amount,
                       coalesce(i.total,o.total) total,
                       coalesce(i.payment_method,o.payment_method,'unspecified') payment_method,
                       i.payment_status,i.issued_at,o.created_at
                from public.invoices i join public.orders o using(order_id)"""+where+
                f" order by i.issued_at {sort},i.invoice_id {sort} limit %s offset %s",
                values+[per_page,(page-1)*per_page])
            invoices=cur.fetchall()
        return jsonify(invoices=invoices,page=page,per_page=per_page,total_count=total_count,
                       total_pages=(total_count+per_page-1)//per_page,
                       summary={"invoice_count":summary["count"],"billed_total":summary["billed"]}),200
    except Exception as error:
        print("Invoice history error:",type(error).__name__,str(error)[:300])
        return jsonify(message="Unable to retrieve invoice history. Confirm migration 0011_invoice_history.sql has been applied."),503


@sales_bp.get("/sales/invoices/<int:invoice_id>")
@require_user("admin", "staff")
def invoice_detail(invoice_id):
    try:
        with get_db_connection() as conn, conn.cursor() as cur:
            invoice=_invoice_query(cur,invoice_id)
            if not invoice: return jsonify(message="Invoice not found"),404
            items=_invoice_items(cur,invoice["order_id"])
        return jsonify(invoice=invoice,items=items),200
    except Exception as error:
        print("Invoice detail error:",type(error).__name__,str(error)[:300])
        return jsonify(message="Unable to retrieve invoice details"),503


@sales_bp.get("/sales/invoices/<int:invoice_id>/pdf")
@require_user("admin", "staff")
def download_invoice_by_id(invoice_id):
    try:
        with get_db_connection() as conn, conn.cursor() as cur:
            invoice=_invoice_query(cur,invoice_id)
            if not invoice: return jsonify(message="Invoice not found"),404
            items=_invoice_items(cur,invoice["order_id"])
        return _pdf_response(invoice,items)
    except Exception as error:
        print("Invoice PDF error:",type(error).__name__,str(error)[:300])
        return jsonify(message="Unable to generate invoice PDF"),503


@sales_bp.get("/sales/<int:order_id>/invoice.pdf")
@require_user("admin", "staff")
def download_invoice(order_id):
    """Download a sale's invoice as a PDF for authenticated store staff."""
    try:
        with get_db_connection() as conn, conn.cursor() as cur:
            cur.execute("select invoice_id from public.invoices where order_id = %s", (order_id,))
            invoice_id=cur.fetchone()
            if not invoice_id:
                return jsonify(message="Invoice not found"), 404
            invoice_row=_invoice_query(cur,invoice_id["invoice_id"])
            items=_invoice_items(cur,order_id)
        return _pdf_response(invoice_row,items)
    except Exception as error:
        # Keep database details in the local Flask terminal for diagnosis; never send
        # connection or query details back to the browser.
        print("Invoice PDF error:", type(error).__name__, str(error)[:300])
        return jsonify(message="Unable to generate invoice PDF"), 503


@sales_bp.get("/owner/summary")
@require_user("admin")
def owner_summary():
    try:
        with get_db_connection() as conn, conn.cursor() as cur:
            cur.execute("select count(*)::int as order_count,coalesce(sum(total),0)::numeric(12,2) as sales_total from public.orders where order_status='completed' and created_at::date=current_date")
            today=cur.fetchone()
            cur.execute("select count(*)::int as product_count,coalesce(sum(stock_quantity),0)::bigint as units_in_stock,count(*) filter(where stock_quantity<=reorder_level)::int as low_stock from public.products")
            inventory=cur.fetchone()
            cur.execute("select rack_number,count(*)::int as product_count,coalesce(sum(stock_quantity),0)::bigint as units from public.products where rack_number is not null group by rack_number order by rack_number")
            racks=cur.fetchall()
        return jsonify(today=today,inventory=inventory,racks=racks),200
    except Exception:return jsonify(message="Unable to load owner summary"),503


@sales_bp.get("/owner/users")
@require_user("admin")
def owner_users():
    """List staff and access requests. Never return admin accounts here."""
    try:
        with get_db_connection() as conn, conn.cursor() as cur:
            cur.execute("""
                select p.id, p.full_name, u.email, p.role, p.requested_workspace, p.created_at
                from public.profiles p
                join auth.users u on u.id = p.id
                where p.role in ('staff', 'pending')
                order by case when p.role = 'pending' then 0 else 1 end, p.created_at desc
            """)
            users = cur.fetchall()
        return jsonify(users=users), 200
    except Exception:
        return jsonify(message="Unable to load staff access requests. Apply migration 0008 first."), 503


@sales_bp.patch("/owner/users/<user_id>/role")
@require_user("admin")
def set_staff_role(user_id):
    """Owners may approve or revoke Sales access, but this endpoint cannot grant admin."""
    data = request.get_json(silent=True) or {}
    role = data.get("role")
    if role not in ("staff", "pending"):
        return jsonify(message="Role must be staff or pending"), 400
    try:
        parsed_user_id = str(UUID(user_id))
        with get_db_connection() as conn, conn.cursor() as cur:
            cur.execute("""
                update public.profiles
                set role = %s, updated_at = now()
                where id = %s and role in ('staff', 'pending')
                returning id, full_name, role
            """, (role, parsed_user_id))
            user = cur.fetchone()
        if not user:
            return jsonify(message="Staff account not found"), 404
        return jsonify(user=user), 200
    except ValueError:
        return jsonify(message="Invalid user ID"), 400
    except Exception:
        return jsonify(message="Unable to update staff access"), 503
