# Minimal local-development image for the SentinelOps skeleton.
# No production secrets or credentials are baked into this image.
FROM node:20-alpine

WORKDIR /workspace

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "health"]
