import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: "/work",
  cacheDir: "/work/.vite",
  plugins: [react()],
  server: {
    allowedHosts: ["student"],
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
  },
});
