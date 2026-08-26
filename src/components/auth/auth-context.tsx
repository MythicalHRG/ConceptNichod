"use client";

import React, { createContext, useContext, useEffect, useState, Suspense } from "react";
import { meAction, logoutAction } from "@/app/actions/auth";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

export type AuthUser = {
  uuid: string;
  username: string;
  email: string;
  bio?: string;
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
      const newUrl = pathname + (params.toString() ? `?${params.toString()}` : "");
      router.replace(newUrl, { scroll: false });
    }
  }, [searchParams, pathname, router, setAuthModalOpen]);

  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAuthModalOpen, setAuthModalOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    meAction().then((res) => {
      if (res.user) {
        setUser(res.user);
        setAuthModalOpen(false);
      } else {
        setAuthModalOpen(true);
      }
    }).catch((err) => {
      console.error(err);
      setAuthModalOpen(true);
    });
  }, []);

  const login = (newUser: AuthUser) => {
    setUser(newUser);
    setAuthModalOpen(false); // Close modal on successful login
    router.refresh();
  };

  const logout = () => {
    logoutAction().then(() => {
      setUser(null);
      setAuthModalOpen(true);
      router.push('/');
    }).catch(console.error);
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
