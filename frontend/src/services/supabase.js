import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let validUrl = false;
try {
  const parsedUrl = new URL(url);
  validUrl = parsedUrl.protocol === "https:" || parsedUrl.protocol === "http:";
} catch {
  validUrl = false;
}
export const supabaseConfigured = Boolean(validUrl && anonKey?.trim());
export const supabase = supabaseConfigured ? createClient(url, anonKey.trim()) : null;
