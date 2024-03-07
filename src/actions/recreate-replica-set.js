import mongo from '../lib/mongo.js'
import k8s from '../lib/k8s.js'

import config from '../lib/config.js'
import { reconfigureReplicaSet } from './reconfigure-replica-set.js';

import moment from 'moment';

var unhealthySeconds = config.unhealthySeconds;

export async function recreateReplicaSet() {

  try {
    var {db,close} = mongo.getDb()
    const rsStatus = mongo.replSetGetStatus(db)
    const members = rsStatus.members || []

    const pods = (await k8s.getMongoPods()).filter( p => p.status.phase === 'Running')

    const addrToAdd = pods.map( pod => {
      var podIpAddr = getPodIpAddressAndPort(pod);
      var podStableNetworkAddr = getPodStableNetworkAddressAndPort(pod);
      return {podIpAddr,podStableNetworkAddr}
    }).filter( v  => {
      return !members.some( member => member.name === v.podIpAddr || member.name === v.podStableNetworkAddr)
    }).map(v => v.podStableNetworkAddr || v.podIpAddr)

    const addrToRemove = members.filter( member => {
      !member.health && moment().subtract(unhealthySeconds, 'seconds').isAfter(member.lastHeartbeatRecv);
    })

    reconfigureReplicaSet(addrToAdd,addrToRemove,true)

  } finally {
    if (close) close()
  }

}

/**
 * @param pod this is the Kubernetes pod, containing the info.
 * @returns string - podIp the pod's IP address with the port from config attached at the end. Example
 * WWW.XXX.YYY.ZZZ:27017. It returns undefined, if the data is insufficient to retrieve the IP address.
 */
var getPodIpAddressAndPort = function(pod) {
  if (!pod || !pod.status || !pod.status.podIP) {
    return;
  }

  return pod.status.podIP + ":" + config.mongoPort;
};

/**
 * Gets the pod's address. It can be either in the form of
 * '<pod-name>.<mongo-kubernetes-service>.<pod-namespace>.svc.cluster.local:<mongo-port>'. See:
 * <a href="https://kubernetes.io/docs/concepts/abstractions/controllers/statefulsets/#stable-network-id">Stateful Set documentation</a>
 * for more details. If those are not set, then simply the pod's IP is returned.
 * @param pod the Kubernetes pod, containing the information from the k8s client.
 * @returns string the k8s MongoDB stable network address, or undefined.
 */
var getPodStableNetworkAddressAndPort = function(pod) {
  if (!config.k8sMongoServiceName || !pod || !pod.metadata || !pod.metadata.name || !pod.metadata.namespace) {
    return;
  }

  var clusterDomain = config.k8sClusterDomain;
  var mongoPort = config.mongoPort;
  return pod.metadata.name + "." + config.k8sMongoServiceName + "." + pod.metadata.namespace + ".svc." + clusterDomain + ":" + mongoPort;
};
