import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_BACKEND_URL || "http://localhost:5001";
  const apiBase = env.VITE_API_BASE_URL || "/api";

  return {
    server: {
      host: true,
      port: 9000,
      hmr: {
        overlay: false,
      },
      allowedHosts: [
        "attendance.merdekabattery.com",
        "localhost",
        "127.0.0.1",
      ],
      proxy: {
        [apiBase]: {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
        "/API": {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (p: string) => p.replace(/^\/API/, "/api"),
        },
      },
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime"],
    },
    optimizeDeps: {
      include: ["@tanstack/react-query", "next-themes"],
    },
  };
});
