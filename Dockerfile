# Curio — Astro 6 SSR on the standalone node adapter.
#
# Four stages: full dependencies, build, runtime dependencies, and the image
# that actually ships. The source tree, the npm cache and the build-only
# packages stay behind in the earlier stages.

FROM node:22-alpine AS base
WORKDIR /app
# Astro's dev-time telemetry prompt has no place in a non-interactive build
ENV ASTRO_TELEMETRY_DISABLED=1


# --- dependencies for the build ----------------------------------------------
# devDependencies included, and not optionally: astro.config.mjs imports
# @tailwindcss/vite, which lives there. A production-only install can't build.
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci


# --- the build ---------------------------------------------------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Every variable in astro.config.mjs is server-side and secret, so they are
# validated when the server starts, not while it is being built — nothing
# secret has to be present here.
RUN npm run build


# --- dependencies for the runtime --------------------------------------------
FROM base AS runtime-deps
COPY package.json package-lock.json ./
# Production dependencies plus exactly one devDependency: drizzle-kit.
#
# It has to be here because the schema is applied with `db:push` and there are
# deliberately no migration files in the repo — without it nothing can create
# the tables in a fresh database, and the app has nothing to talk to.
#
# Promoting it into `dependencies` and dropping the rest of the block is the
# blunt way to say that, and it's the only one npm actually honours: asked to
# add a devDependency to a production tree it installs the package's own
# dependencies and then prunes the package itself. The version is read out of
# package.json, so the two can't drift apart. Only this throwaway stage's copy
# is edited; the real package.json is untouched.
RUN node -e "const fs=require('fs'),p=require('./package.json');p.dependencies['drizzle-kit']=p.devDependencies['drizzle-kit'];delete p.devDependencies;fs.writeFileSync('package.json',JSON.stringify(p,null,2))" \
 && npm install --omit=dev --no-audit --no-fund \
 && npm cache clean --force


# --- what actually ships ------------------------------------------------------
FROM base AS runner

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4321

COPY --from=runtime-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# start.mjs boots the built server and then knocks on /api/cron/poll so the
# playtime tracker starts without waiting for the first visitor. It reaches for
# ../dist/server/entry.mjs, so the two have to stay siblings.
COPY package.json ./
COPY scripts/start.mjs ./scripts/start.mjs

# The only source that survives into the image: drizzle-kit reads the schema
# from TypeScript, so `npm run db:push` needs these two files at run time.
COPY drizzle.config.ts ./
COPY src/db/schema.ts ./src/db/schema.ts

# node:22-alpine already ships an unprivileged `node` user
USER node

EXPOSE 4321

# The landing page answers 200 to a request with no session, which makes it the
# one honest "is the server alive" probe. wget/curl aren't installed, and node
# is right here anyway.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4321)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "scripts/start.mjs"]
