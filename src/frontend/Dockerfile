FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_AUTH_MODE
ARG VITE_AZURE_AD_TENANT_ID
ARG VITE_AZURE_AD_CLIENT_ID
ENV VITE_AUTH_MODE=$VITE_AUTH_MODE
ENV VITE_AZURE_AD_TENANT_ID=$VITE_AZURE_AD_TENANT_ID
ENV VITE_AZURE_AD_CLIENT_ID=$VITE_AZURE_AD_CLIENT_ID

ENV NODE_OPTIONS="--max-old-space-size=512"
RUN npm run build

# --- production image (nginx) ---
FROM nginx:alpine AS production

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget -qO- http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
