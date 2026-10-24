# Multi-stage Dockerfile for BrandGuard AI React Frontend

# Stage 1: Build static distribution
FROM node:20-alpine AS builder

WORKDIR /app

# Build arguments for environment variables
ARG VITE_API_URL=/api
ARG VITE_ENABLE_DEMO_ACCOUNTS=false

ENV VITE_API_URL=$VITE_API_URL \
    VITE_ENABLE_DEMO_ACCOUNTS=$VITE_ENABLE_DEMO_ACCOUNTS

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

# Stage 2: High-performance Nginx production web server
FROM nginx:1.25-alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80 || exit 1

CMD ["nginx", "-g", "daemon off;"]
