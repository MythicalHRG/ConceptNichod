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
  isDiscoverable?: boolean;
  shareProgress?: boolean;
  shareSocialLinks?: boolean;
  shareLocation?: boolean;
  allowIncomingMessages?: boolean;
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

function AuthParamsHandler({ setAuthModalOpen }: { setAuthModalOpen: (open: boolean) => void }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (searchParams.get("login") === "true") {
      setAuthModalOpen(true);
      
      // Clean up the URL parameter
      const params = new URLSearchParams(searchParams.toString());
      params.delete("login");
      const newQuery = params.toString();
      const newUrl = newQuery ? `${pathname}?${newQuery}` : pathname;
      router.replace(newUrl, { scroll: false });
    }
  }, [searchParams, pathname, router, setAuthModalOpen]);

  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const hasLocalAuthChange = useRef(false);
  const [isAuthModalOpen, setAuthModalOpen] = useState(false);

  useEffect(() => {
    let active = true;
    meAction()
      .then((res) => {
        if (active && !hasLocalAuthChange.current) setUser(res.user ?? null);
      })
      .catch((error) => {
        console.error("Unable to restore the current session:", error);
        if (active && !hasLocalAuthChange.current) setUser(null);
      })
      .finally(() => {
        if (active) setIsAuthReady(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const login = (newUser: AuthUser) => {
    hasLocalAuthChange.current = true;
    setUser(newUser);
    setIsAuthReady(true);
    setAuthModalOpen(false);
  };

  const logout = async () => {
    hasLocalAuthChange.current = true;
    await logoutAction();
    setUser(null);
    setIsAuthReady(true);
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
        setAuthModalOpen,
      }}
    >
      <Suspense fallback={null}>
        <AuthParamsHandler setAuthModalOpen={setAuthModalOpen} />
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
