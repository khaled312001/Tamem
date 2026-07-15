import { Router } from 'express';

import {
  adminOtpVerify,
  forgotPassword,
  googleLogin,
  login,
  logout,
  otpRequest,
  otpVerify,
  refresh,
  register,
  resetPassword,
} from './auth.controller.js';

export const authRouter: Router = Router();

authRouter.post('/register', register);
authRouter.post('/login', login);
authRouter.post('/admin/otp/verify', adminOtpVerify);
authRouter.post('/google', googleLogin);
authRouter.post('/refresh', refresh);
authRouter.post('/logout', logout);
authRouter.post('/otp/request', otpRequest);
authRouter.post('/otp/verify', otpVerify);
authRouter.post('/forgot-password', forgotPassword);
authRouter.post('/reset-password', resetPassword);
