const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000/api";
export const WS_BASE = import.meta.env.VITE_WS_URL || "http://localhost:4000";

export function getStoredToken(): string | null {
  return localStorage.getItem("eventkit_token");
}

export function setStoredToken(token: string | null) {
  if (token) localStorage.setItem("eventkit_token", token);
  else localStorage.removeItem("eventkit_token");
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function uploadFile(file: File): Promise<{ url: string; fileName: string }> {
  const form = new FormData();
  form.append("file", file);
  return apiFetch<{ url: string; fileName: string }>("/uploads", {
    method: "POST",
    body: form,
  });
}

export function formatINR(amount: number | string | null | undefined): string {
  const num = Number(amount || 0);
  return `₹${num.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}
