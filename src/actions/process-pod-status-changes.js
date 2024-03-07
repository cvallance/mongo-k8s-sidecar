import logger from '../lib/logging.js'
import k8s from '../lib/k8s.js'
import { submitJob } from '../queues/primary-queue.js';

export async function processPodChanges(oldState, state) {

  // Compute differences to last update
  const podDiff = diff((oldState) ? oldState.members : {}, state.members)
  if (podDiff.length === 0) return;

  // Only look for top-level changes to determine pods to add/delete
  let podsToAdd = podDiff.filter( c => c.path.length === 1 && c.type === 'CREATE')
  let podsToRemove = podDiff.filter( c => c.path.length === 1 && c.type === 'REMOVE')

  await submitJob('reconfigure-replica-set', {podsToAdd, podsToRemove, force: false})

  logger.trace({changes: podDiff, podsToAdd, podsToRemove}, 'finished processing pod status changes')
}


export async function getPodStatus() {
  let pods = await k8s.getMongoPods()
  return pods.map ( pod => { return { 
    name: pod.metadata.name, 
    phase: pod.status.phase, 
    ips: pod.status.pod_i_ps,
    ip: pod.status.pod_ip
  }})
}