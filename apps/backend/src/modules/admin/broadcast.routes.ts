import { Router } from 'express';

import * as ctrl from './broadcast.controller.js';

export const adminBroadcastRouter: Router = Router();

adminBroadcastRouter.post('/', ctrl.broadcast);
