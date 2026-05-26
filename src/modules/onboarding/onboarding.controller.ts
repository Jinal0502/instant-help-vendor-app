import { Response } from 'express';

import { OnboardingService } from './onboarding.service';
import { sendSuccess }       from '../../shared/utils/Response';
import { asyncHandler }      from '../../shared/utils/asyncHandler';
import { getAuthVendor }     from '../../shared/utils/AppError';
import { AuthRequest }       from '../../types/index';

import { SaveOnboardingDto } from './onboarding.validation';

export class OnboardingController {
  private service = new OnboardingService();

  // GET /vendor/onboarding/me
  public getMe = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = getAuthVendor(req);
    const data   = await this.service.getMe(id);
    sendSuccess(res, data, 'Vendor onboarding profile fetched');
  });

  // GET /vendor/onboarding/categories
  public getCategories = asyncHandler(async (_req: AuthRequest, res: Response): Promise<void> => {
    const data = await this.service.getCategories();
    sendSuccess(res, data, 'Categories fetched');
  });

  // GET /vendor/onboarding/categories/:categoryId/niches
  public getNiches = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const categoryId = req.params['categoryId'] as string;
    const data       = await this.service.getNichesByCategory(categoryId);
    sendSuccess(res, data, 'Niches fetched');
  });

  // PATCH /vendor/onboarding
  public saveOnboarding = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = getAuthVendor(req);
    const data =await this.service.saveOnboarding(id, req.body as SaveOnboardingDto);
    sendSuccess(res, data, 'Onboarding saved successfully' );
  });
}
