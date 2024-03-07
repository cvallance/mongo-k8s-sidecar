import logger from '../lib/logging.js'
import mongo from '../lib/mongo.js'
import config from '../lib/config.js'

import diff from 'microdiff'
import moment from 'moment';

import { submitJob } from '../queues/worker-queue.js'
import { submitJob as submitPrimaryJob } from '../queues/primary-queue.js' 
import { broadcastMemberState } from '../lib/redis.js'
import { getPodNameForNode } from '../lib/k8s.js'

const unhealthySeconds = config.unhealthySeconds

/**
 * Compares the current replica set change with a prior state and reconciles changes.
 * 
 * If the state of members changes, broadcast messages are send to all hosts. Hosts will
 * adapt their behaviour in response to these messages.
 * 
 * If state and health of members members has changed, pod labels are adapted accordingly.
 * 
 * @param {*} oldState The prior state that serves as reference
 * @param {*} state The current state 
 * 
 * @returns void
 */

export async function processReplicaSetStatusChange(oldState, state) {

  try {
    // --------------------------------------------------------------------------------
    // Handle loss of primary node
    // This will post a 'recreate-replica-set' job to the worker queue. The pod picking
    // up this job, will recreate the replica set and take on the role of primary
    const hasPrimary = state.members.some( m => m.state === 1)
    if (!hasPrimary) {
      submitJob('recreate-replica-set',{})
    }

    // --------------------------------------------------------------------------------
    // Handle unhealthy nodes
    // This will post a 'recreate-replica-set' job to the worker queue. The pod picking
    // up this job, will recreate the replica set and take on the role of primary
    const unhealthy = state.members.filter( m => !m.health && moment().subtract(unhealthySeconds, 'seconds').isAfter(m.lastHeartbeatRecv) )
    const addrToRemove = unhealthy.map( m =>  m.name )
    if (addrToRemove.length > 0) submitPrimaryJob('reconfigure-replica-set',{addrToRemove})
    

    // Compute differences to last update
    const memberDiff = diff((oldState) ? oldState.members : {}, state.members)
    if (memberDiff.length === 0) return;

    // --------------------------------------------------------------------------------
    // Handle changes to member state and health
    const stateChanges = memberDiff.filter( e => 
      (e.path[1] === 'state' || e.path[1] === 'health') && 
      (e.type === 'CHANGE' || e.type === 'CREATE' ) 
    )      

    // Filter for unique members - see: https://codeburst.io/javascript-array-distinct-5edc93501dc4
    const id = stateChanges.map( s => s.path[0] ).filter( (value,index,self) => self.indexOf(value) === index )
    const hosts = id.map( i => state.members[i] )

    hosts.map( async h => submitJob('update-labels', {
      name: await getPodNameForNode(h.name), 
      state: h.stateStr, 
      health: h.health, 
      set: state.set}
    ))
    
    // --------------------------------------------------------------------------------
    // Handle changes to node states
    // This will broadcast any change or addition of state to all nodes. The nodes 
    // will leave/assume roles accordingly
    const primaryChanges = memberDiff.filter( e=> e.path[1] === 'state')
    primaryChanges.map( async (e) => {
      if (e.type === 'CHANGE' || e.type === 'CREATE' ) {
        logger.trace({member: state.members[e.path[0]].name, changes: e}, "publish to 'member-state-change'")
        await broadcastMemberState(state.members[e.path[0]].name, e.value)
      }
    })
  
  } catch (err) {
    // There are transient states that lead to failures when reading the state of the 
    // replica set. This is most likely the case when the replica set is not yet
    // initialised.
    logger.error(err, "Could not process replica-set changes.")
  } finally {
    logger.trace({ changes: memberDiff }, 'finished processing replica set changes')
  }
}

export async function  getReplicaSetStatus() {

  try {
    // --------------------------------------------------------------------------------
    // Obtain the current replica-set status
    var {db,close} = mongo.getDb()
    return await mongo.replSetGetStatus(db)
  } finally {
    if (close) close()
  }

}