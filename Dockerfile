ARG NODE_VERSION=26
ARG FFMPEG_VERSION=9.0.2-1

FROM mwader/static-ffmpeg:${FFMPEG_VERSION} AS ffmpeg

FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-slim AS ui
WORKDIR /ui
COPY client/package.json client/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY client/ ./
RUN npx vite build --outDir /ui/dist --emptyOutDir

FROM node:${NODE_VERSION}-slim AS deps
WORKDIR /deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --no-audit --no-fund

FROM node:${NODE_VERSION}-slim
LABEL org.opencontainers.image.title="MoeShare" \
  org.opencontainers.image.description="Selbst gehosteter ShareX-Uploader mit Weboberfläche" \
  org.opencontainers.image.url="https://moeshare.eu" \
  org.opencontainers.image.source="https://github.com/MaximilianGT500/moeshare" \
  org.opencontainers.image.licenses="MIT"
ENV NODE_ENV=production \
  PORT=3000 \
  FFMPEG_PATH=/usr/local/bin/ffmpeg
RUN apt-get update \
  && apt-get upgrade -y --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/moeshare
COPY --from=ffmpeg /ffmpeg /usr/local/bin/ffmpeg
COPY --from=deps /deps/node_modules ./node_modules
COPY --from=ui /ui/dist ./public/app
COPY public/icons ./public/icons
COPY package.json index.js cli.js ./
COPY src ./src
COPY docker/entrypoint.sh /usr/local/bin/moeshare-entrypoint
COPY docker/moeshare /usr/local/bin/moeshare
RUN chmod -R a+rX package.json index.js cli.js src public/icons \
  && chmod 755 /usr/local/bin/moeshare-entrypoint /usr/local/bin/moeshare \
  && mkdir -p db uploads
EXPOSE 3000
VOLUME ["/opt/moeshare/db", "/opt/moeshare/uploads"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT || 3000}/healthz`).then((res) => process.exit(res.ok ? 0 : 1), () => process.exit(1))"]
ENTRYPOINT ["moeshare-entrypoint"]
CMD ["node", "index.js"]
