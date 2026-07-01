import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev proxy: the React app talks to "/api" which is forwarded to FastAPI.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: false, // auto-pick the next free port if 5180 is taken
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
