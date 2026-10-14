# Supply the matching mcr.microsoft.com/playwright:v1.58.2-noble image by digest.
ARG PLAYWRIGHT_IMAGE
FROM ${PLAYWRIGHT_IMAGE}
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
WORKDIR /runner
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY tester.mjs ./
USER 10001:10001
CMD ["node", "/runner/tester.mjs"]
