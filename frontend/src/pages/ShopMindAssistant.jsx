import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiArrowLeft, FiBox, FiLogOut, FiMessageCircle, FiSend, FiZap } from "react-icons/fi";
import { useAuth } from "../context/AuthContext";
import ShopMindLogo from "../components/ShopMindLogo";
import "./ShopMindAssistant.css";

const api = import.meta.env.VITE_API_BASE_URL || "";

export default function ShopMindAssistant() {
  const { session, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sources, setSources] = useState([]);
  const bottom = useRef(null);
  const token = session?.access_token;

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, busy]);

  async function send(event) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    const previous = messages;
    setMessages(current => [...current, { role: "user", content: text }]);
    setDraft(""); setBusy(true); setError(""); setSources([]);
    try {
      const response = await fetch(`${api}/api/assistant/chat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: previous.slice(-8) }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || `Assistant request failed (HTTP ${response.status})`);
      setMessages(current => [...current, { role: "assistant", content: result.answer }]);
      setSources(result.sources || []);
    } catch (e) {
      setError(e.message);
      setMessages(current => [...current, { role: "assistant", content: "I couldn’t reach the assistant just now. Check the connection status and try again." }]);
    } finally { setBusy(false); }
  }

  async function logout() { await signOut(); navigate("/login", { replace: true }); }
  const roleHome = profile?.role === "admin" ? "/owner" : "/sales";
  const starters = profile?.role === "admin"
    ? ["Summarize today's store performance", "Which products need restocking?", "How is each rack doing?", "Show recent sales and invoices"]
    : ["Show my sales today", "Which products need restocking?", "Where are the low-stock items?", "Show recent stock movements"];

  return <main className="assistant-page">
    <header className="assistant-header"><Link className="assistant-brand" to={roleHome}><ShopMindLogo/><span><FiArrowLeft/> WORKSPACE</span></Link><div><button onClick={logout}><FiLogOut/> Sign out</button></div></header>
    <div className="assistant-layout">
      <aside className="assistant-intro"><span className="assistant-kicker"><FiZap/> SHOPMIND AI</span><h1>{profile?.role === "admin" ? <>Your store,<br/>at a glance.</> : <>Your shift,<br/>in sync.</>}</h1><p>Ask about live products, sales, stock, invoices, and rack locations. I’ll use the latest ShopMind records.</p><div className="assistant-capability"><FiBox/><span><b>Live catalogue</b><small>Product specifications, prices, availability, and shelf locations.</small></span></div><div className="assistant-capability"><FiMessageCircle/><span><b>Store operations</b><small>{profile?.role === "admin" ? "Sales totals, invoices, stock movements, and rack summaries." : "Your sales totals, shared stock activity, and store locations."}</small></span></div></aside>
      <section className="assistant-chat" aria-label="ShopMind AI chat"><div className="assistant-chat-top"><div><span className="assistant-avatar"><FiZap/></span><div><b>ShopMind Assistant</b><small>Live answers for your store</small></div></div><span className="assistant-role">{profile?.role === "admin" ? "OWNER" : "SALES"}</span></div>
        <div className="assistant-messages" aria-live="polite">
          {!messages.length && <div className="assistant-welcome"><span><FiMessageCircle/></span><h2>What can I help you with?</h2><p>Try a quick question or type your own below.</p><div className="assistant-starters">{starters.map(item => <button key={item} onClick={() => setDraft(item)}>{item}</button>)}</div></div>}
          {messages.map((message, index) => <article key={`${index}-${message.role}`} className={`assistant-message ${message.role}`}><span>{message.role === "assistant" ? <FiZap/> : "You"}</span><p>{message.content}</p></article>)}
          {busy && <article className="assistant-message assistant"><span><FiZap/></span><p className="assistant-typing">Thinking<span>·</span><span>·</span><span>·</span></p></article>}
          <div ref={bottom}/>
        </div>
        {error && <div className="assistant-error" role="alert">{error}</div>}
        {sources.length > 0 && messages.length > 0 && <details className="assistant-sources"><summary>Live catalogue context · {sources.length} {sources.length === 1 ? "item" : "items"}</summary><div>{sources.slice(0, 6).map(item => <span key={item.sku}><b>{item.product_name}</b><small>{item.sku} · {item.stock_quantity} in stock{item.rack_number ? ` · Rack ${item.rack_number}` : ""}{item.shelf_number ? `, Shelf ${item.shelf_number}` : ""}</small></span>)}</div></details>}
        <form className="assistant-compose" onSubmit={send}><textarea value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder="Ask ShopMind anything…" maxLength={2000} rows={1} aria-label="Message ShopMind Assistant"/><button disabled={busy || !draft.trim()} aria-label="Send message"><FiSend/></button><small>AI responses may be imperfect. Verify important store decisions.</small></form>
      </section>
    </div>
  </main>;
}


