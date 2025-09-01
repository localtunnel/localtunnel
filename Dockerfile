FROM node:22 AS build

WORKDIR /app

COPY package.json /app/
COPY package-lock.json /app/

RUN npm install

COPY ./src /app/src
COPY ./bin /app/bin
COPY ./tsconfig.json /app

RUN npm run build

FROM node:22-alpine

COPY --from=build /app/bin /app/bin
COPY --from=build /app/build /app/build
COPY --from=build /app/package.json /app/
COPY --from=build /app/package-lock.json /app/

WORKDIR /app

RUN npm install --production

ENV NODE_ENV=production
ENTRYPOINT ["node", "./bin/lt.js"]
