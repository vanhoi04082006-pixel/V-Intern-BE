# Supply a reviewed node:22-bookworm-slim image by digest at build time.
ARG NODE_IMAGE
FROM ${NODE_IMAGE}
WORKDIR /opt/runtime
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY launch.mjs /runner/launch.mjs
COPY mini-module.mjs /runner/mini-module.mjs
COPY vite.config.mjs /opt/runtime/vite.config.mjs
USER 10001:10001
WORKDIR /work
CMD ["node", "/runner/launch.mjs"]
