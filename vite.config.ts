import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
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
      "/api": {
        target: `${process.env.VITE_BACKEND_URL || "http://localhost:5000"}`,
        changeOrigin: true,
        secure: false,
      },
      "/API": {
        target: `${process.env.VITE_BACKEND_URL || "http://localhost:5000"}`,
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/API/, "/api"),
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
}));
