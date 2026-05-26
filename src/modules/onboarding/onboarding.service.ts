import { Types } from 'mongoose';

import { VendorModel }   from '../../models/vendor.model';
import { CategoryModel } from '../../models/category.model';
import { NicheModel }    from '../../models/niche.model';
import { AppError }      from '../../shared/utils/AppError';
import { logger }        from '../../logger/index';

import { SaveOnboardingDto } from './onboarding.validation';

export class OnboardingService {

  // ── GET /vendor/onboarding/me ─────────────────────────────
  public async getMe(vendorId: string) {
    const vendor = await VendorModel.findById(vendorId)
      .select('name phone categories niches serviceRadius businessProfile nightShift onboardingCompleted')
      .populate('categories', 'name slug icon')
      .lean();

    if (!vendor) throw AppError.notFound('Vendor');

    return vendor;
  }

  // ── GET /vendor/onboarding/categories ────────────────────
  public async getCategories() {
    const categories = await CategoryModel.find({ isActive: true })
      .select('name slug icon order')
      .sort({ order: 1 })
      .lean();

    return categories;
  }

  // ── GET /vendor/onboarding/categories/:categoryId/niches ─
  public async getNichesByCategory(categoryId: string) {
    if (!Types.ObjectId.isValid(categoryId)) {
      throw AppError.badRequest('Invalid category ID', 'INVALID_CATEGORY_ID');
    }

    const category = await CategoryModel.findOne({
      _id:      categoryId,
      isActive: true,
    }).lean();

    if (!category) throw AppError.notFound('Category');

    const niches = await NicheModel.find({
      category: new Types.ObjectId(categoryId),
      isActive: true,
    })
      .select('name order')
      .sort({ order: 1 })
      .lean();

    return niches;
  }

  // ── PATCH /vendor/onboarding ──────────────────────────────
// ── PATCH /vendor/onboarding ──────────────────────────────
public async saveOnboarding(vendorId: string, dto: SaveOnboardingDto) {

    // Verify vendor exists
    const vendor = await VendorModel.findById(vendorId)
      .select('onboardingCompleted')
      .lean();

    if (!vendor) {
      throw AppError.notFound('Vendor');
    }

    // Prevent onboarding resubmission
    if (vendor.onboardingCompleted) {
      throw AppError.badRequest(
        'Onboarding already completed',
        'ONBOARDING_COMPLETED',
      );
    }

    // Verify category exists and is active
    const category = await CategoryModel.findOne({
      _id: dto.categoryId,
      isActive: true,
    }).lean();

    if (!category) {
      throw AppError.notFound('Category');
    }

    // Convert niche IDs
    const nicheObjectIds = dto.niches.map(
      id => new Types.ObjectId(id),
    );

    // Verify all niches belong to selected category
    const validNiches = await NicheModel.find({
      _id: { $in: nicheObjectIds },
      category: new Types.ObjectId(dto.categoryId),
      isActive: true,
    })
      .select('_id name')
      .lean();

    if (validNiches.length !== dto.niches.length) {
      throw AppError.badRequest(
        'One or more selected services are invalid or do not belong to the selected category',
        'INVALID_NICHES',
      );
    }

    // Store niche names
    const nicheNames = validNiches.map(n => n.name);

    // Update onboarding
    const updatedVendor = await VendorModel.findByIdAndUpdate(
      vendorId,
      {
        $set: {
          categories: [new Types.ObjectId(dto.categoryId)],

          niches: nicheNames,

          serviceRadius: dto.serviceRadius,

          'businessProfile.workingStart':
            dto.workingHours.start,

          'businessProfile.workingEnd':
            dto.workingHours.end,

          'nightShift.enabled':
            dto.nightShift.enabled,

          'nightShift.start':
            dto.nightShift.enabled
              ? dto.nightShift.start
              : undefined,

          'nightShift.end':
            dto.nightShift.enabled
              ? dto.nightShift.end
              : undefined,

          onboardingCompleted: true,
        },
      },
      {
        returnDocument: 'after',
      },
    )
      .select(`
        name
        phone
        categories
        niches
        serviceRadius
        businessProfile
        nightShift
        onboardingCompleted
      `)
      .populate('categories', 'name slug icon')
      .lean();

    if (!updatedVendor) {
      throw AppError.notFound('Vendor');
    }

    logger.info('Vendor onboarding saved', {
      vendorId,
    });

    return {
      id: updatedVendor._id,

      name: updatedVendor.name,

      phone: updatedVendor.phone,

      category:
        updatedVendor.categories?.[0] ?? null,

      niches: validNiches.map(n => ({
        id: n._id,
        name: n.name,
      })),

      serviceRadius:
        updatedVendor.serviceRadius,

      workingHours: {
        start:
          updatedVendor.businessProfile?.workingStart,

        end:
          updatedVendor.businessProfile?.workingEnd,
      },

      nightShift:
        updatedVendor.nightShift,

      onboardingCompleted:
        updatedVendor.onboardingCompleted,
    };
  }
}
