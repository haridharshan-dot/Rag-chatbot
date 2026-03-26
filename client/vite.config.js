import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "router-vendor": ["react-router-dom"],
          "motion-vendor": ["framer-motion"],
          "socket-vendor": ["socket.io-client"],
          "charts-vendor": ["chart.js", "react-chartjs-2"],
          "auth-vendor": ["@azure/msal-browser"],
          "pdf-vendor": ["jspdf", "jspdf-autotable"],
        },
      },
    },
  },
});
