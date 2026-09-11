const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:3001/api" : "/api");

/* ─── Token helpers ─────────────────────────────────────────────
   getToken()      — reads the JWT from localStorage
   authHeaders()   — returns headers object with Bearer token + JSON type
   clearSession()  — removes token; triggers page reload → login screen
──────────────────────────────────────────────────────────────── */
const getToken = () => localStorage.getItem("authToken");

const authHeaders = () => ({
  "Content-Type": "application/json",
  ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
});

// Called automatically when any API call returns 401 (token expired / invalid)
const handleUnauthorized = () => {
  localStorage.removeItem("authToken");
  // Dispatch a custom event so App.jsx can react without a full page reload
  window.dispatchEvent(new CustomEvent("session:expired"));
};

// 403 means the token is valid but the role is insufficient — the session is
// still good, so surface the server's message rather than logging the user out.
const handleForbidden = async (res) => {
  let message = "You do not have permission to perform this action.";
  try {
    const body = await res.clone().json();
    if (body && body.error) message = body.error;
  } catch { /* non-JSON body — keep the default message */ }
  window.dispatchEvent(new CustomEvent("api:forbidden", { detail: { message } }));
  const err = new Error(message);
  err.forbidden = true;
  throw err;
};

/* ─── Fetch wrapper — automatically handles 401 / 403 ────────── */
const authFetch = async (url, options = {}) => {
  const res = await fetch(url, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  });
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error("session_expired");
  }
  if (res.status === 403) {
    await handleForbidden(res);
  }
  return res;
};

/* Reads the JSON body of a response, throwing the server's error message on
   failure so callers get something meaningful to show the user. */
