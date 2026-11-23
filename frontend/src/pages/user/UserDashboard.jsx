import { useState } from "react";
import ShopMindLogo from "../../components/ShopMindLogo";
import { Link, useNavigate } from "react-router-dom";
import { FiZap, FiGrid, FiSearch, FiBox, FiMapPin, FiShoppingBag, FiLogOut, FiArrowUpRight, FiMenu, FiX, FiUser, FiChevronRight, FiPackage } from "react-icons/fi";
import { useAuth } from "../../context/AuthContext";
import "./UserDashboard.css";

export default function UserDashboard() {
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const name = profile?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "there";
  const initials = (profile?.full_name || user?.email || "S").slice(0, 1).toUpperCase();
  const isAdmin = ["admin", "staff"].includes(profile?.role);
  async function logout() { await signOut(); navigate("/login", { replace: true }); }
  function searchProducts(event) { event.preventDefault(); navigate(`/products${search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ""}`); }
  return <div className="dashboard-shell">
    <aside className={`dash-sidebar ${menuOpen ? "is-open" : ""}`}>
      <Link className="dash-brand" to="/"><ShopMindLogo/></Link>
      <div className="sidebar-label">WORKSPACE</div>
      <nav className="side-nav"><Link className="side-link active" to="/dashboard"><FiGrid/> Overview</Link><Link className="side-link" to="/products"><FiBox/> Product catalogue</Link><Link className="side-link" to="/locator"><FiMapPin/> Rack & shelf locator</Link>{profile?.role === "admin" && <Link className="side-link admin-side-link" to="/admin/products"><FiPackage/> Manage products</Link>}<div className="side-divider"/><span className="sidebar-label">YOUR ACCOUNT</span><button className="side-link" onClick={() => navigate("/dashboard")}><FiShoppingBag/> My activity</button></nav>
      <div className="sidebar-bottom"><div className="help-card"><span className="help-spark">✳</span><b>Need a hand?</b><p>Search the catalogue to find your next essential.</p><Link to="/products">Explore products <FiArrowUpRight/></Link></div><button className="side-link logout-link" onClick={logout}><FiLogOut/> Sign out</button></div>
    </aside>
    {menuOpen && <button className="dash-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)}/>}
    <main className="dash-main"><header className="dash-topbar"><button className="menu-toggle" aria-label="Open menu" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <FiX/> : <FiMenu/>}</button><div className="crumb">Workspace <FiChevronRight/> <b>Overview</b></div><div className="top-user"><span className="user-role">{profile?.role || "Customer"}</span><span className="user-avatar">{initials}</span><button className="top-logout" onClick={logout} title="Sign out"><FiLogOut/></button></div></header>
      <div className="dash-content"><section className="welcome-row"><div><div className="dash-overline"><span/> YOUR SHOPMIND SPACE</div><h1>Good to see you, {name}<span className="wave">✳</span></h1><p>What are you looking for today?</p></div><div className="welcome-date"><FiZap/> Built for better stocked days</div></section>
        <form className="dash-search" onSubmit={searchProducts}><FiSearch/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products, brands, or SKU..." aria-label="Search product catalogue"/><span className="search-shortcut">Enter ↵</span><button type="submit">Search <FiArrowUpRight/></button></form>
        <section className="dash-section-head"><div><span className="dash-overline">A GOOD PLACE TO START</span><h2>Your shortcuts</h2></div><Link to="/products">Browse all products <FiArrowUpRight/></Link></section>
        <section className="shortcut-grid"><Link to="/products" className="shortcut-card catalog-card"><span className="shortcut-icon"><FiBox/></span><span className="shortcut-arrow"><FiArrowUpRight/></span><small>EXPLORE</small><h3>Product catalogue</h3><p>Browse hardware and electrical essentials.</p></Link><button onClick={() => navigate("/products")} className="shortcut-card locator-card"><span className="shortcut-icon"><FiMapPin/></span><span className="shortcut-arrow"><FiArrowUpRight/></span><small>FIND IT</small><h3>Product locator</h3><p>Search an item and check its rack and shelf.</p></button><button onClick={() => navigate("/products")} className="shortcut-card stock-card"><span className="shortcut-icon"><FiPackage/></span><span className="shortcut-arrow"><FiArrowUpRight/></span><small>CHECK AVAILABILITY</small><h3>Stock & availability</h3><p>See product availability in the catalogue.</p></button></section>
        <section className="dash-lower"><div className="lower-panel"><div className="panel-title"><div><span className="dash-overline">QUICK FIND</span><h2>Pick up where you need</h2></div><span className="panel-icon"><FiSearch/></span></div><p>Search by item name, brand, or SKU. Your results include current stock and shelf location when the store catalogue has them.</p><form className="quick-search" onSubmit={searchProducts}><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Try “LED bulbs” or a product SKU"/><button type="submit" aria-label="Search"><FiArrowUpRight/></button></form></div><div className="lower-panel profile-panel"><span className="dash-overline">ACCOUNT</span><div className="profile-summary"><span className="profile-avatar"><FiUser/></span><div><b>{profile?.full_name || user?.email || "ShopMind member"}</b><span>{user?.email}</span></div></div><div className="account-role"><span>Account type</span><b>{profile?.role || "Customer"}</b></div>{isAdmin && <div className="admin-note">Staff workspace access is enabled for this account.</div>}</div></section>
        <footer className="dash-footer"><Link className="dash-brand" to="/"><ShopMindLogo/></Link><span>Thoughtfully stocked. Easy to find.</span><span>© 2026 ShopMind</span></footer>
      </div></main></div>;
}
