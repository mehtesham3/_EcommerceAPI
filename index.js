import express from "express";
import "dotenv/config";
import helmet from 'helmet'
import db from "./db.js";
import userRoute from "./routes/userRoute.js";
import productRoute from "./routes/productRoute.js";
import orderRoute from "./routes/orderRoute.js";
import { createClient } from 'redis'
import logger from "./logger.js";
import morgan from 'morgan'

const redisClient = createClient();
redisClient.on('error', (err) => {
  logger.error("Redis client error: " + err)
  console.log("Redis Client Error: " + err)
});

await redisClient.connect();

const morganFormat = ':method :url :status :res[content-length] - :response-time ms';

const app = express();
app.use(express.json());
app.use(helmet());
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(morganFormat, {
    stream: {
      write: (message) => logger.info(message.trim())
    }
  }));
}

app.get("/", (req, res) => {
  res.send("Welcome to the E-commerce API!");
});

app.use("/auth", userRoute);
app.use("/product", productRoute);
app.use("/order", orderRoute)

app.get("/health", async (req, res) => {
  try {
    const result = await db.raw('SELECT NOW() as current_time');
    const redisStatus = await redisClient.ping();
    if (redisStatus !== 'PONG') {
      logger.error("Redis health check failed: " + redisStatus);
      return res.status(500).json({ status: "Error", message: "Redis is not healthy" });
    }
    logger.info("Health check successful: API, Database, and Redis are healthy");
    res.status(200).json({ status: "OK", message: "API & Database is healthy", time: result.rows[0].current_time, redisStatus });
  } catch (error) {
    logger.error("Failed to check health: " + error.message);
    res.status(500).json({ status: "Error", message: "Failed to check health" });
  }
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(process.env.PORT, () => {
    // console.log(`Server is running on port http://localhost:${process.env.PORT}`);
    logger.info(`Server started on port ${process.env.PORT}`);
  });
}

export { redisClient, app };