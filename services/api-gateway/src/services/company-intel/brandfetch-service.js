/**
 * @file brandfetch-service.js
 * Brandfetch API integration for company brand data.
 * Extracted from company-intel.js for better modularity.
 */

import { CompanyTypeEnum } from "@wizard/core";
import {
  BRANDFETCH_API_URL,
  BRANDFETCH_API_TOKEN,
  BRAND_SOURCE,
  hasFetchSupport,
  SOCIAL_LINK_KEYS,
} from "./config.js";
import { sanitizeString, hasValue, normalizeHex, normalizeDomain, normalizeUrl } from "./utils.js";

// =============================================================================
// MOJIBAKE DETECTION AND FIX
// =============================================================================

// Windows-1252 characters (0x80-0x9F range) map to these Unicode code points
// These appear frequently in mojibake when the source was Windows-1252
const WINDOWS_1252_CHARS = new Set([
  0x20AC, // € (0x80)
  0x201A, // ‚ (0x82)
  0x0192, // ƒ (0x83)
  0x201E, // „ (0x84)
  0x2026, // … (0x85)
  0x2020, // † (0x86)
  0x2021, // ‡ (0x87)
  0x02C6, // ˆ (0x88)
  0x2030, // ‰ (0x89)
  0x0160, // Š (0x8A)
  0x2039, // ‹ (0x8B)
  0x0152, // Œ (0x8C)
  0x017D, // Ž (0x8E)
  0x2018, // ' (0x91)
  0x2019, // ' (0x92)
  0x201C, // " (0x93)
  0x201D, // " (0x94)
  0x2022, // • (0x95)
  0x2013, // – (0x96)
  0x2014, // — (0x97)
  0x02DC, // ˜ (0x98)
  0x2122, // ™ (0x99)
  0x0161, // š (0x9A)
  0x203A, // › (0x9B)
  0x0153, // œ (0x9C)
  0x017E, // ž (0x9E)
  0x0178, // Ÿ (0x9F)
]);

/**
 * Check if a character is suspicious for mojibake detection.
 * Includes both Latin-1 supplement (0xA0-0xFF) and Windows-1252 special chars.
 */
function isSuspiciousChar(code) {
  // Latin-1 supplement range (0xA0-0xFF) - common in mojibake
  if (code >= 0xA0 && code <= 0xFF) {
    return true;
  }
  // Windows-1252 special characters (from 0x80-0x9F byte range)
  if (WINDOWS_1252_CHARS.has(code)) {
    return true;
  }
  return false;
}

/**
 * Detect if a string contains mojibake (UTF-8 decoded as Latin-1/Windows-1252).
 *
 * When UTF-8 bytes are incorrectly decoded as Latin-1 or Windows-1252, each
 * multi-byte UTF-8 character becomes multiple Latin characters.
 *
 * For example, Japanese UTF-8 (3 bytes per char) becomes 3 Latin chars:
 * - セ (U+30BB) = E3 82 BB in UTF-8 → "ã‚»" when decoded as Windows-1252
 *
 * @param {string} text - Text to check
 * @returns {boolean} True if mojibake detected
 */
function detectMojibake(text) {
  if (!text || typeof text !== "string") {
    return false;
  }

  // Count suspicious characters that indicate mojibake
  let suspiciousCount = 0;
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (isSuspiciousChar(code)) {
      suspiciousCount++;
    }
  }

  const ratio = suspiciousCount / text.length;

  // If more than 10% of characters are suspicious, likely mojibake
  // Lowered threshold because Windows-1252 chars are rarer in normal text
  if (ratio > 0.10 && suspiciousCount > 3) {
    return true;
  }

  return false;
}

