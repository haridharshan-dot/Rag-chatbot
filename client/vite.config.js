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
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("react") || id.includes("scheduler")) return "react-vendor";
          if (id.includes("react-router")) return "router-vendor";
          if (id.includes("framer-motion")) return "motion-vendor";
          if (id.includes("socket.io-client")) return "socket-vendor";
          if (id.includes("chart.js") || id.includes("react-chartjs-2")) return "charts-vendor";
          if (id.includes("@azure/msal-browser")) return "auth-vendor";
          return "vendor";
        },
      },
    },
  },
});
