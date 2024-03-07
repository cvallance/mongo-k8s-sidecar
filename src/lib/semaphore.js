import crypto from 'crypto';
import logger from './logging.js'

class SemaphoreLockedError extends Error {

  key

  constructor(key) {
    super("Semaphore is locked")
    this.key = key
  }

}

/**
 * Creates a distributed semaphore backed by a Redis store.
 * 
 * The semaphore can be used to protect pieces of code from executing on multiple hosts.
 * 
 * Usage:
 * 
 * 1) Aquire a semaphore
 *    import redis from 'node-redis'
 *    const client = redis.createClient()
 *    
 *    const lock = await semaphore(client)
 *    try {
 *      await lock.aquire()  
 *      
 *      // do stuff
 *    } catch {
 *      // semaphore held by someone else
 *    }
 *    
 * 
 * @param {RedisClientType} client Redis client 
 * @param {*} options {ttl: time-to-live, key: semaphore key}
 * @returns 
 */
export default function semaphore(client, options = {ttl: 30, key:'semaphore:default'}) {

  const semaphoreUUID = crypto.randomUUID()
  const semaphoreKey = options.key || 'semaphore:default'
  const semaphoreTTL = options.ttl || 30 // time-to-live [sec]

  const aquire = async () => {
    const currentSemaphore = await client.get(semaphoreKey)
    if (semaphoreUUID === currentSemaphore) {
      return currentSemaphore
    }
    if (!currentSemaphore) {
      await client.set(semaphoreKey, semaphoreUUID, { EX: semaphoreTTL, NX: true})
      logger.trace({uuid: semaphoreUUID, key: semaphoreKey}, 'Setting semaphore')
      return client.get(semaphoreKey)
    }
    throw new SemaphoreLockedError()
  }

  const renew = async ( ) => {
    let currentSemaphore = await aquire()
    client.expire(semaphoreKey, semaphoreTTL,  'XX' )
    logger.trace({ttl: semaphoreTTL, key: semaphoreKey}, "renewed semaphore")
    return currentSemaphore
  }

  const release = async () => {
    const currentSemaphore = await aquire()
    if (currentSemaphore === semaphoreUUID) {
      return client.del(semaphoreKey)
    } else {
      throw new SemaphoreLockedError()
    }
  }

  return {
    semaphoreUUID,
    semaphoreTTL, 
    semaphoreKey,
    aquire,
    renew,
    release
  }

}