// Reverse mapping: Unicode code point → Windows-1252 byte value
const UNICODE_TO_WIN1252 = new Map([
  [0x20AC, 0x80], // €
  [0x201A, 0x82], // ‚
  [0x0192, 0x83], // ƒ
  [0x201E, 0x84], // „
  [0x2026, 0x85], // …
  [0x2020, 0x86], // †
  [0x2021, 0x87], // ‡
  [0x02C6, 0x88], // ˆ
  [0x2030, 0x89], // ‰
  [0x0160, 0x8A], // Š
  [0x2039, 0x8B], // ‹
  [0x0152, 0x8C], // Œ
  [0x017D, 0x8E], // Ž
  [0x2018, 0x91], // '
  [0x2019, 0x92], // '
  [0x201C, 0x93], // "
  [0x201D, 0x94], // "
  [0x2022, 0x95], // •
  [0x2013, 0x96], // –
  [0x2014, 0x97], // —
  [0x02DC, 0x98], // ˜
  [0x2122, 0x99], // ™
  [0x0161, 0x9A], // š
  [0x203A, 0x9B], // ›
  [0x0153, 0x9C], // œ
  [0x017E, 0x9E], // ž
  [0x0178, 0x9F], // Ÿ
]);

/**
 * Fix mojibake by re-encoding Windows-1252/Latin-1 back to UTF-8.
 *
 * The fix works by reversing the encoding error:
 * 1. Map Unicode code points back to their Windows-1252 byte values
 * 2. Convert those bytes to a Buffer
 * 3. Decode the Buffer as UTF-8
 *
 * @param {string} garbled - Garbled text
 * @returns {string} Fixed text or original if fix fails
 */
function fixMojibake(garbled) {
  if (!garbled || typeof garbled !== "string") {
    return garbled;
  }

  try {
    // Convert each character back to its Windows-1252 byte value
    const bytes = [];
    for (const char of garbled) {
      const code = char.charCodeAt(0);
      // Check if it's a Windows-1252 special character
      const win1252Byte = UNICODE_TO_WIN1252.get(code);
      if (win1252Byte !== undefined) {
        bytes.push(win1252Byte);
      } else if (code <= 0xFF) {
        // Regular Latin-1 character, byte value equals code point
        bytes.push(code);
      } else {
        // Character outside Latin-1/Windows-1252, can't reverse
        return garbled;
      }
    }

    // Decode as UTF-8
    const buffer = Buffer.from(bytes);
    const fixed = buffer.toString("utf8");

    // Validate the result:
    // 1. Should not contain replacement character (indicates invalid UTF-8)
    // 2. Should be shorter (multi-byte sequences collapse to single chars)
    // 3. Should not be empty
    if (fixed.includes("\uFFFD") || fixed.length === 0 || fixed.length >= garbled.length) {
      return garbled;
    }

    return fixed;
  } catch {
    return garbled;
  }
}

/**
 * Auto-fix text field if mojibake is detected.
 * If mojibake is detected but cannot be fixed, returns null to indicate
 * the field should be skipped (data is corrupt).
 *
 * @param {string} text - Text to check and potentially fix
 * @param {string} [fieldName] - Field name for logging
 * @returns {string|null} Fixed text, original if clean, or null if corrupt
 */
function autoFixEncoding(text, fieldName = "unknown") {
  if (!text || typeof text !== "string") {
    return text;
  }

  // Count suspicious characters
  let suspiciousCount = 0;
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (isSuspiciousChar(code)) {
      suspiciousCount++;
    }
  }
  const ratio = suspiciousCount / text.length;

  // Only log if there are suspicious chars
  if (suspiciousCount > 0) {
    console.log(`   🔍 [ENCODING CHECK] ${fieldName}: ${suspiciousCount} suspicious chars out of ${text.length} (ratio: ${(ratio * 100).toFixed(1)}%)`);
  }

  if (detectMojibake(text)) {
    const fixed = fixMojibake(text);
    if (fixed !== text) {
      console.log(`   🔧 [ENCODING FIX] ${fieldName}: Mojibake detected and fixed`);
      console.log(`      Before: "${text.slice(0, 80)}..."`);
      console.log(`      After:  "${fixed.slice(0, 80)}..."`);
      return fixed;
    } else {
      // Mojibake detected but couldn't fix - data is corrupt (missing bytes)
      // Return null to signal that this field should be skipped
      console.log(`   ❌ [ENCODING CORRUPT] ${fieldName}: Mojibake detected but unfixable (bytes missing). Skipping field.`);
      return null;
    }
  }

  return text;
}

/**
 * Ensure brand object has correct shape.
 * @param {Object} brand - Brand object
 * @returns {Object} Normalized brand object
 */
