import mongoose, { Document, Schema, Model } from 'mongoose';

export interface INiche extends Document {
  name:     string;
  category: mongoose.Types.ObjectId;
  isActive: boolean;
  order:    number;
}

const NicheSchema = new Schema<INiche>(
  {
    name:     { type: String, required: true, trim: true },
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    isActive: { type: Boolean, default: true },
    order:    { type: Number, default: 0 },
  },
  { timestamps: true },
);

// name must be unique within a category
NicheSchema.index({ name: 1, category: 1 }, { unique: true });
NicheSchema.index({ category: 1, isActive: 1, order: 1 });

export const NicheModel: Model<INiche> =
  mongoose.model<INiche>('Niche', NicheSchema);
