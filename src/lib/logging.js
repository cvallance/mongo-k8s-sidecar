// Central place to configure logging
import pino from 'pino'
import pinoElastic from 'pino-elasticsearch'
import multistream from 'pino-multi-stream'

const logConfig = {
  elastic : { 
    url: process.env.LOG_ELASTIC_URL || undefined, 
    apikey: process.env.LOG_ELASTIC_APIKEY || undefined,
    index: process.env.LOG_ELASTIC_INDEX || 'log-mongodb-replicaset'
  }
}

var streams = [{ stream: process.stdout }] // this writes to STDOUT 

if (logConfig.elastic.url && logConfig.elastic.apikey) {
  console.log('Streaming logs to elastic')
  const streamToElastic = pinoElastic({
    index: logConfig.elastic.index,
    node: logConfig.elastic.url,
    auth: {
      akiKey: logConfig.elastic.apikey
    },
    esVersion: 7,
    flushBytes: 1000
  })
  streams.push({ stream: streamToElastic, level: process.env.LOG_LEVEL || 'info' })
}

const logger = (process.env.NODE_ENV === 'dev') ? pino({
  level: process.env.LOG_LEVEL || 'trace',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
}) : multistream({streams})
  
  

export default logger