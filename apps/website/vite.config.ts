// Lovable already supplies TanStack Start, React, Tailwind, aliases, and Nitro.
// Override only Nitro's production target so Vercel receives the correct output.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Keep the project's custom SSR error wrapper.
    server: { entry: "server" },
  },
  nitro: {
    preset: "vercel",
  },
});
