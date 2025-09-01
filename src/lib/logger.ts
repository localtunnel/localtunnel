import winston from 'winston';
const { combine, timestamp, label, printf, colorize } = winston.format;

const myFormat = printf(({ level, message, label, timestamp }) => {
  return `${timestamp} [${label}] ${level}: ${message}`;
});

export const newLogger = (name = 'default') => {
  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(
      label({ label: name }),
      timestamp(),
      colorize(),
      myFormat
    ),
    transports: [
      new winston.transports.Console()
    ],
  })
}

const logger = newLogger('default');

export default logger