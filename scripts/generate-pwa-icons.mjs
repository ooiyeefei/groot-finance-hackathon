#!/usr/bin/env node
/**
 * Generate PWA icons from monogram
 * Creates 192x192 and 512x512 versions with blue background
 */

import sharp from 'sharp'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

const BRAND_COLOR = '#3B82F6' // Primary blue
const ICON_PADDING = 0.2 // 20% padding for regular icons
const MASKABLE_PADDING = 0.25 // 25% padding for maskable icons (safe zone)

async function generateIcons() {
  const monogramPath = path.join(projectRoot, 'public/monogram-light.png')
  const iconsDir = path.join(projectRoot, 'public/icons')

  console.log('Generating PWA icons from monogram...')

  // Load and process the monogram
  const monogram = sharp(monogramPath)
  const metadata = await monogram.metadata()

  console.log(`Source monogram: ${metadata.width}x${metadata.height}`)

  // Sizes to generate
  const sizes = [192, 512]

  for (const size of sizes) {
    // Calculate logo size with padding
    const regularLogoSize = Math.round(size * (1 - ICON_PADDING * 2))
    const maskableLogoSize = Math.round(size * (1 - MASKABLE_PADDING * 2))

    // Regular icon: white logo on blue background
    const regularIcon = await sharp(monogramPath)
      .resize(regularLogoSize, regularLogoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .negate({ alpha: false }) // Invert colors (black -> white)
      .toBuffer()

    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: BRAND_COLOR
      }
    })
      .composite([{
        input: regularIcon,
        gravity: 'center'
      }])
      .png()
      .toFile(path.join(iconsDir, `icon-${size}.png`))

    console.log(`✓ Generated icon-${size}.png`)

    // Maskable icon: more padding for safe zone
    const maskableIcon = await sharp(monogramPath)
      .resize(maskableLogoSize, maskableLogoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .negate({ alpha: false })
      .toBuffer()

    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: BRAND_COLOR
      }
    })
      .composite([{
        input: maskableIcon,
        gravity: 'center'
      }])
      .png()
      .toFile(path.join(iconsDir, `icon-maskable-${size}.png`))

    console.log(`✓ Generated icon-maskable-${size}.png`)
  }

  console.log('\nPWA icons generated successfully!')
}

generateIcons().catch(console.error)
