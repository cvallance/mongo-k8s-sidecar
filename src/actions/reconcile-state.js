import mongo from '../lib/mongo.js'
import k8s from '../lib/k8s.js'
import config from '../lib/config.js'
import logger from '../lib/logging.js'

import moment from 'moment'
import { submitJob as submitPrimaryJob } from '../queues/primary-queue.js'
import { submitJob } from '../queues/worker-queue.js'
import { broadcastMemberState } from '../lib/redis.js'

/**
 * Reconsiles the state between MongoDB and k8s. The job first reads the current replica 
 * set and pod state, then computes the desired state, and finally creates jobs to reconsile
 * the delta between desired and current state.
 * 
 * This job does not mutate state itself, rather it schedules mutating actions. 
 */
export async function reconcileState() {

  var currentState = []

  // Read replica-set state and construct current state
  try {
    var {db,close} = mongo.getDb()
    var pods = await k8s.getMongoPods()
    var rsStatus = await mongo.replSetGetStatus(db)

    // See: https://dev.to/devtronic/javascript-map-an-array-of-objects-to-a-dictionary-3f42
    const memberPodsMap = Object.fromEntries(rsStatus.members.map( m => {
      try {
        var pod = pods.filter( p=> { 
          var podIpAddr = getPodIpAddressAndPort(p);
          var podStableNetworkAddr = getPodStableNetworkAddressAndPort(p);
          return ( m.name === podIpAddr || m.name === podStableNetworkAddr)
        })[0]
        return [m.name, pod.metadata.name]
      } catch (err) {
        return [m.name, undefined]
      }
    }))

    // Update the states for all members - listeners will adjust roles accordingly
    await Promise.all(rsStatus.members.map( m => broadcastMemberState(memberPodsMap[m.name], m.state) ))

    currentState.push( ...rsStatus.members.map( s => { return { 
                  host: s.name, 
                  health: s.health, 
                  state: s.state,
                  lastHeartbeatRecv: s.lastHeartbeatRecv,
                  podname: memberPodsMap[s.name]
    }}))

    var addrToAdd = pods.filter( p => !currentState.some( s => s.podname === p.metadata.name) ).map( p => getPodStableNetworkAddressAndPort(p) || getPodIpAddressAndPort(p))
    var addrToRemove = currentState.filter( m => memberHasNoPod(m) || memberDefinitelyUnhealthy(m) ).map( m => m.host )
    const forceReplicaSet = !currentState.some( s => s.state === 1) 

    if (addrToAdd.length > 0 || addrToRemove.length > 0 || forceReplicaSet ) {
      logger.info({addrToAdd,addrToRemove,missingPrimary: forceReplicaSet}, 'Requesting reconfiguration of MongoDB Replica Set')
      
      if (forceReplicaSet) {
        submitJob('reconfigure-replica-set', { addrToAdd, addrToRemove, force: forceReplicaSet })
      } else {
        submitPrimaryJob('reconfigure-replica-set', { addrToAdd, addrToRemove, force: forceReplicaSet })
      }
    }
    
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

var memberDefinitelyUnhealthy = function(member) {
  return !(member.health === 1)
      && moment().subtract(config.unhealthySeconds, 'seconds').isAfter(member.lastHeartbeatRecv);
};

var memberHasNoPod = function(member) {
  return (member.podname === undefined || member.podname === null)
}