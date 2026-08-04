// @ts-check
import { defineConfig } from "astro/config";
import { envField } from "astro/config";
import node from "@astrojs/node";
import tailwindcss from "@tailwindcss/vite";

import react from "@astrojs/react";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),

  security: {
    checkOrigin: false,
  },

  env: {
    schema: {
      STEAM_API_KEY: envField.string({ context: "server", access: "secret" }),
      SESSION_SECRET: envField.string({ context: "server", access: "secret" }),
      DATABASE_URL: envField.string({ context: "server", access: "secret" }),
      GEMINI_API_KEY: envField.string({ context: "server", access: "secret" }),
    },
  },

  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [react()],
});
