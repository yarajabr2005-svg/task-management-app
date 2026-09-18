import mongoose from 'mongoose';
import colors from 'colors';

const connectDB = async () => {
  try {
    const connection = await mongoose.connect(process.env.MONGO_URI, {
      dbName: process.env.DB_NAME,
    });

    console.log(colors.bgBrightBlue.black(`MongoDB connected: ${connection.connection.host}`));
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1); // stop server if DB fails
  }
};

export default connectDB;
