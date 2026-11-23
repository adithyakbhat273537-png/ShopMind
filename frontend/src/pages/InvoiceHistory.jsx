import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiArrowLeft, FiCalendar, FiChevronLeft, FiChevronRight, FiDownload, FiFileText, FiLogOut, FiPrinter, FiRefreshCw, FiSearch, FiEye } from "react-icons/fi";
import { useAuth } from "../context/AuthContext";
import ShopMindLogo from "../components/ShopMindLogo";
import { fetchInvoicePdf } from "../services/invoices";
import { formatIndiaDateTime } from "../utils/dateTime";
import "./InvoicePages.css";

const api = import.meta.env.VITE_API_BASE_URL || "";
const money = value => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function InvoiceHistory() {
  const { session, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({ q: "", from: "", to: "", status: "all", sort: "newest" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ invoices: [], total_count: 0, total_pages: 0, summary: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!session?.access_token) return undefined;
    let active = true;
    const params = new URLSearchParams({ ...filters, page: String(page), per_page: "100" });
    fetch(`${api}/api/sales/invoices?${params}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then(async response => {
        const result = await response.json().catch(() => ({}));
        if (response.status === 404) {
          throw new Error("The Flask server you are connected to does not have the invoice-history route. Stop the old Flask process and restart it from this ShopMind project's backend folder.");
        }
        if (!response.ok) throw new Error(result.message || `Invoice history request failed (HTTP ${response.status})`);
        return result;
      })
      .then(result => { if (active) { setData(result); setError(""); } })
      .catch(loadError => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session, filters, page, refreshTick]);
  async function download(invoice) {
    setDownloading(invoice.invoice_id); setError("");
    try { await fetchInvoicePdf(invoice.invoice_id, session.access_token, invoice.invoice_number); }
    catch (downloadError) { setError(downloadError.message); }
    finally { setDownloading(null); }
  }
  function submitSearch(event) {
    event.preventDefault(); setLoading(true); setPage(1);
    setFilters(current => ({ ...current, q: query.trim() }));
  }
  function updateFilter(name, value) {
    setLoading(true); setPage(1);
    setFilters(current => ({ ...current, [name]: value }));
  }

  return <main className="invoice-app-page">
    <header className="invoice-app-header"><Link to="/sales" aria-label="Back to Sales desk"><ShopMindLogo/><span><FiArrowLeft/> SALES DESK</span></Link><div>{profile?.role === "admin" && <Link to="/owner">Owner workspace</Link>}<button onClick={async () => { await signOut(); navigate("/login", { replace: true }); }}><FiLogOut/> Sign out</button></div></header>
    <div className="invoice-history-page">
      <div className="invoice-page-title"><div><span className="invoice-eyebrow">SALES / RECORDS</span><h1>Invoice history</h1><p>Every saved bill, available again whenever you need it.</p></div><button className="invoice-secondary-button" onClick={() => { setLoading(true); setRefreshTick(value => value + 1); }} disabled={loading}><FiRefreshCw/> Refresh</button></div>
      {error && <div className="invoice-page-alert" role="alert">{error}{error.includes("migration 0011") && <span>Apply <code>database/migrations/0011_invoice_history.sql</code> in the Supabase SQL Editor, then restart Flask.</span>}</div>}
      <section className="invoice-summary-grid" aria-label="Invoice summary"><article><span><FiFileText/></span><small>ALL INVOICES</small><b>{Number(data.summary?.invoice_count || 0).toLocaleString("en-IN")}</b><i>Saved billing records</i></article><article className="invoice-summary-total"><span>₹</span><small>TOTAL BILLED</small><b>{money(data.summary?.billed_total)}</b><i>Across all generated invoices</i></article><article><span><FiCalendar/></span><small>IN THIS VIEW</small><b>{Number(data.total_count || 0).toLocaleString("en-IN")}</b><i>Match the current filters</i></article></section>
      <section className="invoice-table-card">
        <div className="invoice-table-heading"><div><h2>Saved invoices</h2><p>All recent invoices appear automatically. Search or filter to narrow the list.</p></div><span>{loading ? "Updating…" : `${data.total_count || 0} records`}</span></div>
        <form className="invoice-filters" onSubmit={submitSearch}><label className="invoice-search-box"><FiSearch/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Invoice, customer, mobile, order ID"/><button type="submit">Search</button></label><label>From<input type="date" value={filters.from} onChange={event => updateFilter("from", event.target.value)}/></label><label>To<input type="date" value={filters.to} onChange={event => updateFilter("to", event.target.value)}/></label><label>Status<select value={filters.status} onChange={event => updateFilter("status", event.target.value)}><option value="all">All statuses</option><option value="paid">Paid</option><option value="unpaid">Unpaid</option><option value="partial">Partial</option><option value="refunded">Refunded</option><option value="void">Void</option><option value="unknown">Unknown (legacy)</option></select></label><label>Sort<select value={filters.sort} onChange={event => updateFilter("sort", event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>{(filters.q || filters.from || filters.to || filters.status !== "all") && <button className="invoice-secondary-button invoice-show-all" type="button" onClick={() => { setQuery(""); setPage(1); setLoading(true); setFilters({ q: "", from: "", to: "", status: "all", sort: "newest" }); }}>Show all</button>}</form>
        <div className="invoice-table-scroll"><table><thead><tr><th>INVOICE</th><th>CUSTOMER</th><th>DATE</th><th>ORDER</th><th>STATUS</th><th className="invoice-amount-col">TOTAL</th><th className="invoice-actions-col">ACTIONS</th></tr></thead><tbody>
          {loading && !data.invoices.length ? <tr><td className="invoice-table-message" colSpan="7">Loading saved invoices…</td></tr> : null}
          {!loading && !error && !data.invoices.length ? <tr><td className="invoice-table-message" colSpan="7">No invoices match these filters. Saved invoices will remain available here after you sign out.</td></tr> : null}
          {data.invoices.map(invoice => <tr key={invoice.invoice_id}><td><b>{invoice.invoice_number}</b><small>#{invoice.invoice_id}</small></td><td><b>{invoice.customer_name}</b><small>{invoice.customer_mobile || "No mobile saved"}</small></td><td>{formatIndiaDateTime(invoice.issued_at)}</td><td>{invoice.order_number || `#${invoice.order_id}`}</td><td><span className={`invoice-status status-${invoice.payment_status || "paid"}`}>{invoice.payment_status || "paid"}</span></td><td className="invoice-amount-col">{money(invoice.total)}</td><td className="invoice-row-actions"><Link to={`/sales/invoices/${invoice.invoice_id}`} aria-label={`View ${invoice.invoice_number}`} title="View invoice"><FiEye/></Link><button disabled={downloading === invoice.invoice_id} onClick={() => download(invoice)} aria-label={`Download ${invoice.invoice_number} PDF`} title="Download PDF"><FiDownload/></button><Link to={`/sales/invoices/${invoice.invoice_id}?print=1`} aria-label={`Print ${invoice.invoice_number}`} title="Print invoice"><FiPrinter/></Link></td></tr>)}
        </tbody></table></div>
        <div className="invoice-pagination"><span>Page {data.page || page} of {Math.max(1, data.total_pages || 1)}</span><div><button disabled={page <= 1 || loading} onClick={() => { setLoading(true); setPage(value => value - 1); }} aria-label="Previous page"><FiChevronLeft/></button><button disabled={page >= (data.total_pages || 1) || loading} onClick={() => { setLoading(true); setPage(value => value + 1); }} aria-label="Next page"><FiChevronRight/></button></div></div>
      </section>
    </div>
  </main>;
}