export function ensureBrandShape(brand = {}) {
  return {
    ...brand,
    colors: {
      primary: brand?.colors?.primary ?? null,
      secondary: brand?.colors?.secondary ?? null,
      palette: Array.isArray(brand?.colors?.palette) ? [...brand.colors.palette] : []
    },
    fonts: {
      primary: brand?.fonts?.primary ?? null,
      secondary: brand?.fonts?.secondary ?? null,
      all: Array.isArray(brand?.fonts?.all) ? [...brand.fonts.all] : []
    }
  };
}

/**
 * Fetch brand data from Brandfetch API.
 * @param {string} domain - Company domain
 * @param {Object} logger - Logger instance
 * @returns {Promise<Object|null>} Brand data or null
 */
export async function fetchBrandfetchData(domain, logger) {
  if (!domain || !hasFetchSupport) {
    return null;
  }
  try {
    const response = await fetch(`${BRANDFETCH_API_URL}/${encodeURIComponent(domain)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${BRANDFETCH_API_TOKEN}`
      }
    });
    if (!response.ok) {
      logger?.debug?.(
        { domain, status: response.status },
        "Brandfetch lookup skipped due to response status"
      );
      return null;
    }
    return await response.json();
  } catch (error) {
    logger?.warn?.({ domain, err: error }, "Brandfetch lookup failed");
    return null;
  }
}

/**
 * Select best asset from Brandfetch items.
 * @param {Array} items - Asset items
 * @param {Function} matcher - Matcher function
 * @returns {string|null} Asset URL or null
 */
export function selectBrandfetchAsset(items = [], matcher = () => true) {
  for (const item of items) {
    if (!matcher(item)) continue;
    const formats = Array.isArray(item?.formats) ? item.formats : [];
    const preferred =
      formats.find((format) => format.format === "svg") ??
      formats.find((format) => Boolean(format.src)) ??
      null;
    if (preferred?.src) {
      return preferred.src;
    }
    if (item?.src) {
      return item.src;
    }
  }
  return null;
}

/**
 * Map Brandfetch company type to our enum.
 * @param {string} kind - Brandfetch company kind
 * @returns {string|null} Mapped company type
 */
export function mapBrandfetchCompanyType(kind) {
  if (!kind) return null;
  const normalized = kind.toLowerCase();
  if (CompanyTypeEnum.options.includes(normalized)) {
    return normalized;
  }
  if (normalized.includes("agency")) {
    return CompanyTypeEnum.enum.agency;
  }
  if (normalized.includes("freelance")) {
    return CompanyTypeEnum.enum.freelancer;
  }
  return null;
}

/**
 * Merge social links from Brandfetch.
 * @param {Object} existing - Existing social links
 * @param {Array} links - New links to merge
 * @returns {Object} Merged social links
 */
export function mergeSocialLinks(existing = {}, links = []) {
  const merged = { ...(existing ?? {}) };
  let touched = false;
  links.forEach((link) => {
    const url = normalizeUrl(link?.url ?? link?.link ?? link?.value ?? "");
    if (!url) {
      return;
    }
    const name = sanitizeString(link?.name ?? link?.type ?? "");
    const lower = name.toLowerCase();
    const match = SOCIAL_LINK_KEYS.find((entry) =>
      entry.aliases.some((alias) => lower.includes(alias))
    );
    if (match && !hasValue(merged[match.key])) {
      merged[match.key] = url;
      touched = true;
    }
  });
  return touched ? merged : existing;
}

/**
 * Apply Brandfetch data to company object.
 * @param {Object} company - Company object
 * @param {Object} brandData - Brandfetch data
 * @returns {Object|null} Patch object or null
 */
