FROM node:latest
MAINTAINER Charles Vallance <vallance.charles@gmail.com>

COPY . /opt/cvallance/mongo-k8s-sidecar

WORKDIR /opt/cvallance/mongo-k8s-sidecar

RUN npm install

CMD ["npm", "start"]
