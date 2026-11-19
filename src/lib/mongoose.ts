import mongoose from "mongoose";

if (!process.env.MONGODB_URI) {
  console.warn("⚠️ MONGODB_URI is not defined in environment variables.");
}

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
  if (cached!.conn) {
    if (mongoose.connection.readyState === 1) {
      return cached!.conn;
    }
    if (mongoose.connection.readyState === 0 || mongoose.connection.readyState === 3) {
      cached!.conn = null;
      cached!.promise = null;
    }
  }

  if (!cached!.promise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error(
        "Please define the MONGODB_URI environment variable inside .env.local"
      );
    }

    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 10,
    };

    cached!.promise = mongoose.connect(uri, opts).then((mongooseInstance) => {
      return mongooseInstance;
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
