import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function dbConnect() {
  if (mongoose.connection.readyState >= 1) {
    return mongoose;
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!MONGODB_URI) {
    throw new Error("Please define the MONGODB_URI environment variable inside .env");
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10000, // Increase timeout to 10s for cold starts
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      return mongoose;
    }).catch(async (e) => {
      console.warn("MongoDB initial connection failed, retrying once in 2 seconds...", e.message);
      cached.promise = null;
      // Retry once after a 2-second delay for Atlas Serverless cold starts
      await new Promise(resolve => setTimeout(resolve, 2000));
      return mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
        return mongoose;
      });
    }).catch(e => {
      cached.promise = null;
      throw e;
    });
  }
  
  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }
  
  return cached.conn;
}

export default dbConnect;
