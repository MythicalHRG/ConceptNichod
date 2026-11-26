"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState, Suspense } from "react";
import { meAction, logoutAction } from "@/app/actions/auth";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

export type AuthUser = {
  uuid: string;
  username: string;
  email: string;
  bio?: string | null;
  fullName?: string | null;
  gender?: string | null;
  dob?: string | null;
  classLevel?: string | null;
  examFocus?: string | null;
  city?: string | null;
  futureCollege?: string | null;
  snapchat?: string | null;
  instagram?: string | null;
};

interface AuthContextType {
  user: AuthUser | null;
  isLoggedIn: boolean;
  isAuthReady: boolean;
  login: (user: AuthUser) => void;
  logout: () => Promise<void>;
  isAuthModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AUTH_SYNC_CHANNEL = "conceptnichod-auth-sync";
const AUTH_SYNC_STORAGE_KEY = "conceptnichod-auth-event";

function announceAuthChange(type: "login" | "logout") {
  const message = { type, nonce: Date.now() };
  try {
    const channel = new BroadcastChannel(AUTH_SYNC_CHANNEL);
    channel.postMessage(message);
    channel.close();
  } catch {}
  try {
    window.localStorage.setItem(AUTH_SYNC_STORAGE_KEY, JSON.stringify(message));
  } catch {}
}


function AuthParamsHandler({
  setAuthModalOpen,
  isAuthReady,
  user,
}: {
  setAuthModalOpen: (open: boolean) => void;
  isAuthReady: boolean;
  user: AuthUser | null;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Only handle query parameter once initial session restoration has settled
    if (!isAuthReady) return;

    if (searchParams.get("login") === "true") {
      // Only pop open the login dialog if the user is truly unauthenticated
      if (!user) {
        setAuthModalOpen(true);
      }

      // Clean up the URL parameter
      const params = new URLSearchParams(searchParams.toString());
      params.delete("login");
      const newQuery = params.toString();
      const newUrl = newQuery ? `${pathname}?${newQuery}` : pathname;
      router.replace(newUrl, { scroll: false });
    }
  }, [searchParams, pathname, router, setAuthModalOpen, isAuthReady, user]);

  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const userRef = useRef<AuthUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const hasLocalAuthChange = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isAuthModalOpen, setAuthModalOpen] = useState(false);

  useEffect(() => {
    userRef.current = user;
  }, [user]);
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    let lastHandledNonce = 0;

    const handleAuthChange = (message: { type?: string; nonce?: number } | null | undefined) => {
      if (!message || (message.type !== "login" && message.type !== "logout") ||
          typeof message.nonce !== "number" || message.nonce <= lastHandledNonce) return;
      lastHandledNonce = message.nonce;
      hasLocalAuthChange.current = true;
      userRef.current = null;
      setUser(null);
      setIsAuthReady(false);
      setAuthModalOpen(false);
      window.location.replace(message.type === "logout" ? "/?login=true" : "/dashboard");
    };

    try {
      channel = new BroadcastChannel(AUTH_SYNC_CHANNEL);
      channel.onmessage = (event) => handleAuthChange(event.data);
    } catch {}

    const onStorage = (event: StorageEvent) => {
      if (event.key !== AUTH_SYNC_STORAGE_KEY || !event.newValue) return;
      try {
        handleAuthChange(JSON.parse(event.newValue));
      } catch {}
    };
    window.addEventListener("storage", onStorage);

    return () => {
      channel?.close();
      window.removeEventListener("storage", onStorage);
    };
  }, []);


  useEffect(() => {
    let active = true;

    const scheduleRetry = (nextAttempt: number) => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        if (active && !hasLocalAuthChange.current) {
          restoreSession(nextAttempt);
        }
      }, 600);
    };

    const restoreSession = async (attempt = 1) => {
      try {
        const res = await meAction();
        if (!active || hasLocalAuthChange.current) return;

        if (res?.user) {
          userRef.current = res.user;
          setUser(res.user);
          setIsAuthReady(true);
          return;
        }

        // Transient DB wake-up or connection delay: retry before finalizing
        if (res?.error && attempt < 2) {
          scheduleRetry(attempt + 1);
          return;
        }

        userRef.current = null;
        setUser(null);
        setIsAuthReady(true);
      } catch (error) {
        console.error("Unable to restore the current session:", error);
        if (attempt < 2) {
          scheduleRetry(attempt + 1);
          return;
        }
        if (active && !hasLocalAuthChange.current) {
          userRef.current = null;
          setUser(null);
          setIsAuthReady(true);
        }
      }
    };

    restoreSession();

    return () => {
      active = false;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []);

  const login = useCallback((newUser: AuthUser) => {
    hasLocalAuthChange.current = true;
    userRef.current = newUser;
    setUser(newUser);
    setIsAuthReady(true);
    setAuthModalOpen(false);
    announceAuthChange("login");
    // A different account may have different private server-rendered data.
    // Navigate and refresh so no prior account route/cache remains visible.
    window.location.replace("/dashboard");
  }, []);

  const logout = useCallback(async () => {
    hasLocalAuthChange.current = true;
    userRef.current = null;
    try {
      await logoutAction();
    } catch (error) {
      console.error("Logout action error:", error);
    } finally {
      setUser(null);
      setIsAuthReady(true);
      setAuthModalOpen(true);
      announceAuthChange("logout");
      // Never leave a logged-out user on a previously rendered private page.
      window.location.replace("/?login=true");
    }
  }, []);

  const safeSetAuthModalOpen = useCallback((open: boolean) => {
    setAuthModalOpen(open);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoggedIn: !!user,
        isAuthReady,
        login,
        logout,
        isAuthModalOpen,
        setAuthModalOpen: safeSetAuthModalOpen,
      }}
    >
      <Suspense fallback={null}>
        <AuthParamsHandler
          setAuthModalOpen={safeSetAuthModalOpen}
          isAuthReady={isAuthReady}
          user={user}
        />
      </Suspense>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
