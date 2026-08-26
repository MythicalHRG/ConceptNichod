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

  if (!cached.promise) {
    cached.promise = (async () => {
      const opts = {
        bufferCommands: false,
      };

      if (!MONGODB_URI) {
        throw new Error("Please define the MONGODB_URI environment variable inside .env");
      }

      const m = await mongoose.connect(MONGODB_URI!, opts);
      return m;
    })();
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

export default dbConnect;
