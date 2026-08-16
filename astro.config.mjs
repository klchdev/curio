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
      // Encrypts users' model keys. 32 bytes in base64:
      // openssl rand -base64 32
      ENCRYPTION_KEY: envField.string({ context: "server", access: "secret" }),
      // Password for /api/cron/poll. Without it the playtime tracker doesn't run
      CRON_SECRET: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      /*
       * Test accounts mean signing in as an arbitrary user, so access is
       * granted by an environment value rather than a role in the database: a
       * role can be escalated through any other hole in the app, an environment
       * variable can't. Off by default.
       */
      DEV_ACCOUNTS_ENABLED: envField.boolean({
        context: "server",
        access: "secret",
        optional: true,
        default: false,
      }),
      DEV_STEAM_IDS: envField.string({
        context: "server",
        access: "secret",
        optional: true,
        default: "",
      }),
    },
  },

  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [react()],
});
