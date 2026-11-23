import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiBox, FiAlertCircle, FiMapPin, FiLogOut, FiRefreshCw, FiUsers, FiCheck, FiUserX, FiClock, FiMessageCircle } from "react-icons/fi";
import ShopMindLogo from "../components/ShopMindLogo";
import { useAuth } from "../context/AuthContext";
import "./OwnerDashboard.css";
import "./OwnerTeam.css";

const api = import.meta.env.VITE_API_BASE_URL || "";

export default function OwnerDashboard() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [staff, setStaff] = useState([]);
  const [error, setError] = useState("");
  const [staffError, setStaffError] = useState("");
  const [savingId, setSavingId] = useState("");
  const [now, setNow] = useState(() => new Date());
  const token = session?.access_token;
  const istHour = Number(new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", hourCycle: "h23" }).format(now));
  const greeting = istHour < 12 ? "Good morning" : istHour < 17 ? "Good afternoon" : "Good evening";
  const istDateTime = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(now);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    const headers = { Authorization: `Bearer ${token}` };
    const summaryPromise = fetch(`${api}/api/owner/summary`, { headers }).then(async r => {
      const body = await r.json();
      if (!r.ok) throw Error(body.message || "Summary unavailable");
      setData(body);
      setError("");
    }).catch(e => setError(e.message));
    const staffPromise = fetch(`${api}/api/owner/users`, { headers }).then(async r => {
      const body = await r.json();
      if (!r.ok) throw Error(body.message || "Staff list unavailable");
      setStaff(body.users || []);
      setStaffError("");
    }).catch(e => setStaffError(e.message));
    await Promise.all([summaryPromise, staffPromise]);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function setAccess(user, role) {
    setSavingId(user.id);
    setStaffError("");
    try {
      const response = await fetch(`${api}/api/owner/users/${user.id}/role`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const body = await response.json();
      if (!response.ok) throw Error(body.message || "Could not update access");
      await load();
    } catch (e) {
      setStaffError(e.message);
    } finally {
      setSavingId("");
    }
  }

  async function logout() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return <main className="owner-dash">
    <header><Link to="/" className="owner-brand"><ShopMindLogo/><span>OWNER</span></Link><nav><a href="#team"><FiUsers/> Team access</a><Link to="/admin/products"><FiBox/> Products</Link><Link to="/assistant"><FiMessageCircle/> AI Assistant</Link><Link to="/sales"><FiUsers/> Sales desk</Link><button onClick={logout}><FiLogOut/> Sign out</button></nav></header>
    <section className="owner-welcome"><div><small>STORE OVERVIEW</small><h1>{greeting}, owner.</h1><p className="owner-ist-clock"><FiClock/><time dateTime={now.toISOString()}>{istDateTime} IST</time></p><p>Your store at a glance. Figures update from live ShopMind records.</p></div><button onClick={load}><FiRefreshCw/> Refresh</button></section>
    {error && <div className="owner-error">{error}</div>}
    <section className="owner-metrics"><article><span><span className="rupee-symbol" aria-hidden="true">₹</span></span><small>TODAY’S SALES</small><b>₹{Number(data?.today?.sales_total || 0).toLocaleString("en-IN")}</b><p>{data?.today?.order_count || 0} completed bills today</p></article><article><span><FiBox/></span><small>PRODUCTS</small><b>{data?.inventory?.product_count ?? "—"}</b><p>{data?.inventory?.units_in_stock ?? 0} units in stock</p></article><article><span><FiAlertCircle/></span><small>LOW STOCK ALERTS</small><b>{data?.inventory?.low_stock ?? "—"}</b><p>Items at or below reorder level</p></article></section>
    <section className="owner-panels"><article><div className="owner-panel-title"><div><small>STORE MAP</small><h2>Rack status</h2></div><FiMapPin/></div>{data?.racks?.length ? data.racks.map(r => <div className="rack-status" key={r.rack_number}><b>{r.rack_number}</b><span>{r.product_count} products</span><strong>{r.units} units</strong></div>) : <p className="owner-muted">Rack summaries appear once products have rack assignments.</p>}</article><article className="owner-actions"><small>QUICK ACTIONS</small><h2>Keep the store moving</h2><Link to="/assistant"><FiMessageCircle/> Ask ShopMind AI</Link><Link to="/admin/products"><FiBox/> Manage products</Link><Link to="/sales"><FiUsers/> Create a customer bill</Link><Link to="/sales?lookup=1"><FiRefreshCw/> Find an existing bill</Link></article></section>
    <section className="owner-team" id="team"><div className="owner-team-heading"><div><small>PEOPLE & PERMISSIONS</small><h2>Sales team access</h2><p>Approve staff requests or remove Sales access. Owner access cannot be granted here.</p></div><button onClick={load}><FiRefreshCw/> Refresh</button></div>{staffError && <p className="owner-team-error">{staffError}</p>}{!staff.length && !staffError && <p className="owner-muted">No pending access requests or Sales accounts.</p>}<div className="owner-team-list">{staff.map(person => <article className="owner-team-row" key={person.id}><div className="owner-team-avatar"><FiUsers/></div><div className="owner-team-person"><b>{person.full_name || "ShopMind team member"}</b><span>{person.email}</span></div><span className={`team-status ${person.role}`}>{person.role === "pending" ? `Pending ${person.requested_workspace} access` : "Sales access active"}</span>{person.requested_workspace === "staff" && <button disabled={savingId === person.id} className={person.role === "staff" ? "team-revoke" : "team-approve"} onClick={() => setAccess(person, person.role === "staff" ? "pending" : "staff")}>{person.role === "staff" ? <><FiUserX/> Remove access</> : <><FiCheck/> Approve Sales</>}</button>}</article>)}</div></section>
  </main>;
}
