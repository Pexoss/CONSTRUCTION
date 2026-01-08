import mongoose from 'mongoose';
import { env } from './env';

export const connectDatabase = async (): Promise<void> => {
  try {
    await mongoose.connect(env.MONGODB_URI);
    
    mongoose.connection.on('connected', () => {
      console.log('✅ MongoDB connected successfully');
    });

    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('⚠️  MongoDB disconnected');
    });
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error);
    process.exit(1);
  }
};

export const closeDatabase = async (): Promise<void> => {
  try {
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');
  } catch (error) {
    console.error('❌ Error closing MongoDB connection:', error);
    throw error;
  }
};
