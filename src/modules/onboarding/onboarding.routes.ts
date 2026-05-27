import { Router } from 'express';

import { authenticate }          from '../../shared/middlewares/auth.middleware';
import { validate }              from '../../shared/middlewares/validate.middleware';
import { OnboardingController }  from './onboarding.controller';
import { SaveOnboardingSchema }  from './onboarding.validation';

const router     = Router();
const controller = new OnboardingController();

// All onboarding routes require authentication
router.use(authenticate);

router.get('/',controller.getMe);
router.get('/categories',controller.getCategories);
router.get('/categories/:categoryId/niches', controller.getNiches);
router.patch('/', validate(SaveOnboardingSchema), controller.saveOnboarding);

export default router;
