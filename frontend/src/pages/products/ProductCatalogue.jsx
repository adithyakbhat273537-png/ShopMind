import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FiSearch, FiArrowUpRight, FiMapPin, FiBox, FiArrowLeft, FiRefreshCw, FiSliders, FiZap } from "react-icons/fi";
import ShopMindLogo from "../../components/ShopMindLogo";
import { useAuth } from "../../context/AuthContext";
import { formatStockQuantity } from "../../utils/stockUnits";
import "./ProductCatalogue.css";

const apiBase = import.meta.env.VITE_API_BASE_URL || "";
const money = value => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0));

export default function ProductCatalogue() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [category, setCategory] = useState("All items");
  const [sort, setSort] = useState("featured");
  const { session } = useAuth();
  const [aiResults, setAiResults] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessage, setAiMessage] = useState("");
  const [aiError, setAiError] = useState("");

  async function loadProducts() {
    setLoading(true); setError("");
    try {
      const response = await fetch(`${apiBase}/api/products`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || `Catalogue request failed (${response.status}).`);
      setProducts(Array.isArray(data.products) ? data.products : []);
    } catch (err) {
      setError(err instanceof TypeError ? "Can’t reach the ShopMind API. Check that Flask is running on port 5000." : err.message);
    } finally { setLoading(false); }
  }
  useEffect(() => { loadProducts(); }, []);
  useEffect(() => { setSearch(searchParams.get("search") || ""); }, [searchParams]);

  const categories = useMemo(() => ["All items", ...new Set(products.map(p => p.category_name).filter(Boolean))], [products]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = products.filter(p => (!q || [p.product_name,p.brand,p.sku,p.description,p.category_name,p.size].some(v => String(v || "").toLowerCase().includes(q))) && (category === "All items" || p.category_name === category));
    if (sort === "price-low") list.sort((a,b) => Number(a.price)-Number(b.price));
    if (sort === "price-high") list.sort((a,b) => Number(b.price)-Number(a.price));
    if (sort === "name") list.sort((a,b) => a.product_name.localeCompare(b.product_name));
    return list;
  }, [products, search, category, sort]);
  function updateSearch(value) { setSearch(value); setAiResults(null); setAiMessage(""); setAiError(""); setSearchParams(value.trim() ? { search: value } : {}, { replace: true }); }
  async function runSmartSearch(event) {
    event.preventDefault();
    if (!search.trim()) { setAiResults(null); setAiMessage(""); return; }
    if (!session?.access_token) {
      setAiError("Sign in to your ShopMind workspace to use AI search.");
      return;
    }
    setAiLoading(true); setAiError(""); setAiMessage("");
    try {
      const response = await fetch(`${apiBase}/api/assistant/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ query: search.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || `AI search failed (${response.status}).`);
      setAiResults(Array.isArray(data.products) ? data.products : []);
      setAiMessage(data.ai_assisted ? "Matched your request to real catalogue items using ShopMind AI." : "Showing catalogue matches using ShopMind’s built-in search.");
    } catch (err) { setAiError(err.message || "AI search is unavailable. Try the product name or SKU."); }
    finally { setAiLoading(false); }
  }
  const displayedProducts = useMemo(() => {
    if (aiResults === null) return shown;
    let list = aiResults.filter(p => category === "All items" || p.category_name === category);
    if (sort === "price-low") list = [...list].sort((a,b) => Number(a.price)-Number(b.price));
    if (sort === "price-high") list = [...list].sort((a,b) => Number(b.price)-Number(a.price));
    if (sort === "name") list = [...list].sort((a,b) => a.product_name.localeCompare(b.product_name));
    return list;
  }, [aiResults, shown, category, sort]);

  return <div className="catalog-page"><header className="catalog-nav"><Link className="brand" to="/"><ShopMindLogo/></Link><div className="catalog-nav-links"><Link to="/">Home</Link><Link to="/dashboard">My workspace</Link></div><Link className="catalog-nav-cta" to="/login">Your account <FiArrowUpRight/></Link></header>
    <main className="catalog-main"><div className="catalog-breadcrumb"><Link to="/"><FiArrowLeft/> ShopMind</Link><span>/</span><b>Catalogue</b></div>
      <section className="catalog-hero"><div><div className="catalog-eyebrow"><i/> THE SHOPMIND CATALOGUE</div><h1>Find your next<br/><span>project essential.</span></h1><p>Browse the store’s hardware and electrical range. Search by name, brand, or SKU to find the right item.</p></div><div className="catalog-hero-art"><span className="art-orbit orbit-a"/><span className="art-orbit orbit-b"/><span className="art-box"><FiBox/></span><span className="art-spark">✳</span></div></section>
      <form className="catalog-search" onSubmit={runSmartSearch}><FiSearch/><input aria-label="Search catalogue" placeholder="Try ‘something to connect two water pipes’…" value={search} onChange={e => updateSearch(e.target.value)}/>{search && <button type="button" className="clear-search" onClick={() => updateSearch("")}>Clear</button>}<button className="catalog-ai-button" type="submit" disabled={aiLoading || !search.trim()}><FiZap/>{aiLoading ? "Searching…" : "Ask AI"}</button></form>
      {(aiMessage || aiError) && <div className={`catalog-ai-feedback ${aiError ? "catalog-ai-error" : ""}`} role={aiError ? "alert" : "status"}>{aiError || aiMessage}{aiError && <button type="button" onClick={runSmartSearch}>Retry</button>}</div>}
      <section className="catalog-toolbar"><div><span className="catalog-kicker">SHOP BY CATEGORY</span><div className="category-chips">{categories.map(item => <button key={item} onClick={() => setCategory(item)} className={category === item ? "selected" : ""}>{item}</button>)}</div></div><label className="sort-control"><span>Sort by</span><select value={sort} onChange={e => setSort(e.target.value)}><option value="featured">Featured</option><option value="name">Name</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select></label></section>
      <div className="catalog-results-head"><div><h2>{aiResults !== null ? "AI catalogue matches" : search ? "Search results" : "All essentials"}</h2><span>{loading || aiLoading ? "Finding products…" : `${displayedProducts.length} ${displayedProducts.length === 1 ? "product" : "products"}`}</span></div></div>
      {loading ? <div className="catalog-state"><span className="loading-dot"/><p>Loading your catalogue…</p></div> : error ? <div className="catalog-state error-state"><h3>We couldn’t load the catalogue</h3><p>{error}</p><button onClick={loadProducts}><FiRefreshCw/> Try again</button></div> : displayedProducts.length === 0 ? <div className="catalog-state"><span className="empty-icon"><FiBox/></span><h3>{products.length ? "No matches this time" : "Your catalogue is ready for products"}</h3><p>{products.length ? "Try a different search or category." : "Once products are added to your ShopMind inventory, they’ll appear here."}</p>{search && <button className="reset-filter" onClick={() => { updateSearch(""); setCategory("All items"); }}>Clear filters</button>}</div> : <section className="product-grid">{displayedProducts.map(product => <article className="product-card" key={product.product_id}><div className="product-image">{product.image_url ? <img src={product.image_url} alt={product.product_name}/> : <div className="image-placeholder"><FiBox/><span>SHOPMIND FINDS</span></div>}<span className={`availability ${Number(product.stock_quantity) > 0 ? "in-stock" : "out-stock"}`}><i/>{Number(product.stock_quantity) > 0 ? "In stock" : "Out of stock"}</span></div><div className="product-info">{product.category_name && <span className="product-category">{product.category_name}</span>}<h3>{product.product_name}</h3><p className="product-brand">{product.brand || "ShopMind selection"} <span>·</span> SKU {product.sku}</p>{product.size && <p className="product-brand">Specification: {product.size}</p>}<div className="product-card-bottom"><div><span className="price-label">SELLING PRICE</span><b>{money(product.price)}</b></div><span className="product-arrow"><FiArrowUpRight/></span></div><div className="product-location"><FiMapPin/><span>{product.rack_number || product.shelf_number ? `Rack ${product.rack_number || "—"} · Shelf ${product.shelf_number || "—"}` : "Ask in store for location"}</span><span className="stock-count">{Number(product.stock_quantity) > 0 ? `${formatStockQuantity(product.stock_quantity, product.unit_of_measure)} available` : "Check availability"}</span></div></div></article>)}</section>}
      <footer className="catalog-footer"><Link className="brand" to="/"><ShopMindLogo/></Link><span>Thoughtfully stocked. Easy to find.</span><span>© 2026 ShopMind</span></footer>
    </main></div>;
}
