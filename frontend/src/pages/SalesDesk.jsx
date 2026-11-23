import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FiArrowLeft, FiArrowUpRight, FiDownload, FiFileText, FiLogOut, FiMapPin, FiPlus, FiPrinter, FiSearch, FiTrash2, FiEye, FiList, FiMessageCircle } from "react-icons/fi";
import { useAuth } from "../context/AuthContext";
import ShopMindLogo from "../components/ShopMindLogo";
import { formatIndiaDateTime } from "../utils/dateTime";
import { formatStockQuantity, stockUnitLabel } from "../utils/stockUnits";
import "./SalesDesk.css";
import "./SalesDeskFeatures.css";

const api = import.meta.env.VITE_API_BASE_URL || "";
const money = value => `₹${Number(value || 0).toFixed(2)}`;

export default function SalesDesk() {
  const { session, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [productSearch, setProductSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState({ customer_name: "", customer_mobile: "", customer_email: "" });
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [discount, setDiscount] = useState("0");
  const [saleRequestId, setSaleRequestId] = useState("");
  const [lookup, setLookup] = useState("");
  const [orders, setOrders] = useState([]);
  const [recentInvoices, setRecentInvoices] = useState([]);
  const [invoiceCount, setInvoiceCount] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [lookupActive, setLookupActive] = useState(false);
  const [message, setMessage] = useState("");
  const [lastInvoice, setLastInvoice] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState("");
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` };

  useEffect(() => {
    fetch(`${api}/api/products`)
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Products unavailable");
        setProducts(data.products || []);
      })
      .catch(() => setError("Could not load products. Check Flask and Supabase."));
  }, []);

  useEffect(() => {
    if (!session?.access_token) return;
    let active = true;
    fetch(`${api}/api/sales/recent`, { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then(async response => {
        const data = await response.json().catch(() => ({ message: `Invoice activity returned HTTP ${response.status}. Restart Flask from this ShopMind project's backend folder.` }));
        if (!response.ok) throw new Error(data.message || "Recent invoices are unavailable");
        if (active) {
          setInvoiceCount(data.invoice_count || 0);
          setRecentInvoices(data.invoices || []);
          setOrders(data.invoices || []);
        }
      })
      .catch(recentError => { if (active) setHistoryError(recentError.message); })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [session?.access_token]);

  useEffect(() => {
    if (params.get("lookup")) document.getElementById("bill-lookup")?.focus();
  }, [params]);

  const visibleProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    if (!term) return products;
    return products.filter(product => [product.product_name, product.sku, product.brand, product.size, product.rack_number, product.shelf_number]
      .some(value => String(value || "").toLowerCase().includes(term)));
  }, [products, productSearch]);

  function add(product) {
    setSaleRequestId("");
    setCart(current => {
      const existing = current.find(item => item.product_id === product.product_id);
      if (Number(existing?.quantity) >= Number(product.stock_quantity)) return current;
      return existing
        ? current.map(item => item.product_id === product.product_id ? { ...item, quantity: Number(item.quantity) + 1 } : item)
        : [...current, { product_id: product.product_id, product_name: product.product_name, price: product.price, stock_quantity: product.stock_quantity, unit_of_measure: product.unit_of_measure || "piece", quantity: 1 }];
    });
  }

  async function downloadInvoice(invoice) {
    setDownloading(String(invoice.order_id));
    setError("");
    try {
      const response = await fetch(`${api}/api/sales/${invoice.order_id}/invoice.pdf`, { headers: { Authorization: `Bearer ${session?.access_token}` } });
      if (!response.ok) {
        const body = await response.text();
        if (response.status === 404) throw new Error("Flask returned 404 for invoice PDFs. Stop Flask and restart it from this ShopMind project's backend folder so it loads the latest invoice route.");
        let detail = "";
        try { detail = JSON.parse(body).message || ""; } catch { detail = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180); }
        throw new Error(detail || `Invoice download failed (HTTP ${response.status}). Restart Flask and confirm the bill exists.`);
      }
      const blob = await response.blob();
      if (blob.type && !blob.type.includes("application/pdf")) throw new Error("The server returned a non-PDF file. Restart Flask and try again.");
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `ShopMind-${invoice.invoice_number || invoice.order_number || invoice.order_id}.pdf`;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      window.setTimeout(() => { URL.revokeObjectURL(url); anchor.remove(); }, 30000);
    } catch (downloadError) {
      setError(downloadError.message);
    } finally {
      setDownloading("");
    }
  }

  async function createBill(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    setLastInvoice(null);
    try {
      const requestId = saleRequestId || crypto.randomUUID();
      setSaleRequestId(requestId);
      const response = await fetch(`${api}/api/sales`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...customer, payment_method: paymentMethod, discount_amount: Number(discount || 0), request_id: requestId, items: cart.map(({ product_id, quantity }) => ({ product_id, quantity: Number(quantity) })) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Bill failed");
      setMessage(`Bill ${data.invoice.invoice_number} created for ${money(data.total)}.`);
      const createdInvoice = { ...data.order, order_id: data.order.order_id, order_number: data.order.order_number, invoice_id: data.invoice.invoice_id, invoice_number: data.invoice.invoice_number, issued_at: data.invoice.issued_at, customer_name: customer.customer_name, customer_mobile: customer.customer_mobile, customer_email: customer.customer_email, payment_method: paymentMethod, payment_status: data.invoice.payment_status || "paid", total: data.total, items: data.items };
      setLastInvoice(createdInvoice);
      setOrders(current => [createdInvoice, ...current].slice(0, 10));
      setRecentInvoices(current => [createdInvoice, ...current].slice(0, 10));
      if (!data.idempotent_replay) setInvoiceCount(count => count + 1);
      setLookupActive(false);
      setCart([]);
      setCustomer({ customer_name: "", customer_mobile: "", customer_email: "" });
      setDiscount("0");
      setSaleRequestId("");
    } catch (billError) {
      setError(billError.message);
    } finally {
      setBusy(false);
    }
  }

  async function findBill(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${api}/api/sales/lookup?term=${encodeURIComponent(lookup)}`, { headers });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Bill search failed");
      setOrders(data.orders || []);
      setLookupActive(true);
      if (!data.orders?.length) setMessage("No bills matched that search.");
    } catch (lookupError) {
      setError(lookupError.message);
    }
  }

  return <main className="sales-page">
    <header><Link className="sales-brand" to="/sales"><ShopMindLogo/><span>SALES DESK</span></Link><div className="sales-header-actions"><Link to="/assistant"><FiMessageCircle/> AI Assistant</Link>{profile?.role === "admin" && <Link to="/owner"><FiArrowLeft/> Owner workspace</Link>}<button onClick={async () => { await signOut(); navigate("/login", { replace: true }); }}><FiLogOut/> Sign out</button></div></header>
    <div className="sales-content">
      <section className="sales-heading"><div><small>COUNTER / BILLING</small><h1>Create a customer bill</h1><p>Find each item’s rack and shelf, then add products and complete the sale.</p></div></section>
      <div className="sales-layout">
      <section className="sales-products"><div className="sales-products-heading"><h2>Find products</h2><Link to="/locator"><FiMapPin/> Open rack map</Link></div><label className="sales-product-search"><FiSearch/><input value={productSearch} onChange={event => setProductSearch(event.target.value)} placeholder="Search name, SKU, rack, or shelf"/></label><div className="sales-product-list">{visibleProducts.map(product => <article key={product.product_id}><div className="sales-product-info"><b>{product.product_name}</b><small>{product.sku} · {formatStockQuantity(product.stock_quantity, product.unit_of_measure)}{product.size ? ` · ${product.size}` : ""}</small><span className="sales-product-location"><FiMapPin/><span><b>{product.rack_number ? `Rack ${product.rack_number}` : "Rack not assigned"}</b><i>{product.shelf_number ? `Shelf ${product.shelf_number}` : "Shelf not assigned"}</i></span></span></div><strong>{money(product.price)}</strong><Link className="sales-locate-link" to={`/locator?search=${encodeURIComponent(product.product_name)}`} aria-label={`Locate ${product.product_name}`} title="Locate in rack map"><FiArrowUpRight/></Link><button disabled={!Number(product.stock_quantity)} onClick={() => add(product)}><FiPlus/> Add</button></article>)}{!visibleProducts.length && <p className="sales-empty">No products match that search.</p>}</div></section>
        <form className="sales-cart" onSubmit={createBill}><h2>Customer details</h2><label>Customer name<input required value={customer.customer_name} onChange={event => { setSaleRequestId(""); setCustomer({ ...customer, customer_name: event.target.value }); }}/></label><label>Mobile number<input required type="tel" value={customer.customer_mobile} onChange={event => { setSaleRequestId(""); setCustomer({ ...customer, customer_mobile: event.target.value }); }}/></label><label>Email address<input type="email" value={customer.customer_email} onChange={event => { setSaleRequestId(""); setCustomer({ ...customer, customer_email: event.target.value }); }}/></label><div className="sale-extra-fields"><label>Payment method<select value={paymentMethod} onChange={event => { setSaleRequestId(""); setPaymentMethod(event.target.value); }}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></select></label><label>Discount (₹)<input type="number" min="0" step="0.01" value={discount} onChange={event => { setSaleRequestId(""); setDiscount(event.target.value); }}/></label></div><h3>Bill items</h3>{cart.map(item => <div className="cart-line" key={item.product_id}><span>{item.product_name} × <input type="number" min="1" max={item.stock_quantity} step="1" aria-label={`Quantity of ${item.product_name}`} value={item.quantity} onChange={event => { setSaleRequestId(""); setCart(current => current.map(row => row.product_id === item.product_id ? {...row,quantity:event.target.value} : row)); }} onBlur={() => setCart(current => current.map(row => row.product_id === item.product_id ? {...row,quantity:Math.max(1,Math.min(Number(row.stock_quantity),Number(row.quantity)||1))} : row))}/> {stockUnitLabel(item.unit_of_measure)}</span><b>{money(item.price * (Number(item.quantity) || 0))}</b><button type="button" onClick={() => { setSaleRequestId(""); setCart(cart.filter(current => current.product_id !== item.product_id)); }} aria-label={`Remove ${item.product_name}`}><FiTrash2/></button></div>)}<div className="cart-total"><span>Total before tax</span><b>{money(Math.max(0, cart.reduce((sum, item) => sum + item.price * (Number(item.quantity)||0), 0) - Number(discount || 0)))}</b></div>{error && <p className="sales-error">{error}</p>}{message && <p className="sales-success">{message}</p>}{lastInvoice && <button type="button" className="download-invoice" disabled={Boolean(downloading)} onClick={() => downloadInvoice(lastInvoice)}><FiDownload/>{downloading ? "Preparing PDF…" : "Download invoice PDF"}</button>}<button className="bill-submit" disabled={busy || !cart.length || cart.some(item => !Number(item.quantity) || Number(item.quantity) > Number(item.stock_quantity))}>{busy ? "Creating bill…" : "Complete sale & create invoice"}</button></form>
      </div>
      <section className="bill-history"><div className="invoice-history-heading"><div><span className="invoice-history-kicker">INVOICE ACTIVITY</span><h2>{lookupActive ? "Search results" : "Recent invoices"}</h2><small>{historyLoading ? "Loading invoice activity…" : historyError || "Latest bills are shown automatically."}</small></div><div className="invoice-history-actions"><div className="invoice-count-card"><span><FiFileText/></span><b>{invoiceCount.toLocaleString("en-IN")}</b><small>invoices generated</small></div><Link className="invoice-all-link" to="/sales/invoices"><FiList/> Full history</Link></div></div><form onSubmit={findBill}><FiSearch/><input id="bill-lookup" value={lookup} onChange={event => setLookup(event.target.value)} placeholder="Search invoices by mobile, customer, bill ID, or invoice number" required/><button>Search</button></form>{lookupActive && <button className="show-recent-invoices" onClick={() => { setOrders(recentInvoices); setLookupActive(false); setLookup(""); setError(""); }}>Show recent invoices</button>}{orders.map(order => <article key={order.order_id}><div><b>{order.invoice_number || order.order_number}</b><small>{order.customer_name} · {order.customer_mobile} · {formatIndiaDateTime(order.created_at || order.issued_at)} IST</small></div><strong>{money(order.total)}</strong><Link className="bill-action" to={`/sales/invoices/${order.invoice_id}`} aria-label="View invoice" title="View invoice"><FiEye/></Link><button className="bill-action" disabled={Boolean(downloading)} onClick={() => downloadInvoice(order)} aria-label="Download invoice PDF"><FiDownload/></button><Link className="bill-action" to={`/sales/invoices/${order.invoice_id}?print=1`} aria-label="Print invoice" title="Print invoice"><FiPrinter/></Link>{order.items?.length > 0 && <ul>{order.items.map(item => <li key={item.order_item_id || `${order.order_id}-${item.product_id}`}>{item.product_name} × {formatStockQuantity(item.quantity,item.unit_of_measure)}</li>)}</ul>}</article>)}{!historyLoading && !historyError && !orders.length && <p className="sales-empty">No invoices generated yet. Completed bills will appear here.</p>}</section>
    </div>
  </main>;
}
