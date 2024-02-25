import k8s from '@kubernetes/client-node';
import config from './config.js';
import dns from 'dns'
import ip from 'ip'

import fs from 'fs';

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

export var getPodNameForNode = async (node_url) => {
  // This obtaines the pod name from the given node URL (host:port)
  // We use the actual IP to unambigously identify the pod

  // Obtain the IPs - either the node name is the IP (unlikely), or
  // we can look it up using DNS
  var url = new URL(`mongodb://${node_url}`)
  try {
    let nodeip
    if (!ip.isV4Format(url.hostname) && !ip.isV6Format(url.hostname)) {
      
      nodeip = await new Promise( (resolve,reject) => {
        dns.lookup(url.hostname, (err,address) => {
          if (err) {reject(err); return;}
            resolve(address)
        })
      }) 
    } else {
      nodeip = url.hostname
    }

    const pods = await getMongoPods();
    const pod = pods.filter( p => p.status.podIPs.some( podIp => nodeip === podIp.ip ) );
    return pod[0].metadata.name;
  } catch (err) {
    //console.error(err)
    console.warn(`Could not lookup IP from hostname to identify pod. Will use first fragment of ${url.hostname} as pod name. This might fail.`)
    return url.hostname.split('.')[0]
  }

}

export var patchPodLabels = async (podname, labels) => {

  const podRes = await k8sApi.readNamespacedPod(podname, config.namespace);
  const labelPatch = {...podRes.body.metadata.labels, ...labels}
  const patch = [
    {
        op: 'replace',
        path: '/metadata/labels',
        value: labelPatch,
    },
  ];
  const options = { headers: { 'Content-type': k8s.PatchUtils.PATCH_FORMAT_JSON_PATCH } };
  const podPatchRes = await k8sApi.patchNamespacedPod(
      podname,
      config.namespace,
      patch,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      options,
  );
  console.log('Updated pod labels: ', podname);

}

export default {
  getMongoPods: getMongoPods,
  watchMongoPods: watchMongoPods,
  getPodNameForNode: getPodNameForNode,
  patchPodLabels: patchPodLabels
};
