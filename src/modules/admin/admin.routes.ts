import { Router } from 'express';
import { generateCoupons, getReport, listCoupons, listOrders } from './admin.controller.js';

export const adminRoutes = Router();

adminRoutes.post('/coupons/generate', generateCoupons);
adminRoutes.get('/coupons', listCoupons);
adminRoutes.get('/orders', listOrders);
adminRoutes.get('/report', getReport);
