"use client";

import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { auth } from "~/lib/firebase";
import { getProfile, type UserProfile } from "~/lib/profile";

type AuthState = {
  user: User | null;
  profile: UserProfile | null;
  /** True until both the auth state and (if signed in) the profile are known. */
  loading: boolean;
  refreshProfile: () => Promise<UserProfile | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (next) => {
      setLoading(true);
      setUser(next);
      if (!next) {
        setProfile(null);
        setLoading(false);
        return;
      }
      getProfile(next.uid)
        .then(setProfile)
        .catch((err) => {
          console.error("Failed to load profile", err);
          setProfile(null);
        })
        .finally(() => setLoading(false));
    });
  }, []);

  const refreshProfile = useCallback(async () => {
    const current = auth.currentUser;
    const next = current ? await getProfile(current.uid) : null;
    setProfile(next);
    return next;
  }, []);

  const handleSignOut = useCallback(() => signOut(auth), []);

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, refreshProfile, signOut: handleSignOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
