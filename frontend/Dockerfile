FROM node:24-alpine AS build

WORKDIR /app

ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ── Minimal nginx runtime ────────────────────────────────────────────
# Copy just the nginx binary from the official image. Build the runtime
# on a clean Alpine so we only install the libraries nginx actually
# links against (pcre2, openssl, zlib). This eliminates ~24 CVEs from
# unused packages (libxml2, libpng, curl, c-ares, libtiff, libexpat)
# that the full nginx:1.27-alpine ships for optional dynamic modules
# (xslt, image-filter, geoip) we don't use.

FROM nginx:1.27-alpine AS nginx-bin

FROM alpine:3.21

# Core runtime libraries nginx dynamically links against
RUN apk add --no-cache \
      pcre2 \
      zlib \
      libssl3 \
      libcrypto3 \
    && addgroup -g 101 -S nginx \
    && adduser -S -D -H -u 101 -h /var/cache/nginx -s /sbin/nologin -G nginx -g nginx nginx \
    && mkdir -p /var/cache/nginx/client_temp \
               /var/cache/nginx/proxy_temp \
               /var/cache/nginx/fastcgi_temp \
               /var/cache/nginx/uwsgi_temp \
               /var/cache/nginx/scgi_temp \
               /var/log/nginx \
               /etc/nginx/conf.d \
               /var/run \
    && touch /var/run/nginx.pid \
    && chown -R 101:101 /var/cache/nginx /var/log/nginx /var/run/nginx.pid

COPY --from=nginx-bin /usr/sbin/nginx /usr/sbin/nginx
COPY --from=nginx-bin /etc/nginx/mime.types /etc/nginx/mime.types

COPY frontend/nginx/nginx.conf /etc/nginx/nginx.conf
COPY frontend/nginx/rate-limit.conf /etc/nginx/conf.d/rate-limit.conf
COPY frontend/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

USER 101

EXPOSE 80

STOPSIGNAL SIGQUIT

CMD ["nginx", "-g", "daemon off;"]
