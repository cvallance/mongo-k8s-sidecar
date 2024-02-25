// Central place to configure logging
import pino from 'pino'
import config from './config.js'
const logger = pino({
  level: config.loglevel,
  transport: {
    target: 'pino-pretty'
  }
})

export default logger