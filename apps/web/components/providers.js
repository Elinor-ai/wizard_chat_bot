/* eslint-disable react/jsx-no-constructed-context-values */
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { useState } from "react";
import { UserProvider } from "./user-context";
import { CompanyIntelWatcher } from "./company-intel/company-intel-watcher";

export function Providers({ children }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { refetchOnWindowFocus: false, staleTime: 30_000 }
        }
      })
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <UserProvider>
          {children}
          <CompanyIntelWatcher />
        </UserProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