export function applyBrandfetchToCompany(company, brandData) {
  if (!brandData || typeof brandData !== "object") {
    return null;
  }
  const patch = {};
  const nextBrand = ensureBrandShape(company.brand ?? {});
  let brandTouched = false;
  const fieldSourceUpdates = {};
  const trackFieldSource = (field, value) => {
    if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
      return;
    }
    const existingSources = company.fieldSources?.[field]?.sources ?? [];
    fieldSourceUpdates[field] = {
      value,
      sources: Array.from(new Set([...existingSources, BRAND_SOURCE]))
    };
  };

  const brandName = autoFixEncoding(sanitizeString(brandData.name ?? brandData.brand?.name ?? ""), "brand.name");
  if (brandName && !hasValue(nextBrand.name)) {
    nextBrand.name = brandName;
    brandTouched = true;
    trackFieldSource("brand.name", brandName);
  }
  const brandDomain = normalizeDomain(brandData.domain ?? brandData.website ?? "");
  if (brandDomain && !hasValue(nextBrand.domain)) {
    nextBrand.domain = brandDomain;
    brandTouched = true;
    trackFieldSource("brand.domain", brandDomain);
  }

  const logos = Array.isArray(brandData.logos) ? brandData.logos : [];
  const primaryLogo = selectBrandfetchAsset(logos, () => true);
  const iconLogo = selectBrandfetchAsset(
    logos,
    (logo) => (logo?.type ?? "").toLowerCase().includes("icon") || (logo?.type ?? "").toLowerCase().includes("symbol")
  );
  if (primaryLogo && !hasValue(nextBrand.logoUrl)) {
    nextBrand.logoUrl = primaryLogo;
    brandTouched = true;
    trackFieldSource("brand.logoUrl", primaryLogo);
  }
  if (iconLogo && !hasValue(nextBrand.iconUrl)) {
    nextBrand.iconUrl = iconLogo;
    brandTouched = true;
    trackFieldSource("brand.iconUrl", iconLogo);
  }
  if (!hasValue(company.logoUrl) && primaryLogo) {
    patch.logoUrl = primaryLogo;
    trackFieldSource("logoUrl", primaryLogo);
  }

  const images = Array.isArray(brandData.images) ? brandData.images : [];
  const bannerImage = selectBrandfetchAsset(
    images,
    (img) => (img?.type ?? "").toLowerCase().includes("banner") || (img?.type ?? "").toLowerCase().includes("cover")
  );
  if (bannerImage && !hasValue(nextBrand.bannerUrl)) {
    nextBrand.bannerUrl = bannerImage;
    brandTouched = true;
    trackFieldSource("brand.bannerUrl", bannerImage);
  }

  const colors = Array.isArray(brandData.colors) ? brandData.colors : [];
  if (colors.length > 0) {
    const palette = new Set(nextBrand.colors.palette ?? []);
    colors.forEach((color) => {
      const hex = normalizeHex(color?.hex);
      if (!hex) return;
      palette.add(hex);
      if (!hasValue(nextBrand.colors.primary) && (color?.type === "brand" || color?.type === "dark")) {
        nextBrand.colors.primary = hex;
        trackFieldSource("brand.colors.primary", hex);
      } else if (!hasValue(nextBrand.colors.secondary) && color?.type && color.type !== "brand") {
        nextBrand.colors.secondary = hex;
        trackFieldSource("brand.colors.secondary", hex);
      }
    });
    const paletteArray = Array.from(palette);
    if (paletteArray.length !== (nextBrand.colors.palette?.length ?? 0)) {
      nextBrand.colors.palette = paletteArray;
      brandTouched = true;
      trackFieldSource("brand.colors.palette", paletteArray);
    }
    if (!hasValue(patch.primaryColor) && !hasValue(company.primaryColor) && hasValue(nextBrand.colors.primary)) {
      patch.primaryColor = nextBrand.colors.primary;
      trackFieldSource("primaryColor", nextBrand.colors.primary);
    }
    if (!hasValue(patch.secondaryColor) && !hasValue(company.secondaryColor) && hasValue(nextBrand.colors.secondary)) {
      patch.secondaryColor = nextBrand.colors.secondary;
      trackFieldSource("secondaryColor", nextBrand.colors.secondary);
    }
  }

  const fonts = Array.isArray(brandData.fonts) ? brandData.fonts : [];
  if (fonts.length > 0) {
    const fontSet = new Set(nextBrand.fonts.all ?? []);
    fonts.forEach((font) => {
      const name = sanitizeString(font?.name ?? font?.family ?? "");
      if (!name) return;
      fontSet.add(name);
      if (!hasValue(nextBrand.fonts.primary) && (font?.type ?? "").toLowerCase().includes("body")) {
        nextBrand.fonts.primary = name;
        trackFieldSource("brand.fonts.primary", name);
      } else if (!hasValue(nextBrand.fonts.secondary) && (font?.type ?? "").toLowerCase().includes("heading")) {
        nextBrand.fonts.secondary = name;
        trackFieldSource("brand.fonts.secondary", name);
      }
    });
    const fontList = Array.from(fontSet);
    if (fontList.length !== (nextBrand.fonts.all?.length ?? 0)) {
      nextBrand.fonts.all = fontList;
      brandTouched = true;
      trackFieldSource("brand.fonts.all", fontList);
    }
    if (!hasValue(company.fontFamilyPrimary) && hasValue(nextBrand.fonts.primary)) {
      patch.fontFamilyPrimary = nextBrand.fonts.primary;
      trackFieldSource("fontFamilyPrimary", nextBrand.fonts.primary);
    }
  }

  if (!hasValue(nextBrand.toneOfVoiceHint)) {
    const hint = autoFixEncoding(sanitizeString(brandData.summary ?? brandData.description ?? ""), "brand.toneOfVoiceHint");
    if (hint) {
      nextBrand.toneOfVoiceHint = hint;
      brandTouched = true;
      trackFieldSource("brand.toneOfVoiceHint", hint);
    }
  }

  if (!hasValue(company.name) && brandName) {
    patch.name = brandName;
    trackFieldSource("name", brandName);
  }
  if (!hasValue(company.description) && hasValue(brandData.description)) {
    const value = autoFixEncoding(sanitizeString(brandData.description), "description");
    // Only use if not corrupt (null means unfixable mojibake)
    if (value) {
      patch.description = value;
      trackFieldSource("description", value);
    }
  }
  if (!hasValue(company.longDescription) && hasValue(brandData.longDescription)) {
    const value = autoFixEncoding(sanitizeString(brandData.longDescription), "longDescription");
    if (value) {
      patch.longDescription = value;
      trackFieldSource("longDescription", value);
    }
  }
  if (!hasValue(company.tagline) && hasValue(brandData.tagline ?? brandData.summary)) {
    const value = autoFixEncoding(sanitizeString(brandData.tagline ?? brandData.summary), "tagline");
    if (value) {
      patch.tagline = value;
      trackFieldSource("tagline", value);
    }
  }
  if (!hasValue(company.website) && brandDomain) {
    const website = normalizeUrl(`https://${brandDomain}`);
    if (website) {
      patch.website = website;
      trackFieldSource("website", website);
    }
  }

  const brandCompany = brandData.company ?? {};
  const location = brandCompany.location ?? {};
  if (!hasValue(company.hqCity) && hasValue(location.city)) {
    const value = sanitizeString(location.city);
    patch.hqCity = value;
    trackFieldSource("hqCity", value);
  }
  if (!hasValue(company.hqCountry) && hasValue(location.country)) {
    const value = sanitizeString(location.country);
    patch.hqCountry = value;
    trackFieldSource("hqCountry", value);
  }
  if (!hasValue(company.industry)) {
    const industries = Array.isArray(brandCompany.industries) ? brandCompany.industries : [];
    const primaryIndustry =
      industries.find((entry) => typeof entry === "string" && entry.trim().length > 0) ??
      sanitizeString(brandCompany.industry);
    if (hasValue(primaryIndustry)) {
      const value = sanitizeString(primaryIndustry);
      patch.industry = value;
      trackFieldSource("industry", value);
    }
  }
  if (!hasValue(company.companyType)) {
    const mappedType = mapBrandfetchCompanyType(brandCompany.kind);
    if (mappedType) {
      patch.companyType = mappedType;
      trackFieldSource("companyType", mappedType);
    }
  }

  const mergedSocials = mergeSocialLinks(company.socials ?? {}, brandData.links ?? []);
  if (mergedSocials !== company.socials) {
    Object.entries(mergedSocials).forEach(([key, value]) => {
      if (!hasValue(company.socials?.[key]) && hasValue(value)) {
        trackFieldSource(`socials.${key}`, value);
      }
    });
    patch.socials = mergedSocials;
  }

  if (brandTouched) {
    patch.brand = nextBrand;
  }
  if (Object.keys(fieldSourceUpdates).length > 0) {
    patch.fieldSources = {
      ...(company.fieldSources ?? {}),
      ...fieldSourceUpdates
    };
  }

  return Object.keys(patch).length > 0 ? patch : null;
}
