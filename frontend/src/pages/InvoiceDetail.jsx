import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { FiArrowLeft, FiDownload, FiPrinter, FiLogOut } from "react-icons/fi";
import { useAuth } from "../context/AuthContext";
import ShopMindLogo from "../components/ShopMindLogo";
import { fetchInvoicePdf } from "../services/invoices";
import { formatIndiaDateTime } from "../utils/dateTime";
import { formatStockQuantity } from "../utils/stockUnits";
import "./InvoicePages.css";

const api = import.meta.env.VITE_API_BASE_URL || "";
const money = value => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function InvoiceDetail() {
  const { invoiceId } = useParams();
  const [params] = useSearchParams();
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const [record, setRecord] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`${api}/api/sales/invoices/${invoiceId}`, { headers: { Authorization: `Bearer ${session?.access_token}` } })
      .then(async response => { const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.message || `Invoice could not be loaded (HTTP ${response.status})`); return data; })
      .then(data => { if (active) setRecord(data); })
      .catch(loadError => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [invoiceId, session?.access_token]);

  useEffect(() => {
    if (record && params.get("print") === "1") window.setTimeout(() => window.print(), 300);
  }, [record, params]);

  async function download() {
    setDownloading(true); setError("");
    try { await fetchInvoicePdf(record.invoice.invoice_id, session.access_token, record.invoice.invoice_number); }
    catch (downloadError) { setError(downloadError.message); }
    finally { setDownloading(false); }
  }

  const invoice = record?.invoice;
  return <main className="invoice-app-page invoice-detail-app">
    <header className="invoice-app-header invoice-screen-controls"><Link to="/sales/invoices"><ShopMindLogo/><span><FiArrowLeft/> INVOICE HISTORY</span></Link><div><button className="invoice-secondary-button" disabled={!record || downloading} onClick={download}><FiDownload/>{downloading ? "Preparing PDF…" : "Download PDF"}</button><button className="invoice-primary-button" disabled={!record} onClick={() => window.print()}><FiPrinter/> Print</button><button onClick={async () => { await signOut(); navigate("/login", { replace: true }); }}><FiLogOut/> Sign out</button></div></header>
    <div className="invoice-detail-wrap">
      {error && <div className="invoice-page-alert" role="alert">{error}</div>}
      {loading && <div className="invoice-detail-loading">Loading saved invoice…</div>}
      {!loading && !record && !error && <div className="invoice-detail-loading">Invoice not found.</div>}
      {record && <article className="print-invoice">
        <div className="print-invoice-topline"/>
        <div className="print-invoice-head"><div className="print-invoice-brand"><ShopMindLogo/><div><b>ShopMind Hardware Store</b><span>Customer support: contact your store</span><span>Thank you for shopping with us</span></div></div><div className="print-invoice-number"><span>SALES INVOICE</span><h1>INVOICE</h1><b>{invoice.invoice_number}</b><small>Order {invoice.order_number || invoice.order_id}</small></div></div>
        <div className="print-invoice-meta"><div><span>INVOICE DATE (IST)</span><b>{formatIndiaDateTime(invoice.issued_at, { dateStyle: "long" })} IST</b></div><div><span>PAYMENT STATUS</span><b><i className={`invoice-status status-${invoice.payment_status || "paid"}`}>{invoice.payment_status || "paid"}</i></b></div><div><span>PAYMENT METHOD</span><b>{(invoice.payment_method || "unspecified").replaceAll("_", " ")}</b></div></div>
        <section className="print-invoice-customer"><div><span>BILLED TO</span><h2>{invoice.customer_name || "Walk-in customer"}</h2><p>{invoice.customer_mobile || "No mobile saved"}</p>{invoice.customer_email && <p>{invoice.customer_email}</p>}</div><div className="print-invoice-order-id"><span>ORDER REFERENCE</span><b>{invoice.order_number || `#${invoice.order_id}`}</b></div></section>
        <div className="print-invoice-table-scroll"><table className="print-invoice-table"><thead><tr><th>ITEM</th><th>SKU</th><th>UNIT PRICE</th><th>QTY</th><th className="align-right">AMOUNT</th></tr></thead><tbody>{record.items.map((item, index) => <tr key={item.order_item_id || `${item.product_id}-${index}`}><td><b>{item.product_name}</b></td><td>{item.sku || "—"}</td><td>{money(item.unit_price)}</td><td>{formatStockQuantity(item.quantity,item.unit_of_measure)}</td><td className="align-right">{money(item.line_total)}</td></tr>)}</tbody></table></div>
        <section className="print-invoice-totals"><div className="print-invoice-thanks"><span>SHOP LOCAL. BUILD BETTER.</span><b>Thank you for choosing ShopMind.</b><p>We appreciate your business. Please retain this invoice for your records.</p></div><div className="print-invoice-total-card"><h3>Payment summary</h3><div><span>Subtotal</span><b>{money(invoice.subtotal)}</b></div><div><span>Tax / GST</span><b>{money(invoice.tax_amount)}</b></div><div><span>Discount</span><b>− {money(invoice.discount_amount)}</b></div><div className="print-invoice-grand-total"><span>Grand total</span><b>{money(invoice.total)}</b></div></div></section>
        <footer className="print-invoice-footer"><span>ShopMind · Hardware and store sales</span><span>Generated electronically · {invoice.invoice_number}</span></footer>
      </article>}
    </div>
  </main>;
}
