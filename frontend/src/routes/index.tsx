import { Suspense, lazy } from "react";
import type { ComponentType } from "react";
import { Navigate, useRoutes } from "react-router-dom";
import { DEFAULT_PATH } from "../config";
import LoadingScreen from "../components/LoadingScreen";
import AuthGuard from "./AuthGuard";

const Loadable =
  <P extends object>(Component: ComponentType<P>) =>
  (props: Partial<P>) => {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Component {...(props as P)} />
      </Suspense>
    );
  };

const DashboardLayout = Loadable(
  lazy(() => import("../layouts/dashboard"))
);
const MainLayout = Loadable(lazy(() => import("../layouts/main")));

export default function Router() {
  return useRoutes([
    {
      path: "/auth",
      element: <MainLayout />,
      children: [
        { element: <Navigate to="/auth/login" replace />, index: true },
        { path: "login", element: <LoginPage /> },
        { path: "register", element: <RegisterPage /> },
        { path: "reset-password", element: <ResetPasswordPage /> },
        { path: "new-password", element: <NewPasswordPage /> },
      ],
    },
    {
      path: "/",
      element: (
        <AuthGuard>
          <DashboardLayout />
        </AuthGuard>
      ),
      children: [
        { element: <Navigate to={DEFAULT_PATH} replace />, index: true },
        { path: "app", element: <GeneralApp /> },
        { path: "setting", element: <Setting /> },
        { path: "group", element: <GroupPage /> },
        { path: "call", element: <CallPage /> },
        { path: "profile", element: <ProfilePage /> },
        { path: "notifications", element: <NotificationsPage /> },
        { path: "search", element: <SearchPage /> },
        { path: "admin", element: <AdminPage /> },
        { path: "404", element: <Page404 /> },
        { path: "*", element: <Navigate to="/404" replace /> },
      ],
    },
    { path: "*", element: <Navigate to="/404" replace /> },
  ]);
}

const GeneralApp = Loadable(lazy(() => import("../pages/dashboard/GeneralApp")));
const LoginPage = Loadable(lazy(() => import("../pages/auth/Login")));
const RegisterPage = Loadable(lazy(() => import("../pages/auth/Register")));
const ResetPasswordPage = Loadable(
  lazy(() => import("../pages/auth/ResetPassword"))
);
const NewPasswordPage = Loadable(
  lazy(() => import("../pages/auth/NewPassword"))
);
const Setting = Loadable(lazy(() => import("../pages/dashboard/Settings")));
const CallPage = Loadable(lazy(() => import("../pages/dashboard/Call")));
const GroupPage = Loadable(lazy(() => import("../pages/dashboard/Group")));
const Page404 = Loadable(lazy(() => import("../pages/Page404")));
const ProfilePage = Loadable(lazy(() => import("../pages/dashboard/Profile")));
const NotificationsPage = Loadable(
  lazy(() => import("../pages/dashboard/Notifications"))
);
const SearchPage = Loadable(lazy(() => import("../pages/dashboard/Search")));
const AdminPage = Loadable(lazy(() => import("../pages/dashboard/Admin")));
