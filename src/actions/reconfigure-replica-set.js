import mongo, { addNewReplSetMembers, replSetGetConfig } from '../lib/mongo.js'
import logger from '../lib/logging.js'

export async function reconfigureReplicaSet({addrToAdd,addrToRemove,force}) {

  try {
    var {db,close} = mongo.getDb()
    
    if (addrToAdd.length > 0 || addrToRemove.length > 0) {
      await mongo.addNewReplSetMembers(db, addrToAdd,addrToRemove,force);
      (force) ? logger.warn({addrToAdd,addrToRemove}, 'Replica set recreation forced')
              : logger.info({addrToAdd,addrToRemove}, 'Replica set reconfigured')
    }
  } catch (err) {
    logger.error(err)
  } finally {
    if (close) close()
  }

}
