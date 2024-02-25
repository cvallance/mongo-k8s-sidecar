// Central place to configure logging
import pino from 'pino'
import config from './config.js'
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty'
  }
})

export default logger