/**
 * Seed script — run once to populate categories and niches
 * Usage: npx ts-node src/seed/categories.seed.ts
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { config }        from '../config/index';
import { CategoryModel } from '../models/category.model';
import { NicheModel }    from '../models/niche.model';

const data = [
  {
    name: 'Mechanic',
    slug: 'mechanic',
    icon: 'wrench',
    order: 1,
    niches: [
      'Engine diagnostics & repair',
      'Clutch repair/replacement',
      'Gearbox repair',
      'Steering repair',
      'Exhaust system repair',
      'Fuel system repair',
      'Radiator repair',
      'Timing belt replacement',
      'Oil leak fixing',
      'Battery jump start',
      'Flat tire replacement',
      'On-road breakdown assistance',
      'Puncture Repair',
      'Oil Change',
      'Brake Repair',
      'Vehicle Servicing',
      'AC Repair & Gas Refill',
    ],
  },
  {
    name: 'Electrician',
    slug: 'electrician',
    icon: 'zap',
    order: 2,
    niches: [
      'Wiring & rewiring',
      'Switchboard repair',
      'Fan & light fitting',
      'Inverter & UPS repair',
      'Short circuit repair',
      'MCB/fuse replacement',
      'CCTV & security systems',
      'Home automation',
      'Generator repair',
    ],
  },
  {
    name: 'Painter',
    slug: 'painter',
    icon: 'paint-roller',
    order: 3,
    niches: [
      'Interior painting',
      'Exterior painting',
      'Texture painting',
      'Waterproofing',
      'Wood polish & varnish',
      'Wall putty & primer',
      'Stencil & design work',
    ],
  },
  {
    name: 'Plumber',
    slug: 'plumber',
    icon: 'droplet',
    order: 4,
    niches: [
      'Leakage repair',
      'Tap & pipe fitting',
      'Drainage cleaning',
      'Water tank cleaning',
      'Bathroom fitting',
      'Water heater repair',
      'RO & water purifier',
    ],
  },
  {
    name: 'Carpenter',
    slug: 'carpenter',
    icon: 'hammer',
    order: 5,
    niches: [
      'Furniture repair',
      'Door & window fitting',
      'Modular kitchen work',
      'Wardrobe fitting',
      'False ceiling',
      'Wooden flooring',
    ],
  },
  {
    name: 'Cleaning',
    slug: 'cleaning',
    icon: 'sparkles',
    order: 6,
    niches: [
      'Home deep cleaning',
      'Sofa & carpet cleaning',
      'Kitchen deep cleaning',
      'Bathroom deep cleaning',
      'Water tank cleaning',
      'Office cleaning',
      'Post-construction cleaning',
    ],
  },
  {
    name: 'AC Technician',
    slug: 'ac-technician',
    icon: 'wind',
    order: 7,
    niches: [
      'AC installation',
      'AC service & cleaning',
      'Gas refill',
      'PCB repair',
      'Cooling issue fix',
      'AC uninstallation',
    ],
  },
];

const seed = async () => {
  await mongoose.connect(config.mongo.uri);
  console.log('Connected to MongoDB');

  for (const item of data) {
    // Upsert category
    const category = await CategoryModel.findOneAndUpdate(
      { slug: item.slug },
      { name: item.name, slug: item.slug, icon: item.icon, order: item.order, isActive: true },
      { upsert: true, returnDocument: "after" },
    );

    console.log(`Category: ${category.name} (${category._id})`);

    // Upsert niches
    for (let i = 0; i < item.niches.length; i++) {
      await NicheModel.findOneAndUpdate(
        { name: item.niches[i], category: category._id },
        { name: item.niches[i], category: category._id, isActive: true, order: i },
        { upsert: true, returnDocument: "after" },
      );
    }

    console.log(`  → ${item.niches.length} niches seeded`);
  }

  console.log('Seed complete');
  await mongoose.disconnect();
};

seed().catch((err) => {
  console.error('Seed failed', err);
  process.exit(1);
});