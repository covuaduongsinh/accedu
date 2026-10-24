import type { QueryClient } from "@tanstack/react-query";
import {
  createHashHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import { ChangePasswordPage } from "./routes/change-password";
import { FeaturePage } from "./routes/feature";
import { LoginPage } from "./routes/login";
import { AppShell } from "./routes/shell";
import { Dashboard } from "./routes/dashboard";
import { TenantsPage } from "./routes/tenants";
import { isTauri } from "./lib/supabase";
import { useSession } from "./lib/session";

/** Tài khoản đang dùng mật khẩu tạm thì phải đổi trước khi vào bất kỳ màn hình nào */
function RootGate() {
  const session = useSession();
  if (session?.user.user_metadata?.must_change_password === true) return <ChangePasswordPage forced />;
  return <Outlet />;
}

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootGate,
  errorComponent: ({ error, reset }) => (
    <div className="m-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-danger">
      <div className="mb-2 font-semibold">Đã xảy ra lỗi khi hiển thị màn hình</div>
      <pre className="mb-3 whitespace-pre-wrap text-xs">{error instanceof Error ? error.message : String(error)}</pre>
      <button type="button" className="rounded bg-navy-500 px-3 py-1 text-white" onClick={reset}>
        Thử lại
      </button>
    </div>
  ),
  notFoundComponent: () => <div className="m-6 text-sm text-muted">Không tìm thấy trang.</div>,
});

const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: "/login", component: LoginPage });
const passwordRoute = createRoute({ getParentRoute: () => rootRoute, path: "/doi-mat-khau", component: () => <ChangePasswordPage /> });
const tenantsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: TenantsPage });
export const tenantRoute = createRoute({ getParentRoute: () => rootRoute, path: "$tenant", component: AppShell });
const dashboardRoute = createRoute({ getParentRoute: () => tenantRoute, path: "/", component: Dashboard });
export const featureRoute = createRoute({
  getParentRoute: () => tenantRoute,
  path: "$",
  component: FeaturePage,
  validateSearch: (s: Record<string, unknown>): { edit?: string; account?: string } => ({
    ...(typeof s.edit === "string" ? { edit: s.edit } : {}),
    ...(typeof s.account === "string" ? { account: s.account } : {}),
  }),
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  passwordRoute,
  tenantsRoute,
  tenantRoute.addChildren([dashboardRoute, featureRoute]),
]);

export const router = createRouter({
  routeTree,
  context: { queryClient: undefined as unknown as QueryClient },
  // Desktop (Tauri) dùng hash history vì tài nguyên được nạp từ ổ đĩa
  ...(isTauri ? { history: createHashHistory() } : {}),
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
