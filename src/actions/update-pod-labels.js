import k8s, { patchPodLabels,getPodNameForNode } from "../lib/k8s.js" 
import logger from '../lib/logging.js'
import mongo from '../lib/mongo.js'

import microdiff from 'microdiff'

export async function updatePodLabels() {
  // Read replica-set state and construct current state
  const diff = microdiff(await getCurrentState(), await getDesiredState())
  logger.trace({current: await getCurrentState(), desired: await getDesiredState(), diff},'Pod label diff set')
  diff.map( d => {
    if (d.type === 'REMOVE') {
      switch (d.path[1]) {
        case 'state': patchPodLabels(d.path[0], {'replicaset.mongodb.com/state': undefined}); break;
        case 'health': patchPodLabels(d.path[0], {'replicaset.mongodb.com/health': undefined}); break;
        case 'set': patchPodLabels(d.path[0], {'replicaset.mongodb.com/set': undefined}); break;
        default: break;
      }
      logger.info({pod: d.path[0], label: d.path[1]}, 'Removed pod label')
    } else {
      switch (d.path[1]) {
        case 'state': patchPodLabels(d.path[0], {'replicaset.mongodb.com/state': d.value}); break;
        case 'health': patchPodLabels(d.path[0], {'replicaset.mongodb.com/health': d.value}); break;
        case 'set': patchPodLabels(d.path[0], {'replicaset.mongodb.com/set': d.value}); break;
        default: break;
      }
      logger.info({pod: d.path[0], label: d.path[1]}, 'Updated pod label')
    }
  })
}

async function getCurrentState() {
  const pods = await k8s.getMongoPods()
  return Object.fromEntries(pods.map( p => {
    return  [p.metadata.name, {
      state: p.metadata.labels['replicaset.mongodb.com/state'],
      health: p.metadata.labels['replicaset.mongodb.com/health'],
      set: p.metadata.labels['replicaset.mongodb.com/set']
    }]})
  )
}


async function getDesiredState() {
  try {
    var {db,close} = mongo.getDb()
    var rsStatus = await mongo.replSetGetStatus(db)
    const data = await Promise.all(rsStatus.members.map( async m => {
      return [ await getPodNameForNode(m.name), {
        state: stateDescriptions(m.state),
        health: (m.health === 1) ? 'healthy' : 'unhealthy',
        set: rsStatus.set
      }]
    }))
    logger.trace(data,'Here')
    return Object.fromEntries(data)
  } finally {
    if (close) await close()
  }
}

function stateDescriptions( state ) {
  switch (state) {
    case 1 : return 'PRIMARY'
    case 2 : return 'SECONDARY'
    case 8 : return 'UNHEALTHY/UNREACHABLE'
    default: return 'UNKNOWN'
  }
}

/**
 * Update the labels of the pod with name @param name indicating the set membership, state
 * and health of the replica set member.
 * 
 * @param {string} name The name of the pod. The pod has to be within the configured namespace
 * @param {number} state An integer indicating the state (primary=1,secondary=2,...) of the member
 * @param {number} health An integer indicating the health of the member
 * @param {string} set The name of the replica set the pod is a member of
 */
 async function setLabels({name,state,health,set}) {
    
    var podname = await getPodNameForNode(name)
    const labels = { 
      'replicaset.mongodb.com/state': state,
      'replicaset.mongodb.com/health': (health === 1) ? 'healthy' : 'unhealthy' ,
      'replicaset.mongodb.com/set': set
    }
    logger.info({ podname: podname, labels: labels }, 'patching pod labels')
    return patchPodLabels(podname, labels)

}

/**
 * Ensures that label values adhere with k8s constraints
 * 
 * k8s says: a valid label must be an empty string or consist of 
 * alphanumeric characters, '-', '_' or '.', and must start and end 
 * with an alphanumeric character (e.g. 'MyValue',  or 'my_value',  
 * or '12345', regex used for validation is
 *  '(([A-Za-z0-9][-A-Za-z0-9_.]*)?[A-Za-z0-9])?
 * 
 * @param {*} value 
 */
function filterValue(value) {
  throw new Error("Not yet implemented")
}