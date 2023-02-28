FROM node:alpine
MAINTAINER Charles Vallance <vallance.charles@gmail.com>

WORKDIR /opt/shantanubansal/mongo-k8s-sidecar

COPY package.json /opt/shantanuabansal/mongo-k8s-sidecar/package.json

RUN npm install

COPY ./src /opt/shantanuabansal/mongo-k8s-sidecar/src
COPY .foreverignore /opt/shantanuabansal/.foreverignore

CMD ["npm", "start"]