const jsonOrThrow = async (res) => {
  let body = null;
  try { body = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new Error((body && body.error) || `Request failed (${res.status})`);
  return body;
};

// Random key so a double-clicked payment cannot be recorded twice.
const newIdempotencyKey = () =>
  (crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export const api = {
  /* ── Auth ── */
  login: async (username, password) => {
    const r = await fetch(`${API_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    return await r.json();
  },

  // Verify that the stored JWT is still valid on the server (used on app startup)
  verifySession: async () => {
    const token = getToken();
    if (!token) return { valid: false };
    try {
      const r = await fetch(`${API_URL}/verify-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      return await r.json();
    } catch {
      return { valid: false };
    }
  },

  /* ── User management ── */
  getUsers: async () => {
    const r = await authFetch(`${API_URL}/users?t=${Date.now()}`);
    return await r.json();
  },
  addUser: async (username, password, role) =>
    authFetch(`${API_URL}/users`, {
      method: "POST",
      body: JSON.stringify({ username, password, role }),
    }),
  deleteUser: async (id) => authFetch(`${API_URL}/users/${id}`, { method: "DELETE" }),

  /* ── Core data ──
     A failed load now THROWS instead of returning an empty dataset. Returning
     empty data made a network blip look like an empty database: the operator
     would see a blank "first day" with no opening stock, and saving it would
     overwrite the real day. App.jsx shows the error and offers a retry. */
  load: async () => {
    const r = await authFetch(`${API_URL}/load?t=${Date.now()}`);
    return await jsonOrThrow(r);
  },
  saveEntry: async (entry) =>
    authFetch(`${API_URL}/entries`, {
      method: "POST",
      body: JSON.stringify(entry),
    }),
  savePayment: async (ledgerId, amt, date, note, emptyReturned) => {
    const res = await authFetch(`${API_URL}/payments`, {
      method: "POST",
      body: JSON.stringify({
        ledgerId, amt, date, note, emptyReturned,
        idempotencyKey: newIdempotencyKey(),
      }),
    });
    return await jsonOrThrow(res);
  },

  /* ── Password management ── */
  changeMyPassword: async (currentPassword, newPassword) => {
    const res = await authFetch(`${API_URL}/change-password`, {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    return await jsonOrThrow(res);
  },
  setUserPassword: async (id, newPassword) => {
    const res = await authFetch(`${API_URL}/users/${id}/password`, {
      method: "POST",
      body: JSON.stringify({ newPassword }),
    });
    return await jsonOrThrow(res);
  },

  /* ── Admin configs ── */
  syncPrices: async (prices) =>
    authFetch(`${API_URL}/prices/sync`, { method: "POST", body: JSON.stringify(prices) }),
  syncCommissions: async (comms) =>
    authFetch(`${API_URL}/commissions/sync`, { method: "POST", body: JSON.stringify(comms) }),

  /* ── Products ── */
  getProducts: async () => {
    const r = await authFetch(`${API_URL}/products?t=${Date.now()}`);
    return await r.json();
  },
  addProduct: async (data) =>
    authFetch(`${API_URL}/products`, { method: "POST", body: JSON.stringify(data) }),
  updateProduct: async (id, data) =>
    authFetch(`${API_URL}/products/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(data) }),
  toggleProduct: async (id) =>
    authFetch(`${API_URL}/products/${encodeURIComponent(id)}/toggle`, { method: "PATCH" }),
  deleteProduct: async (id) =>
    authFetch(`${API_URL}/products/${encodeURIComponent(id)}`, { method: "DELETE" }),

  /* ── Vehicles ── */
  getVehicles: async () => {
    const r = await authFetch(`${API_URL}/vehicles?t=${Date.now()}`);
    return await r.json();
  },
  addVehicle: async (data) =>
    authFetch(`${API_URL}/vehicles`, { method: "POST", body: JSON.stringify(data) }),
  updateVehicle: async (id, data) =>
    authFetch(`${API_URL}/vehicles/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  toggleVehicle: async (id) =>
    authFetch(`${API_URL}/vehicles/${id}/toggle`, { method: "PATCH" }),
  deleteVehicle: async (id) =>
    authFetch(`${API_URL}/vehicles/${id}`, { method: "DELETE" }),

  /* ── Employees ── */
  getEmployees: async () => {
    const r = await authFetch(`${API_URL}/employees?t=${Date.now()}`);
    return await r.json();
  },
  addEmployee: async (data) =>
    authFetch(`${API_URL}/employees`, { method: "POST", body: JSON.stringify(data) }),
  updateEmployee: async (id, data) =>
    authFetch(`${API_URL}/employees/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  toggleEmployee: async (id) =>
    authFetch(`${API_URL}/employees/${id}/toggle`, { method: "PATCH" }),
  deleteEmployee: async (id) =>
    authFetch(`${API_URL}/employees/${id}`, { method: "DELETE" }),

  /* ── Godown stock ── */
  getGodownStock: async (date) => {
    const r = await authFetch(`${API_URL}/godown-stock/${date}?t=${Date.now()}`);
    return await r.json();
  },
  saveGodownStock: async (date, items) =>
    authFetch(`${API_URL}/godown-stock`, {
      method: "POST",
      body: JSON.stringify({ date, items }),
    }),

  /* ── Entries ── */
  deleteEntry: async (date) => authFetch(`${API_URL}/entries/${date}`, { method: "DELETE" }),

  /* ── Connection events module (stock + money; no customer master) ──
     Every mutating call carries a fresh idempotency key, so a double-click or
     a retried request after a timeout is recorded exactly once; the server
     answers { duplicate: true } for the repeat. All calls throw with the
     server's message on failure. */
  recordNewConnection: async (data) =>
    jsonOrThrow(await authFetch(`${API_URL}/connection-events/new`, {
      method: "POST", body: JSON.stringify({ ...data, idempotencyKey: newIdempotencyKey() }),
    })),
  recordAdditionalBottle: async (data) =>
    jsonOrThrow(await authFetch(`${API_URL}/connection-events/additional`, {
      method: "POST", body: JSON.stringify({ ...data, idempotencyKey: newIdempotencyKey() }),
    })),
  recordSurrender: async (data) =>
    jsonOrThrow(await authFetch(`${API_URL}/connection-events/surrender`, {
      method: "POST", body: JSON.stringify({ ...data, idempotencyKey: newIdempotencyKey() }),
    })),
  deleteConnectionEvent: async (id, reason) =>
    jsonOrThrow(await authFetch(`${API_URL}/connection-events/${encodeURIComponent(id)}`, { method: "DELETE", body: JSON.stringify({ reason }) })),
  getConnectionEvents: async ({ from, to, type, productId } = {}) => {
    const p = new URLSearchParams({ t: Date.now() });
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (type) p.set("type", type);
    if (productId) p.set("productId", productId);
    return jsonOrThrow(await authFetch(`${API_URL}/connection-events?${p}`));
  },
  getConnectionsSummary: async (from, to) => {
    const p = new URLSearchParams({ t: Date.now() });
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return jsonOrThrow(await authFetch(`${API_URL}/connections/reports/summary?${p}`));
  },
  getConnectionsMonthly: async ({ from, to, productId } = {}) => {
    const p = new URLSearchParams({ t: Date.now() });
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (productId) p.set("productId", productId);
    return jsonOrThrow(await authFetch(`${API_URL}/connections/reports/monthly?${p}`));
  },
  getConnectionPayments: async ({ from, to, mode, productId } = {}) => {
    const p = new URLSearchParams({ t: Date.now() });
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (mode) p.set("mode", mode);
    if (productId) p.set("productId", productId);
    return jsonOrThrow(await authFetch(`${API_URL}/connections/payments?${p}`));
  },
  getConnectionRefunds: async ({ from, to, productId } = {}) => {
    const p = new URLSearchParams({ t: Date.now() });
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (productId) p.set("productId", productId);
    return jsonOrThrow(await authFetch(`${API_URL}/connections/refunds?${p}`));
  },
  getAuditLog: async ({ from, to, entityType, entityId, limit } = {}) => {
    const p = new URLSearchParams({ t: Date.now() });
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (entityType) p.set("entityType", entityType);
    if (entityId) p.set("entityId", entityId);
    if (limit) p.set("limit", limit);
    return jsonOrThrow(await authFetch(`${API_URL}/audit?${p}`));
  },
};
