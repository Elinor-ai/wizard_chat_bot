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
  setUser: () => {}
});

const STORAGE_KEY = "wizard:user";

export function UserProvider({ children }) {
  const [user, setUserState] = useState(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setUserState(JSON.parse(stored));
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("Failed to parse stored user", error);
    }
  }, []);

  const setUser = useCallback((nextUser) => {
    setUserState(nextUser);
    if (nextUser) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      setUser
    }),
    [user, setUser]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  return useContext(UserContext);
}
