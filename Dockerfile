FROM mwader/static-ffmpeg:8.1.1@sha256:735f84b905e00d5c618b667f0b053f83b1096f5fc404c607e6134bf2275a0e0a AS media-tools
FROM node:22.12.0-bookworm@sha256:0e910f435308c36ea60b4cfd7b80208044d77a074d16b768a81901ce938a62dc AS openssl-tools
FROM node:22.12.0-bookworm-slim AS pnpm-base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV npm_config_network_concurrency=8 \
    npm_config_fetch_retries=5 \
    npm_config_fetch_retry_mintimeout=1000 \
    npm_config_fetch_retry_maxtimeout=10000 \
    npm_config_fetch_timeout=120000
# Prisma generation and runtime must agree on the OpenSSL ABI. Copy the small,
# pinned OpenSSL 3 runtime instead of resolving mutable apt repositories.
COPY --link --from=openssl-tools /usr/bin/openssl /usr/local/bin/openssl
COPY --link --from=openssl-tools /usr/lib/*-linux-gnu/libssl.so.3 /usr/lib/
COPY --link --from=openssl-tools /usr/lib/*-linux-gnu/libcrypto.so.3 /usr/lib/
COPY --link --from=openssl-tools /usr/lib/ssl /usr/lib/ssl
# Node 22.12 ships a Corepack keyring that predates the current pnpm signing
# key. Pin the repaired keyring instead of disabling signature verification.
RUN npm install --global corepack@0.31.0 \
  && corepack enable \
  && corepack prepare pnpm@10.6.1 --activate

WORKDIR /app

# Dependency resolution changes only when a workspace manifest or lockfile
# changes. Source edits must not invalidate the largest build layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/commands/package.json ./apps/commands/package.json
COPY apps/extension/package.json ./apps/extension/package.json
COPY apps/frontend/package.json ./apps/frontend/package.json
COPY apps/frontend/scripts ./apps/frontend/scripts
COPY apps/orchestrator/package.json ./apps/orchestrator/package.json
COPY apps/sdk/package.json ./apps/sdk/package.json
COPY deploy/server-runtime/package.json deploy/server-runtime/pnpm-lock.yaml ./deploy/server-runtime/
COPY patches ./patches
COPY libraries/nestjs-libraries/src/database/prisma/schema.prisma ./libraries/nestjs-libraries/src/database/prisma/schema.prisma

FROM pnpm-base AS build
RUN --mount=type=cache,id=publishly-pnpm-store,target=/pnpm/store,sharing=locked \
  pnpm install --frozen-lockfile

COPY . .

ARG NEXT_PUBLIC_BACKEND_URL
ARG BACKEND_INTERNAL_URL=http://backend:3000
ARG NEXT_PUBLIC_BRAND_NAME=Publishly
ARG NEXT_PUBLIC_SOURCE_URL
ARG NEXT_PUBLIC_SUPPORT_EMAIL
ARG NEXT_PUBLIC_PRIVACY_EMAIL
ARG NEXT_PUBLIC_LEGAL_ENTITY_NAME
ARG NEXT_PUBLIC_LEGAL_ENTITY_ADDRESS
ARG NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE
ARG NEXT_PUBLIC_GOVERNING_LAW
ARG NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY=/uploads
ARG NEXT_PUBLIC_PLAUSIBLE_DOMAIN
ARG NEXT_PUBLIC_CHROME_EXTENSION_URL
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL
ENV BACKEND_INTERNAL_URL=$BACKEND_INTERNAL_URL
ENV NEXT_PUBLIC_BRAND_NAME=$NEXT_PUBLIC_BRAND_NAME
ENV NEXT_PUBLIC_SOURCE_URL=$NEXT_PUBLIC_SOURCE_URL
ENV NEXT_PUBLIC_SUPPORT_EMAIL=$NEXT_PUBLIC_SUPPORT_EMAIL
ENV NEXT_PUBLIC_PRIVACY_EMAIL=$NEXT_PUBLIC_PRIVACY_EMAIL
ENV NEXT_PUBLIC_LEGAL_ENTITY_NAME=$NEXT_PUBLIC_LEGAL_ENTITY_NAME
ENV NEXT_PUBLIC_LEGAL_ENTITY_ADDRESS=$NEXT_PUBLIC_LEGAL_ENTITY_ADDRESS
ENV NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE=$NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE
ENV NEXT_PUBLIC_GOVERNING_LAW=$NEXT_PUBLIC_GOVERNING_LAW
ENV NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY=$NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY
ENV NEXT_PUBLIC_PLAUSIBLE_DOMAIN=$NEXT_PUBLIC_PLAUSIBLE_DOMAIN
ENV NEXT_PUBLIC_CHROME_EXTENSION_URL=$NEXT_PUBLIC_CHROME_EXTENSION_URL
ENV NODE_OPTIONS=--max-old-space-size=4096
ARG PUBLISHLY_BUILD_SCOPE=all
RUN if [ "$PUBLISHLY_BUILD_SCOPE" = "server" ]; then \
      pnpm run build:backend && pnpm run build:orchestrator; \
    elif [ "$PUBLISHLY_BUILD_SCOPE" = "all" ]; then \
      pnpm run build; \
    else \
      echo "Unsupported PUBLISHLY_BUILD_SCOPE=$PUBLISHLY_BUILD_SCOPE" >&2; \
      exit 64; \
    fi

# Install the standalone, frozen production boundary once. General lifecycle
# scripts stay disabled; only the pinned Prisma engine and bcrypt setup are run
# explicitly below. Keep every native/generation step separately classified.
FROM pnpm-base AS server-deps-install
ENV PRISMA_CLI_BINARY_TARGETS=debian-openssl-3.0.x
RUN --mount=type=cache,id=publishly-pnpm-server-runtime,target=/pnpm/store,sharing=locked \
  --mount=type=cache,id=publishly-server-runtime-modules-v1,target=/app/deploy/server-runtime/node_modules,sharing=locked \
  status=0; \
  timeout --signal=TERM --kill-after=30s 20m \
    pnpm --dir deploy/server-runtime install --prod --frozen-lockfile --ignore-workspace --ignore-scripts --prefer-offline || status=$?; \
  if [ "$status" -ne 0 ]; then \
    if [ "$status" -eq 124 ]; then \
      echo 'class=recoverable code=server_dependency_install_timeout reason=The frozen server dependency install exceeded twenty minutes.' >&2; \
    else \
      echo "class=data_problem code=server_dependency_install_failed reason=The frozen server dependency install exited with status $status." >&2; \
    fi; \
    exit "$status"; \
  fi

FROM server-deps-install AS prisma-engine-deps
RUN --mount=type=cache,id=publishly-pnpm-server-runtime,target=/pnpm/store,sharing=locked \
  --mount=type=cache,id=publishly-server-runtime-modules-v1,target=/app/deploy/server-runtime/node_modules,sharing=locked \
  status=0; \
  timeout --signal=TERM --kill-after=30s 5m \
    pnpm --dir deploy/server-runtime rebuild @prisma/engines || status=$?; \
  if [ "$status" -ne 0 ]; then \
    if [ "$status" -eq 124 ]; then \
      echo 'class=recoverable code=prisma_engine_provision_timeout reason=The pinned Prisma Linux engine provisioning exceeded five minutes.' >&2; \
    else \
      echo "class=data_problem code=prisma_engine_provision_failed reason=The pinned Prisma Linux engine provisioning exited with status $status." >&2; \
    fi; \
    exit "$status"; \
  fi

FROM prisma-engine-deps AS server-deps
RUN --mount=type=cache,id=publishly-server-runtime-modules-v1,target=/app/deploy/server-runtime/node_modules,sharing=locked \
  status=0; \
  timeout --signal=TERM --kill-after=30s 5m \
    node deploy/server-runtime/node_modules/prisma/build/index.js generate --schema \
      ./libraries/nestjs-libraries/src/database/prisma/schema.prisma || status=$?; \
  if [ "$status" -ne 0 ]; then \
    if [ "$status" -eq 124 ]; then \
      echo 'class=recoverable code=prisma_client_generate_timeout reason=Prisma client generation exceeded five minutes after explicit engine provisioning.' >&2; \
    else \
      echo "class=data_problem code=prisma_client_generate_failed reason=Prisma client generation exited with status $status." >&2; \
    fi; \
    exit "$status"; \
  fi; \
  tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner \
    -C /app/deploy/server-runtime/node_modules \
    -cf /tmp/server-runtime-node-modules.tar .

# The provider canary needs only the API and worker. Keep their compile inputs
# explicit so documentation, Compose, evidence, and operator-script edits do
# not invalidate this layer.
FROM server-deps AS server-build
RUN --mount=type=cache,id=publishly-pnpm-server-runtime,target=/pnpm/store,sharing=locked \
  --mount=type=cache,id=publishly-server-runtime-modules-v1,target=/app/deploy/server-runtime/node_modules,sharing=locked \
  status=0; \
  timeout --signal=TERM --kill-after=30s 20m \
    pnpm --dir deploy/server-runtime install --frozen-lockfile --ignore-workspace --ignore-scripts --prefer-offline || status=$?; \
  if [ "$status" -ne 0 ]; then \
    if [ "$status" -eq 124 ]; then \
      echo 'class=recoverable code=server_build_dependency_install_timeout reason=The frozen server build dependency install exceeded twenty minutes.' >&2; \
    else \
      echo "class=data_problem code=server_build_dependency_install_failed reason=The pinned server build dependency install exited with status $status." >&2; \
    fi; \
    exit "$status"; \
  fi
COPY apps/backend/src ./apps/backend/src
COPY apps/orchestrator/src ./apps/orchestrator/src
COPY libraries/helpers/src ./libraries/helpers/src
COPY libraries/nestjs-libraries/src ./libraries/nestjs-libraries/src
COPY data ./data
COPY scripts/build-server-runtime.cjs ./scripts/build-server-runtime.cjs
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN --mount=type=cache,id=publishly-server-runtime-modules-v1,target=/app/deploy/server-runtime/node_modules,sharing=locked \
  NODE_PATH=/app/deploy/server-runtime/node_modules node scripts/build-server-runtime.cjs

FROM node:22.12.0-bookworm-slim AS server-runtime

ENV NODE_ENV=production
ENV PATH=/app/node_modules/.bin:$PATH
ENV FFMPEG_PATH=/usr/local/bin/ffmpeg
ENV FFPROBE_PATH=/usr/local/bin/ffprobe

WORKDIR /app
COPY --link --from=openssl-tools /usr/bin/openssl /usr/local/bin/openssl
COPY --link --from=openssl-tools /usr/lib/*-linux-gnu/libssl.so.3 /usr/lib/
COPY --link --from=openssl-tools /usr/lib/*-linux-gnu/libcrypto.so.3 /usr/lib/
COPY --link --from=openssl-tools /usr/lib/ssl /usr/lib/ssl
COPY --link --from=media-tools /ffmpeg /ffprobe /usr/local/bin/
COPY --link --from=server-deps /app/deploy/server-runtime/package.json ./package.json
COPY --link --from=server-deps /app/deploy/server-runtime/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --link --from=server-deps /tmp/server-runtime-node-modules.tar /tmp/server-runtime-node-modules.tar
RUN mkdir -p ./node_modules \
  && tar -xf /tmp/server-runtime-node-modules.tar -C ./node_modules \
  && rm /tmp/server-runtime-node-modules.tar
COPY --link --from=server-build /app/.server-runtime/apps ./apps
COPY --link --from=server-build /app/.server-runtime/libraries ./libraries
COPY --link --from=server-build /app/.server-runtime/build-manifest.json ./server-runtime-build-manifest.json
COPY --link --from=server-build /app/data ./data
COPY --chown=node:node scripts/provision-bulk-canary.cjs ./scripts/provision-bulk-canary.cjs

USER node
CMD ["node", "--experimental-require-module", "apps/backend/src/main.js"]

FROM node:22.12.0-bookworm-slim AS runtime

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg tini \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --global corepack@0.31.0 \
  && corepack enable \
  && corepack prepare pnpm@10.6.1 --activate

WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["pnpm", "run", "start:prod:frontend"]
