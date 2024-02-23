const k8s = require('@kubernetes/client-node');
var config = require('./config');
var util = require("util");

fs = require('fs');

// Nasty hack to allow intermediate cluster certs 
// TODO: make this a config option (--insecure) and/or provide anchor for cluster 
// root certificates
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const kc = new k8s.KubeConfig()
kc.loadFromCluster()
const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

var getMongoPods = async function getPods() {

  const podRes = await k8sApi.listNamespacedPod(config.namespace, false, null, null, 
    null, process.env.MONGO_SIDECAR_POD_LABELS
  );
  return podRes.body.items
};

module.exports = {
  getMongoPods: getMongoPods
};
