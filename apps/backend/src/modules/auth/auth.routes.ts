import { Router } from 'express';

import {
  googleLogin,
  login,
  logout,
  otpRequest,
  otpVerify,
  refresh,
  register,
} from './auth.controller.js';

export const authRouter: Router = Router();

authRouter.post('/register', register);
authRouter.post('/login', login);
authRouter.post('/google', googleLogin);
authRouter.post('/refresh', refresh);
authRouter.post('/logout', logout);
authRouter.post('/otp/request', otpRequest);
authRouter.post('/otp/verify', otpVerify);
