import { useEffect, useRef } from "react";
import { useDispatch } from "./redux/store";
import { bootstrapAuth, sessionExpired } from "./redux/slices/authSlice";
import { registerUnauthorizedHandler } from "./services/api/authInterceptor";
import { isRestMode } from "./config/env";
import Router from "./routes";
import ThemeProvider from "./theme";
import ThemeSettings from "./components/settings";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { PATH_AUTH } from "./routes/paths";

function App() {
  const dispatch = useDispatch();
  const handling401 = useRef(false);

  useEffect(() => {
    void dispatch(bootstrapAuth());
  }, [dispatch]);

  useEffect(() => {
    if (!isRestMode()) {
      return undefined;
    }

    registerUnauthorizedHandler(() => {
      if (handling401.current) {
        return;
      }
      handling401.current = true;
      void dispatch(sessionExpired())
        .then((result) => {
          const recovered =
            sessionExpired.fulfilled.match(result) && result.payload != null;
          if (
            !recovered &&
            !window.location.pathname.startsWith("/auth/")
          ) {
            // Survive full-page reload so LoginForm can show the notice.
            try {
              sessionStorage.setItem("auth:sessionExpired", "1");
            } catch {
              // ignore quota / private mode
            }
            window.location.assign(PATH_AUTH.login);
          }
        })
        .finally(() => {
          window.setTimeout(() => {
            handling401.current = false;
          }, 1500);
        });
    });

    return () => {
      registerUnauthorizedHandler(() => undefined);
    };
  }, [dispatch]);

  return (
    <ThemeProvider>
      <ThemeSettings>
        <Router />
        <ToastContainer
          position="top-right"
          autoClose={3000}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="colored"
        />
      </ThemeSettings>
    </ThemeProvider>
  );
}

export default App;
