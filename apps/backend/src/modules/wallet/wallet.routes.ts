import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';

import { adminAdjustWallet, getMyWallet } from './wallet.controller.js';

/** GET /me/wallet — current user's balance + recent tx */
export const meWalletRouter: Router = Router();
meWalletRouter.use(requireAuth);
meWalletRouter.get('/', getMyWallet);

/** POST /admin/wallets/:userId/credit — admin manual credit/debit */
export const adminWalletsRouter: Router = Router();
adminWalletsRouter.post('/:userId/credit', adminAdjustWallet);
