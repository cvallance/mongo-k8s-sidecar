'use strict';

const fs = require('fs');

const Client = require('node-kubernetes-client');

const config = require('./config');


const readToken = fs.readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/token');

const client = new Client({
  host: config.k8sROServiceAddress,
  namespace: config.k8sNamespace,
  protocol: 'https',
  version: 'v1',
  token: readToken
});

const getMongoPods = () => new Promise((resolve, reject) => {
  client.pods.get((err, podResult) => {
    if (err) return reject(err);

    let pods = [];
    for (let j in podResult) {
      pods = pods.concat(podResult[j].items);
    }
    const labels = config.k8sMongoPodLabelCollection;
    let results = [];
    for (let i in pods) {
      let pod = pods[i];
      if (podContainsLabels(pod, labels)) {
        results.push(pod);
      }
    }

    resolve(results);
  });
});

const podContainsLabels = (pod, labels) => {
  if (!pod.metadata || !pod.metadata.labels) return false;

  for (let i in labels) {
    const kvp = labels[i];
    if (!pod.metadata.labels[kvp.key] || pod.metadata.labels[kvp.key] !== kvp.value) {
      return false;
    }
  }

  return true;
};

module.exports = {
  getMongoPods
};
