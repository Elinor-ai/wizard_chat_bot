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

  const brandName = sanitizeString(brandData.name ?? brandData.brand?.name ?? "");
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
    const hint = sanitizeString(brandData.summary ?? brandData.description ?? "");
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
    const value = sanitizeString(brandData.description);
    patch.description = value;
    trackFieldSource("description", value);
  }
  if (!hasValue(company.longDescription) && hasValue(brandData.longDescription)) {
    const value = sanitizeString(brandData.longDescription);
    patch.longDescription = value;
    trackFieldSource("longDescription", value);
  }
  if (!hasValue(company.tagline) && hasValue(brandData.tagline ?? brandData.summary)) {
    const value = sanitizeString(brandData.tagline ?? brandData.summary);
    patch.tagline = value;
    trackFieldSource("tagline", value);
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
