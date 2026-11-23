import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children, roles }) {
  const { user, profile, loading, configured, signOut } = useAuth();
  const location = useLocation();
  if (loading) return <main className="auth-state">Checking your session…</main>;
  if (!configured) return <main className="auth-state"><h2>Supabase is not configured</h2><p>Add the public project URL and anon key to <code>frontend/.env.local</code>.</p></main>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  const role = profile?.role || "pending";
  if (roles && !roles.includes(role)) {
    if (role === "pending" || role === "customer") return <main className="auth-state"><h2>Workspace access is pending</h2><p>An owner must approve your Sales access before you can use this page.</p><button onClick={signOut}>Sign out</button> <Link to="/login">Return to sign in</Link></main>;
    return <Navigate to={role === "admin" ? "/owner" : "/sales"} replace />;
  }
  return children;
}
