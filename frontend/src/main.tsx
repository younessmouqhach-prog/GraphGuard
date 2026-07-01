import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import { I18nProvider } from "./i18n";
import { ThemeProvider } from "./hooks/useTheme";
import { AppProvider } from "./hooks/useApp";
import Layout from "./components/Layout";
import Loader from "./components/Loader";
import Dashboard from "./pages/Dashboard";
import Alerts from "./pages/Alerts";
import Rings from "./pages/Rings";
import Leaderboard from "./pages/Leaderboard";
import Simulation from "./pages/Simulation";
import Metrics from "./pages/Metrics";
import About from "./pages/About";

// The 3D network view pulls in three.js, so load it only when opened.
const GraphExplorer = lazy(() => import("./pages/GraphExplorer"));

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Dashboard /> },
      {
        path: "graph",
        element: (
          <Suspense fallback={<Loader />}>
            <GraphExplorer />
          </Suspense>
        ),
      },
      { path: "alerts", element: <Alerts /> },
      { path: "rings", element: <Rings /> },
      { path: "leaderboard", element: <Leaderboard /> },
      { path: "simulation", element: <Simulation /> },
      { path: "metrics", element: <Metrics /> },
      { path: "about", element: <About /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <AppProvider>
          <RouterProvider router={router} />
        </AppProvider>
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>
);
