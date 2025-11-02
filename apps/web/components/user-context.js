"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";

const UserContext = createContext({
  user: null,
  setUser: () => {},
  isHydrated: false
});

const STORAGE_KEY = "wizard:user";

export function UserProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      console.log("Loading user from localStorage:", stored ? "Found" : "Not found");
      if (stored) {
        const parsed = JSON.parse(stored);
        console.log("Parsed user:", parsed);
        setUserState(parsed);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("Failed to parse stored user", error);
    } finally {
      // Mark as hydrated whether we found a user or not
      setIsHydrated(true);
    }
  }, []);

  const setUser = useCallback((nextUser) => {
    console.log("Setting user:", nextUser);
    setUserState(nextUser);
    if (nextUser) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
      console.log("User saved to localStorage");
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
      console.log("User removed from localStorage");
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      setUser,
      isHydrated
    }),
    [user, setUser, isHydrated]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  return useContext(UserContext);
}
