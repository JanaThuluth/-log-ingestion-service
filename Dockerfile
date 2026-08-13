FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY tests ./tests

RUN npm run build

RUN cp -r src/db/migrations dist/db/migrations

EXPOSE 8080

CMD ["npm", "start"]
