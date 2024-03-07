import mongo, {  } from "./lib/mongo.js";

import logger from './lib/logging.js'

const addrToAdd = [ 'localhost:27013']
const addrToRemove = []


test2w()
try {
  test2w()
  var {db,close} = mongo.getDb()
  test2w()
  if (addrToAdd.length > 0 || addrToRemove.length > 0) {
    test2w();
    // await addNewReplSetMembers(db, addrToAdd,addrToRemove,false)
    (false) ? logger.warn({addrToAdd,addrToRemove}, 'Replica set recreation forced')
            : logger.info({addrToAdd,addrToRemove}, 'Replica set reconfigured')
  }
} catch (err) {
  logger.error(err)
} finally {
  if (close) await close()
}
