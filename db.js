import knex from 'knex'
import config from "./knexfile.js";
import "dotenv/config"
import logger from './logger.js';

let isTest = false;
// const db = knex(config.development);
if (process.env.NODE_ENV === 'test') {
  isTest = true;
  // console.log("Using test database configuration");
  logger.info("Using test database configuration");
}
const db = isTest ? knex(config.test) : knex(config.development);

export default db;