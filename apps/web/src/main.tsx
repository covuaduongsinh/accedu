import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import "./styles.css";

import { AccEduProvider } from "@accedu/api/react";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { db } from "./lib/supabase";
import { router } from "./router";
import { SetupNeeded } from "./routes/setup";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 24 * 3600_000, retry: 1, refetchOnWindowFocus: true },
  },
});

// Lưu cache truy vấn để mở app ngoại tuyến vẫn xem được dữ liệu gần nhất
const persister = createSyncStoragePersister({ storage: window.localStorage, key: "accedu-cache" });

const root = createRoot(document.getElementById("root") as HTMLElement);
root.render(
  <StrictMode>
    {db ? (
      <AccEduProvider client={db}>
        <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 24 * 3600_000, buster: "v1" }}>
          <RouterProvider router={router} context={{ queryClient }} />
          <Toaster richColors position="top-right" />
        </PersistQueryClientProvider>
      </AccEduProvider>
    ) : (
      <SetupNeeded />
    )}
  </StrictMode>,
);
