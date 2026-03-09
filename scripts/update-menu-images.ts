/**
 * Update Taipa Menu Images Script
 *
 * SETUP:
 * 1. Create Supabase storage bucket "menu-images" (public)
 * 2. Upload images with names like: lomo-saltado.jpg, ceviche-clasico.jpg
 * 3. Update SUPABASE_STORAGE_URL if your project ID is different
 * 4. Uncomment your filenames in UPLOADED_IMAGES array
 * 5. Run: npx ts-node scripts/update-menu-images.ts
 *
 * Fuzzy matching:
 *   - "lomo-saltado.jpg" → "Lomo Saltado"
 *   - "ceviche-clasico.jpg" → ALL variants (Fish, Seafood, Shrimp, Corvina)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// =============================================================================
// CONFIGURATION - UPDATE THESE
// =============================================================================

// Your Supabase storage URL (includes restaurant folder)
const SUPABASE_STORAGE_URL = 'https://mpnruwauxsqbrxvlksnf.supabase.co/storage/v1/object/public/menu-images/taipa';

// ADD YOUR IMAGE FILENAMES HERE (uncomment as you upload them)
const UPLOADED_IMAGES: string[] = [
  // === HIGH IMPACT - grab these first ===
   'lomo-saltado.jpg',
  'ceviche-clasico.jpg',
  'arroz-con-mariscos.jpg',
  'jalea-mixta.jpg',
  'anticucho.jpg',
  'causa.jpg',
  'chaufa.jpg',
  'churrasco-a-lo-pobre.jpg',
  'aji-de-gallina.jpg',
  'tacu-tacu.jpg',

  // === APPETIZERS ===
  'causa-de-pulpo-anticuchero.jpg',
  'papa-a-la-huancaina.jpg',
  'yuca-a-la-huancaina.jpg',
  'leche-de-tigre.jpg',
  'choritos-a-la-chalaca.jpg',
  // 'conchitas-a-la-parmesana.jpg',

  // === SEAFOOD ===
  'pescado-a-lo-macho.jpg',
  'pulpo-a-la-parrilla.jpg',
  'sudado-de-pescado.jpg',
  'chicharron.jpg',
  'pasta-a-lo-macho.jpg',
  // 'parrillada-de-mariscos.jpg',

  // === SOUPS ===
  'chupe-de-camarones.jpg',
  'aguadito-de-pollo.jpg',
  'parihuela.jpg',

  // === MORE CEVICHES ===
  'ceviche-aji-amarillo.jpg',
  'ceviche-rocoto.jpg',
  'ceviche-maracuya.jpg',
  'ceviche-trio.jpg',

  // === TRADITION ===
  'tallarines-verdes.jpg',
  'seco-de-res.jpg',
  'pollo-saltado.jpg',
  'saltado-de-mariscos.jpg',

  // === DESSERTS ===
  // 'picarones.jpg',
  // 'suspiro-limeno.jpg',
  // 'alfajor.jpg',
  // 'lucuma-mousse.jpg',
  // 'chocolate-cake.jpg',
];

// Taipa restaurant IDs (both locations get same images)
const TAIPA_KENDALL_ID = 'f2cfe8dd-48f3-4596-ab1e-22a28b23ad38';
const TAIPA_CORAL_GABLES_ID = 'e29f2f0a-9d2e-46cf-941c-b87ed408e892';
const TAIPA_RESTAURANT_IDS = [TAIPA_KENDALL_ID, TAIPA_CORAL_GABLES_ID];

// =============================================================================
// MATCHING LOGIC - NO NEED TO EDIT BELOW
// =============================================================================

function normalize(str: string): string {
  return str
    .toLowerCase()
    .replaceAll(/\.(jpg|jpeg|png|webp|gif)$/gi, '')
    .replaceAll(/[áàäâ]/g, 'a')
    .replaceAll(/[éèëê]/g, 'e')
    .replaceAll(/[íìïî]/g, 'i')
    .replaceAll(/[óòöô]/g, 'o')
    .replaceAll(/[úùüû]/g, 'u')
    .replaceAll(/ñ/g, 'n')
    .replaceAll(/[-_\s]+/g, '')
    .replaceAll(/[^a-z0-9]/g, '');
}

function isMatch(imageFilename: string, menuItemName: string): boolean {
  const normalizedImage = normalize(imageFilename);
  const normalizedItem = normalize(menuItemName);

  // Exact match
  if (normalizedImage === normalizedItem) return true;

  // Image is prefix of item (handles variants like "Ceviche Clásico - Fish")
  if (normalizedItem.startsWith(normalizedImage)) return true;

  return false;
}

function buildImageUrl(filename: string): string {
  return `${SUPABASE_STORAGE_URL}/${filename}`;
}

// =============================================================================
// MAIN
// =============================================================================

async function updateMenuImages() {
  console.log('🖼️  Taipa Menu Image Updater');
  console.log('=============================\n');

  if (UPLOADED_IMAGES.length === 0) {
    console.log('⚠️  No images configured!\n');
    console.log('Edit this script and uncomment filenames in UPLOADED_IMAGES array.');
    console.log('\nExample:');
    console.log("  'lomo-saltado.jpg',");
    console.log("  'ceviche-clasico.jpg',");
    console.log("  'anticucho.jpg',\n");
    return;
  }

  console.log(`📁 Storage: ${SUPABASE_STORAGE_URL}`);
  console.log(`🖼️  Images: ${UPLOADED_IMAGES.length}`);
  console.log(`🏪 Locations: Taipa Kendall + Coral Gables\n`);

  const menuItems = await prisma.menuItem.findMany({
    where: { restaurantId: { in: TAIPA_RESTAURANT_IDS } },
    select: { id: true, name: true, restaurantId: true },
  });

  console.log(`📋 Menu items in DB: ${menuItems.length}\n`);

  let totalUpdated = 0;

  for (const imageFilename of UPLOADED_IMAGES) {
    const imageUrl = buildImageUrl(imageFilename);
    const matched: string[] = [];

    for (const item of menuItems) {
      if (isMatch(imageFilename, item.name)) {
        await prisma.menuItem.update({
          where: { id: item.id },
          data: { image: imageUrl },
        });
        matched.push(item.name);
        totalUpdated++;
      }
    }

    const uniqueMatched = [...new Set(matched)];

    if (uniqueMatched.length > 0) {
      console.log(`✅ ${imageFilename}`);
      uniqueMatched.forEach(name => console.log(`   → ${name}`));
    } else {
      console.log(`❌ ${imageFilename} - NO MATCH`);
    }
  }

  console.log('\n=============================');
  console.log(`✨ Updated: ${totalUpdated} menu items`);
  console.log('=============================\n');

  // Count remaining items without images
  const missing = await prisma.menuItem.count({
    where: {
      restaurantId: { in: TAIPA_RESTAURANT_IDS },
      image: null,
    },
  });

  if (missing > 0) {
    console.log(`📝 ${missing} items still need images\n`);
  }
}

try {
  await updateMenuImages();
} catch (error: unknown) {
  console.error('Script failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
