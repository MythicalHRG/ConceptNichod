"use client";

import React, { createContext, useContext, useEffect, useState, Suspense } from "react";
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
  const [isAuthModalOpen, setAuthModalOpen] = useState(false);

  useEffect(() => {
    meAction().then((res) => {
      if (res.user) {
        setUser(res.user);
      }
    });
  }, []);

  const login = (newUser: AuthUser) => {
    setUser(newUser);
    setAuthModalOpen(false);
  };

  const logout = async () => {
    await logoutAction();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoggedIn: !!user,
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
