FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --chown=node:node package.json core.mjs adapters.mjs knowledge.mjs coordination.mjs personal-mailbox.mjs quality.mjs public-record.mjs server.mjs ./
COPY --chown=node:node web ./web
USER node
EXPOSE 8080
CMD ["node","server.mjs"]
