import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import {
  errorMiddleware,
  notFoundMiddleware,
} from './middlewares/error.middleware.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

app.get('/health', (_request, response) => {
  response.status(200).json({ status: 'ok' });
});

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
