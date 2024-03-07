import logger from '../lib/logging.js'
import mongo from '../lib/mongo.js'
import k8s from '../lib/k8s.js'

/**
 * Initialises the replica set. 
 * 
 * This function should only be called once in the lifetime of the MongoDB.
 * 
 */
export async function initialiseReplicaSet() {

  try {
    var {db,close} = mongo.getDb()
    
    // The mongoDB replica set is not yet initialised. Lets do this now
    logger.info("MongoDB replica set not yet initialised. Initialising now.")
    var pods = await k8s.getMongoPods()
    var primary = pods.filter( pod => pod.status.podIPs.some( ip => hostIps.some(ip) ) )

    var primaryStableNetworkAddressAndPort = k8s.getPodStableNetworkAddressAndPort(primary);
    // Prefer the stable network ID over the pod IP, if present.
    var primaryAddressAndPort = primaryStableNetworkAddressAndPort || hostIpAndPort;
    logger.trace({primary: primaryAddressAndPort}, "Start initialising replicate set")
    await mongo.initReplSet(db, primaryAddressAndPort);
    logger.info({primary: primaryAddressAndPort}, "Initialised replicate set")
    
  } finally {
    if (close) close()
  }
  
}