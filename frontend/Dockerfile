# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# DBDump frontend — la landing publique.
#
# Le projet est en export statique Next.js (`output: "export"`), car la MÊME
# sortie sert aussi d'UI à l'app desktop (route /app, embarquée par Tauri). On ne
# lance donc PAS `next start` : on construit le site statique puis on le sert avec
# nginx. Assurez-vous que la plateforme build bien depuis ce Dockerfile (et non
# via un buildpack « nextjs » qui tenterait `next start`).
# ─────────────────────────────────────────────────────────────────────────────

# ---------- Build : export statique ----------
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Produit out/ : landing en `/` et UI desktop en `/app`.
RUN npm run build

# ---------- Runtime : nginx sert les fichiers statiques sur le port 3097 ----------
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/out /usr/share/nginx/html
EXPOSE 3097
# L'image nginx démarre nginx en avant-plan par défaut.
