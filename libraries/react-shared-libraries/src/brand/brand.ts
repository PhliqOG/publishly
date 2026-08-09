// Single source of truth for the product brand. Rename the product by setting
// NEXT_PUBLIC_BRAND_NAME (and swapping the logo components) - nothing else
// should hardcode the name.
export const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME || 'Publishly';

// Docs base URL for outbound "read the docs" links; empty hides those links.
export const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL || '';

// Kept for call sites that used to branch on isGeneral for the product name -
// both modes are the same brand now.
export const productName = (_isGeneral?: boolean) => BRAND_NAME;
