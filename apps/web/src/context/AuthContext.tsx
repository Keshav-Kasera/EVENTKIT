import React, { createContext, useContext, useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { UserRole } from "@eventkit/shared";
import { WS_BASE, apiFetch, getStoredToken, setStoredToken } from "../lib/api";

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  role: UserRole;
  city: string;
  organizationType?: string | null;
  billingAddress?: string | null;
  vendorProfile?: {
    id: string;
    businessName: string;
    verificationStatus: string;
    locality: string;
    safetyBufferPct: number;
    vriScore: number;
    gstNumber?: string | null;
    stockRefreshedAt: string;
  } | null;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  kind: string;
  linkUrl?: string | null;
  isRead: boolean;
  createdAt: string;
}

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  notifications: AppNotification[];
  login: (email: string, password: string) => Promise<CurrentUser>;
  demoLogin: (persona: string) => Promise<CurrentUser>;
  register: (payload: Record<string, unknown>) => Promise<CurrentUser>;
  logout: () => void;
  refreshMe: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  async function loadSession() {
    const token = getStoredToken();
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const data = await apiFetch<{ user: CurrentUser }>("/auth/me");
      setUser(data.user);
      const n = await apiFetch<{ notifications: AppNotification[] }>("/auth/notifications");
      setNotifications(n.notifications);
    } catch {
      setStoredToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSession();
  }, []);

  useEffect(() => {
    if (!user) return;
    const token = getStoredToken();
    const socket: Socket = io(WS_BASE, { auth: { token } });

    socket.on("notification:new", (note: AppNotification) => {
      setNotifications((prev) => [note, ...prev]);
    });

    return () => {
      socket.disconnect();
    };
  }, [user?.id]);

  async function login(email: string, password: string) {
    const data = await apiFetch<{ token: string; user: CurrentUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(data.token);
    setUser(data.user);
    const n = await apiFetch<{ notifications: AppNotification[] }>("/auth/notifications");
    setNotifications(n.notifications);
    return data.user;
  }

  async function demoLogin(persona: string) {
    const data = await apiFetch<{ token: string; user: CurrentUser }>("/auth/demo-login", {
      method: "POST",
      body: JSON.stringify({ persona }),
    });
    setStoredToken(data.token);
    setUser(data.user);
    const n = await apiFetch<{ notifications: AppNotification[] }>("/auth/notifications");
    setNotifications(n.notifications);
    return data.user;
  }

  async function register(payload: Record<string, unknown>) {
    const data = await apiFetch<{ token: string; user: CurrentUser }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setStoredToken(data.token);
    setUser(data.user);
    setNotifications([]);
    return data.user;
  }

  function logout() {
    setStoredToken(null);
    setUser(null);
    setNotifications([]);
  }

  async function refreshMe() {
    const data = await apiFetch<{ user: CurrentUser }>("/auth/me");
    setUser(data.user);
    const n = await apiFetch<{ notifications: AppNotification[] }>("/auth/notifications");
    setNotifications(n.notifications);
  }

  async function markNotificationRead(id: string) {
    await apiFetch(`/auth/notifications/${id}/read`, { method: "PATCH" });
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        notifications,
        login,
        demoLogin,
        register,
        logout,
        refreshMe,
        markNotificationRead,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
