import mongoose from "mongoose";

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongoose: MongooseCache | undefined;
}

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function dbConnect() {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (mongoose.connection.readyState === 2 && cached!.promise) {
    try {
      cached!.conn = await cached!.promise;
      return cached!.conn;
    } catch {
      // Reconnect below if pending promise failed
    }
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("Please define the MONGODB_URI environment variable inside .env");
  }

  if (
    !cached!.promise ||
    mongoose.connection.readyState === 0 ||
    mongoose.connection.readyState === 3
  ) {
    const opts = {
      bufferCommands: true,
      serverSelectionTimeoutMS: 8000, // 8s timeout for cold start resilience
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      maxPoolSize: 10,
    };

    cached!.promise = mongoose
      .connect(uri, opts)
      .then((mongooseInstance) => {
        return mongooseInstance;
      })
      .catch((err) => {
        cached!.promise = null; // Don't cache rejected connection promise
        cached!.conn = null;
        throw err;
      });
  }

  try {
    cached!.conn = await cached!.promise;
  } catch (e) {
    cached!.promise = null;
    cached!.conn = null;
    throw e;
  }

  return cached!.conn;
}

export default dbConnect;
