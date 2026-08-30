FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json ./

# npm omite del lockfile generado en Windows los binarios opcionales de Linux.
# El builder resuelve el árbol desde package.json en su propia plataforma, sin
# declarar ni instalar manualmente paquetes específicos de plataforma.
RUN npm install --include=optional

COPY . .

ARG VITE_API_URL=http://localhost:3000/api
ARG VITE_DEV_BUSINESS_ID
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_DEV_BUSINESS_ID=$VITE_DEV_BUSINESS_ID

RUN npm run build


FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -q -O /dev/null http://127.0.0.1/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
