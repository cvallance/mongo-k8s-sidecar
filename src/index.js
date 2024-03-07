import logger from './lib/logging.js'
import mongo from './lib/mongo.js'

import { subscribeMemberState } from './lib/redis.js';
import { initialiseReplicaSet } from './actions/initialise-replica-set.js';

import { leavePrimaryRole, takeOnPrimaryRole } from './roles/primary.js';
import { takeOnWorkerRole } from './roles/worker.js';

import { submitPeriodicJob } from './queues/worker-queue.js';


logger.info('Starting up');

const never = new Promise(() => {}) // wait forever

// Ensure we update our roles
await subscribeMemberState( async (member,state) => {
  try {
    logger.trace({member,state}, "Received member-state broadcast")
    const mypodname = process.env.POD_NAME || process.env.HOSTNAME
    if ( member === mypodname ) {
        (state === 1) ? await takeOnPrimaryRole() : await leavePrimaryRole()
        await takeOnWorkerRole() // Every known member should act as worker, 
                                // this ensures that new hosts start acting as workers
    }
  } catch (err) {
    logger.error({error: err.message}, 'Error processing member-state-changes')
  }
})

try {
  var {db, close} = mongo.getDb()
  await mongo.replSetGetStatus(db)

  await takeOnWorkerRole()
  
} catch (err) {
  if (err.code && err.code == 94) {
    // The mongoDB replica set is not yet initialised. Lets do this now
    await initialiseReplicaSet()
  }
  if (err.code && err.code == 93) { 
    // The replica set is invalid - lets become the primary 
    logger.warn({message: err.message}, 'Invalid replica set.')
  } else {
    logger.error(err)
  }  
} finally {
  if (close) close()
}

// Setup periodic jobs
await submitPeriodicJob('reconcile-state', {}, "*/10 * * * * *")
await submitPeriodicJob('update-labels', {}, "*/15 * * * * *" )
await never
