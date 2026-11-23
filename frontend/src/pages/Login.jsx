import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { FiArrowLeft, FiArrowUpRight, FiBox, FiCheck, FiEye, FiEyeOff, FiMapPin } from "react-icons/fi";
import { supabase, supabaseConfigured } from "../services/supabase";
import ShopMindLogo from "../components/ShopMindLogo";
import "./Login.css";

export default function Login({ ownerMode = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const requestedWorkspace = new URLSearchParams(location.search).get("workspace");
  const [mode, setMode] = useState(ownerMode || requestedWorkspace === "owner" ? "owner" : "staff");
  const [form, setForm] = useState({ email: "", password: "" });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    if (!supabaseConfigured) {
      setMessage("Supabase is not configured. Check frontend/.env.local and restart Vite.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword(form);
    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles").select("role").eq("id", data.user.id).maybeSingle();
    if (profileError || !profile?.role) {
      await supabase.auth.signOut();
      setMessage(profileError ? `Could not read your ShopMind access: ${profileError.message}` : "This account has no ShopMind workspace yet. Ask the owner to assign Sales access.");
      setLoading(false);
      return;
    }

    const isOwner = profile.role === "admin";
    const canUseSales = isOwner || profile.role === "staff";
    if ((mode === "owner" && !isOwner) || (mode === "staff" && !canUseSales)) {
      await supabase.auth.signOut();
      setMessage(profile.role === "pending" || profile.role === "customer"
        ? "This account is awaiting access. Ask the owner to assign Sales access."
        : mode === "owner"
          ? "This account does not have Owner access."
          : "This account does not have Sales access.");
      setLoading(false);
      return;
    }

    setLoading(false);
    const destination = mode === "owner" ? "/owner" : "/sales";
    navigate(location.state?.from || destination, { replace: true });
  }

  return <main className="signin-page"><Link className="signin-back" to="/"><FiArrowLeft/> Back to ShopMind</Link><section className="signin-card"><aside className="signin-story"><Link className="signin-brand" to="/"><ShopMindLogo/></Link><div className="signin-story-copy"><span className="signin-overline"><i/> YOUR STORE, IN SYNC</span><h1>Keep the store<br/><em>moving forward.</em></h1><p>Inventory, sales, and store operations in one focused workspace.</p></div><div className="signin-preview"><div className="signin-preview-head"><span>SHOPMIND WORKSPACE</span><b><FiCheck/> READY</b></div><div className="signin-preview-row"><span className="signin-preview-icon"><FiBox/></span><div><small>SALES TEAM</small><b>Find products and create customer bills</b></div><FiArrowUpRight/></div><div className="signin-preview-row"><span className="signin-preview-icon pin"><FiMapPin/></span><div><small>OWNER</small><b>Track stock, sales, and rack status</b></div><FiArrowUpRight/></div></div><div className="signin-story-footer"><span>Thoughtfully stocked. Easy to find.</span><span>© 2026 ShopMind</span></div><span className="signin-deco deco-one">✳</span><span className="signin-deco deco-two">✳</span></aside><section className="signin-form-side"><div className="signin-form-wrap"><div className="signin-kicker">WELCOME TO SHOPMIND</div><h2>{mode === "owner" ? "Owner sign in" : "Sales staff sign in"}</h2><p className="signin-subtitle">Choose your workspace, then enter your account details.</p><div className="signin-modes signin-modes-two" role="tablist" aria-label="Sign in type"><button type="button" className={mode === "staff" ? "active" : ""} onClick={() => { setMode("staff"); setMessage(""); }}>Sales staff</button><button type="button" className={mode === "owner" ? "active" : ""} onClick={() => { setMode("owner"); setMessage(""); }}>Owner / admin</button></div><form className="signin-form" onSubmit={handleSubmit}><label htmlFor="signin-email">Email address</label><input id="signin-email" type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required/><div className="signin-password-label"><label htmlFor="signin-password">Password</label><span>Secure Supabase sign-in</span></div><div className="signin-password"><input id="signin-password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required/><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <FiEyeOff/> : <FiEye/>}</button></div>{message && <div className="signin-error" role="alert">{message}</div>}<button className="signin-submit" type="submit" disabled={loading}>{loading ? "Checking access…" : mode === "owner" ? "Continue to owner workspace" : "Continue to sales desk"}<FiArrowUpRight/></button></form><div className="signin-divider"><span/> ROLE-BASED SHOPMIND ACCESS <span/></div><p className="signin-register">Need a staff account? <Link to="/register">Request access <FiArrowUpRight/></Link></p></div><div className="signin-footnote">Owners assign Sales access from the owner workspace.</div></section></section></main>;
}
