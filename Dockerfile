FROM rust:bookworm AS generator
RUN apt-get update && apt-get install -y --no-install-recommends cmake g++ libcmark-gfm-dev libcmark-gfm-extensions-dev libyaml-cpp-dev nlohmann-json3-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY source/parser source/parser
RUN cmake -S source/parser -B /tmp/parser -DCMAKE_BUILD_TYPE=Release && cmake --build /tmp/parser --parallel
COPY source/generator source/generator
RUN cargo build --release --manifest-path source/generator/Cargo.toml
COPY source/data source/data
RUN mkdir -p source/web && source/generator/target/release/site-generator /tmp/parser/markdown-parser source/data source/web/.generated

FROM node:22-bookworm-slim AS vite
WORKDIR /app/source/web
COPY source/web/package*.json ./
RUN npm install --no-audit --no-fund
COPY source/web/vite.config.mjs ./
COPY --from=generator /app/source/web/.generated .generated
RUN npm run build:static && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=vite --chown=node:node /app/source/web/dist ./dist
COPY --from=vite --chown=node:node /app/source/web/node_modules ./node_modules
COPY --chown=node:node source/web/package.json source/web/server.mjs ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
