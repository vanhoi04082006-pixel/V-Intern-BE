# Supply a reviewed node:22-bookworm-slim base by digest.
ARG NODE_IMAGE
FROM ${NODE_IMAGE}
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /runner
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund \
    && ./node_modules/.bin/playwright install --with-deps --only-shell chromium \
    && npm cache clean --force \
    && rm -rf /var/lib/apt/lists/*
COPY tester.mjs ./
USER 10001:10001
CMD ["node", "/runner/tester.mjs"]
