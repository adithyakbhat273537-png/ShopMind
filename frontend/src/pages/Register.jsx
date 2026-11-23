import { useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowLeft, FiArrowUpRight, FiUsers, FiShield, FiEye, FiEyeOff } from "react-icons/fi";
import { supabase, supabaseConfigured } from "../services/supabase";
import ShopMindLogo from "../components/ShopMindLogo";
import "./Register.css";

export default function Register() {
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [accountType, setAccountType] = useState("staff");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setMessage("");
    setSuccess(false);
    if (!supabaseConfigured) return setMessage("Supabase is not configured. Check frontend/.env.local.");
    if (form.password !== form.confirmPassword) return setMessage("Passwords do not match.");
    if (form.password.length < 8) return setMessage("Use at least 8 characters for your password.");
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { full_name: form.name.trim(), requested_role: accountType } },
    });
    setBusy(false);
    if (error) return setMessage(error.message);
    setSuccess(true);
    setMessage(accountType === "admin"
      ? "Owner access request created. The first owner account is enabled automatically; otherwise an existing owner must approve it."
      : "Sales account request created. An owner must approve Sales access before you can sign in to the sales desk.");
  }

  const choices = [
    { id: "staff", title: "Sales staff", detail: "Request access to the sales desk", icon: <FiUsers/> },
    { id: "admin", title: "Owner / admin", detail: "Request the owner workspace", icon: <FiShield/> },
  ];

  return <main className="register-page"><Link className="register-back" to="/login"><FiArrowLeft/> Back to sign in</Link><section className="register-card"><aside className="register-story"><Link className="register-brand" to="/"><i><ShopMindMark/></i>shopmind<span>.</span></Link><div className="register-story-copy"><small>SHOPMIND TEAM ACCESS</small><h1>Better stocked.<br/><em>Better together.</em></h1><p>Join the team workspace for day-to-day sales and store operations.</p></div><div className="register-story-note"><span><FiShield/></span><div><b>Access is assigned safely</b><small>Choosing a role never grants it automatically. An owner approves access.</small></div></div><footer>© 2026 ShopMind <span>Built for better stocked days.</span></footer></aside><section className="register-form-side"><div className="register-form-wrap"><small className="register-eyebrow">REQUEST TEAM ACCESS</small><h2>Create your ShopMind account.</h2><p className="register-subtitle">Choose the workspace you need.</p><form onSubmit={submit}><div className="register-role-choices register-role-choices-two">{choices.map(choice => <button type="button" key={choice.id} className={accountType === choice.id ? "chosen" : ""} onClick={() => setAccountType(choice.id)}><i>{choice.icon}</i><b>{choice.title}</b><small>{choice.detail}</small></button>)}</div><div className="role-request-note">This is an access request. Only the first owner account can initialize the owner workspace; later requests need approval.</div><div className="register-fields"><label className="field-wide">Full name<input autoComplete="name" placeholder="Your name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></label><label className="field-wide">Email address<input type="email" autoComplete="email" placeholder="you@example.com" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}/></label><label>Password<div className="register-pass"><input type={show ? "text" : "password"} autoComplete="new-password" minLength={8} placeholder="At least 8 characters" required value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}/><button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>{show ? <FiEyeOff/> : <FiEye/>}</button></div></label><label>Confirm password<input type="password" autoComplete="new-password" placeholder="Enter password again" required value={form.confirmPassword} onChange={e => setForm({ ...form, confirmPassword: e.target.value })}/></label></div>{message && <p className={success ? "register-success" : "register-error"} role="status">{message}</p>}<button className="register-submit" disabled={busy}>{busy ? "Creating request…" : "Request access"}<FiArrowUpRight/></button></form><p className="register-existing">Already have a ShopMind account? <Link to="/login">Sign in</Link></p></div></section></section></main>;
}
