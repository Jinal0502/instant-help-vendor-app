import mongoose, { Document, Schema, Model } from 'mongoose';

export interface ICategory extends Document {
  name:     string;
  slug:     string;
  icon?:    string;
  isActive: boolean;
  order:    number;
}

const CategorySchema = new Schema<ICategory>(
  {
    name:     { type: String, required: true, unique: true, trim: true },
    slug:     { type: String, required: true, unique: true, lowercase: true, trim: true },
    icon:     { type: String },
    isActive: { type: Boolean, default: true },
    order:    { type: Number, default: 0 },
  },
  { timestamps: true },
);

CategorySchema.index({ isActive: 1, order: 1 });

export const CategoryModel: Model<ICategory> =
  mongoose.model<ICategory>('Category', CategorySchema);
