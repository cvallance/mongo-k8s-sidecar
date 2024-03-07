import { setCacheValue,getCacheValue } from "./lib/redis.js"
import redis from 'redis'
import logger from "./lib/logging.js"


logger.info("starting tests")

const cache = redis.createClient({url: "redis://localhost:6379"})
await cache.connect();
await cache.set("test","test-value-sgf")
let result1 = await cache.get("test")
logger.info({result: result1},`returned value: ${result1}`)

await setCacheValue("test","test-value-wet")
let result = await getCacheValue("test")
logger.info({result: result}, `returned value: ${result}`)
logger.info("finishing tests")
