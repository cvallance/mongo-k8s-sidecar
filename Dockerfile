FROM node:alpine
MAINTAINER Charles Vallance <vallance.charles@gmail.com>

WORKDIR /

COPY package.json package.json

RUN npm install

COPY ./src /src
COPY .foreverignore .foreverignore

CMD ["npm", "start"]
