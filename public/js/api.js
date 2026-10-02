// Single place for all server calls. Admin token (if any) is attached automatically.
export async function api(path, method = "GET", body) {
  const token = localStorage.getItem("adminToken");
  const res = await fetch("/api" + path, { method, headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path.startsWith("/admin") && path !== "/admin/login") { localStorage.removeItem("adminToken"); location.href = "/admin/login.html"; }
  if (!res.ok) { const e = new Error(data.error || "Request failed"); e.status = res.status; e.code = data.code; throw e; }
  return data;
}
