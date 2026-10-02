// Authentication = proving who you are (email + password -> signed token).
// Authorization = the server checks the token AND that the admin exists in MongoDB on every admin request.
import { api } from "./api.js";
export async function login(email, password) { const { token } = await api("/admin/login", "POST", { email, password }); localStorage.setItem("adminToken", token); }
export function logout() { localStorage.removeItem("adminToken"); location.href = "login.html"; }
export async function requireAdmin() {
  try { await api("/admin/me"); } catch { localStorage.removeItem("adminToken"); location.href = "login.html"; await new Promise(() => {}); }
}
