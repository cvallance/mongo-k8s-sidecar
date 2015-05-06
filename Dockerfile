FROM node:latest
MAINTAINER LePort Labs

COPY . /opt/leport/mongo-k8s-sidecar

WORKDIR /opt/leport/mongo-k8s-sidecar

RUN npm install

CMD ["npm", "start"]
