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
const watch = new k8s.Watch(kc);

var getMongoPods = async function getPods() {

  const podRes = await k8sApi.listNamespacedPod(config.namespace, false, null, null, 
    null, process.env.MONGO_SIDECAR_POD_LABELS
  );
  return podRes.body.items
};

var watchMongoPods = ( callback ) => {

  const path = `/api/v1/namespaces/${config.namespace}/pods`;
  const watch = new k8s.Watch(kc);
  const listFn = async (event) => {
    return k8sApi.listNamespacedPod(config.namespace, false, null, null, 
      null, process.env.MONGO_SIDECAR_POD_LABELS
    )
  }
  
  return watch.watch(path,{},
    (type, apiObj, watchObj) => {
      
      const labels = config.mongoPodLabelCollection
      const podKeys = Object.keys(apiObj.metadata.labels)

      var labelsMatch = labels.every( k => podKeys.includes(k.key) && apiObj.metadata.labels[k.key] == k.value )
      if (!labelsMatch) return;;

      console.log(`Pod state change observed: ${type} - ${apiObj.metadata.name}`)
      callback() 
    }, // callback is called when state changes
    (err) => console.error(err) // done callback is called if the watch terminates normally
  )
}

module.exports = {
  getMongoPods: getMongoPods,
  watchMongoPods: watchMongoPods
};
