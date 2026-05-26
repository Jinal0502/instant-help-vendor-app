import { z } from 'zod';
import { Types } from 'mongoose';

const objectIdField = z
  .string()
  .trim()
  .refine(v => Types.ObjectId.isValid(v), { message: 'Invalid ObjectId' });

const timeField = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in HH:MM format (e.g. 09:00)');

// ── PATCH /vendor/onboarding ───────────────────────────────
export const SaveOnboardingSchema = z.object({
  categoryId: objectIdField,

  niches: z
    .array(objectIdField, { error: 'niches must be an array of ObjectId strings' })
    .min(1,  'Select at least one service')
    .max(20, 'You can select at most 20 services'),

  serviceRadius: z
    .number({ error: 'serviceRadius must be a number' })
    .int('serviceRadius must be a whole number')
    .min(1,  'Minimum service radius is 1 km')
    .max(20, 'Maximum service radius is 20 km'),

  workingHours: z.object({
    start: timeField,
    end:   timeField,
  }).refine(d => d.start < d.end, {
    message: 'Working end time must be after start time',
    path:    ['end'],
  }),

  nightShift: z.object({
    enabled: z.boolean(),

    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid night shift start time').optional(),
    end:   z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid night shift end time').optional(),
  }).refine(d => {
    // If night shift enabled, both start and end are required
    if (d.enabled) return !!(d.start && d.end);
    return true;
  }, {
    message: 'Night shift start and end times are required when night shift is enabled',
    path:    ['start'],
  }).refine(d => {
    // Night shift end can be next day — so "22:00" to "06:00" is valid
    // Only validate if both present
    if (d.enabled && d.start && d.end) {
      // Allow overnight: start > end means it crosses midnight — that's fine
      // Only invalid if start === end
      return d.start !== d.end;
    }
    return true;
  }, {
    message: 'Night shift start and end times cannot be the same',
    path:    ['end'],
  }),
})
.strict();

export type SaveOnboardingDto = z.infer<typeof SaveOnboardingSchema>;
