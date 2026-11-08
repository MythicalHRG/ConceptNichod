"use client";

import React, { createContext, useContext, useEffect, useRef, useState, Suspense } from "react";
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
  logout: () => void;
  isAuthModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
  const [isAuthModalOpen, setAuthModalOpen] = useState(false);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    let active = true;

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
          setTimeout(() => {
            if (active && !hasLocalAuthChange.current) {
              restoreSession(attempt + 1);
            }
          }, 600);
          return;
        }

        userRef.current = null;
        setUser(null);
        setIsAuthReady(true);
      } catch (error) {
        console.error("Unable to restore the current session:", error);
        if (attempt < 2) {
          setTimeout(() => {
            if (active && !hasLocalAuthChange.current) {
              restoreSession(attempt + 1);
            }
          }, 600);
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
    };
  }, []);

  const login = (newUser: AuthUser) => {
    hasLocalAuthChange.current = true;
    userRef.current = newUser;
    setUser(newUser);
    setIsAuthReady(true);
    setAuthModalOpen(false);
  };

  const logout = async () => {
    hasLocalAuthChange.current = true;
    userRef.current = null;
    await logoutAction();
    setUser(null);
    setIsAuthReady(true);
    setAuthModalOpen(true);
  };

  const safeSetAuthModalOpen = (open: boolean) => {
    setAuthModalOpen(open);
  };

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
