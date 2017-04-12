FROM node:alpine
MAINTAINER Charles Vallance <vallance.charles@gmail.com>

WORKDIR /opt/cvallance/mongo-k8s-sidecar

COPY package.json /opt/cvallance/mongo-k8s-sidecar/package.json

RUN npm install

COPY ./src /opt/cvallance/mongo-k8s-sidecar/src
COPY .foreverignore /opt/cvallance/.foreverignore

CMD ["npm", "start"]
