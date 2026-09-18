import 'dotenv/config';
import colors from 'colors';
import connectDB from './config/db.js';
import app from './app.js';

const PORT = process.env.PORT || 3000;

// Connect to Database
connectDB();

app.listen(PORT, () => {
  console.log(colors.bgBrightMagenta.black(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`));
});

