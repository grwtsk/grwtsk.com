FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
RUN command -v setpriv
COPY --chown=node:node package.json core.mjs adapters.mjs knowledge.mjs coordination.mjs personal-mailbox.mjs quality.mjs public-record.mjs volume-store.mjs github-first.mjs writing-review.mjs report-review.mjs report-lifecycle.mjs review-improvement.mjs read-only-recovery.mjs server.mjs container-start.sh ./
COPY --chown=node:node web ./web
COPY --chown=node:node signals ./signals
USER node
EXPOSE 8080
CMD ["sh","container-start.sh"]
