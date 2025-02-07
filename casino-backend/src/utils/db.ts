import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    const options: mongoose.ConnectOptions = {
      autoIndex: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4,
      maxPoolSize: 50
    };

    mongoose.connection.on('connected', () => {
      console.log('MongoDB connection established successfully');
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

    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/Casino', options);

    await mongoose.connection.db.command({ ping: 1 });
    console.log('Database indexes ensured');

  } catch (error) {
    console.error('MongoDB connection failed:', error);
    process.exit(1);
  }
};
export { connectDB };
