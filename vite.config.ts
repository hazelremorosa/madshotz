import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

/**
 * Set by the Tauri CLI while it builds the Android app. The APK already carries
 * every asset locally, so the PWA service worker would only add a second cache
 * that can pin an old build after the app updates — leave it out there.
 */
const isTauri = Boolean(process.env.TAURI_ENV_PLATFORM);

export default defineConfig({
  plugins: [
    react(),
    !isTauri &&
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["favicon.svg"],
        manifest: {
          name: "Mad Shots",
          short_name: "Mad Shots",
          description: "A premium receipt photobooth experience.",
          theme_color: "#0b0b12",
          background_color: "#0b0b12",
          display: "fullscreen",
          orientation: "portrait",
          start_url: "/",
          icons: [
            {
              src: "favicon.svg",
              sizes: "any",
              type: "image/svg+xml",
              purpose: "any maskable",
            },
          ],
        },
      }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: true,
    // `tauri android dev` points the device at this exact port.
    port: 5173,
    strictPort: true,
  },
});
