import mongoose from 'mongoose';

const maskMongoURI = (uri: string): string => {
  try {
    const url = new URL(uri);
    if (url.username || url.password) {
      return uri.replace(/\/\/(.*?@)/, '//*****:*****@');
    }
    return uri;
  } catch {
    return '*****';
  }
};

const connectDB = async () => {
  try {
    const options: mongoose.ConnectOptions = {
      autoIndex: process.env.NODE_ENV !== 'production', // Disable autoIndex in production
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4,
      maxPoolSize: 50,
      dbName: 'bastacasinodbv1', // Explicitly set database name
    };

    mongoose.connection.on('connected', () => {
      console.log(
        `MongoDB connection established successfully to ${mongoose.connection.db.databaseName}`,
      );
    });

    mongoose.connection.on('error', (err) => {
      console.error(`MongoDB connection error: ${err}`);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB connection disconnected');
    });

    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('MongoDB connection closed through app termination');
      process.exit(0);
    });

    const mongoURI = process.env.MONGODB_URI;
    if (!mongoURI) {
      console.error('MONGODB_URI is not defined in environment variables');
      process.exit(1);
    }
    console.log('Attempting to connect to MongoDB at:', maskMongoURI(mongoURI));

    const MAX_RETRIES = 3;
    const RETRY_DELAY = 5000;

    const connectWithRetry = async (
      retries: number = MAX_RETRIES,
    ): Promise<void> => {
      try {
        await mongoose.connect(mongoURI, options);
        await mongoose.connection.db.command({ ping: 1 });
        console.log('Database indexes ensured');
      } catch (error) {
        console.error(
          `MongoDB connection failed (attempt ${MAX_RETRIES - retries + 1}):`,
          error,
        );
        if (retries > 1) {
          console.log(`Retrying in ${RETRY_DELAY / 1000} seconds...`);
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
          return connectWithRetry(retries - 1);
        }
        console.error('Max retries reached. Exiting...');
        process.exit(1);
      }
    };

    await connectWithRetry();
  } catch (error) {
    console.error('MongoDB connection failed:', error);
    process.exit(1);
  }
};

export { connectDB };
