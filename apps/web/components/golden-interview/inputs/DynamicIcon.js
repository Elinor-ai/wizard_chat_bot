"use client";

import * as LucideIcons from "lucide-react";

/**
 * DynamicIcon - Renders a Lucide React icon dynamically from a string name
 *
 * @param {Object} props
 * @param {string} props.name - Icon name in kebab-case (e.g., 'arrow-right', 'user-check')
 * @param {string} [props.className] - Additional CSS classes
 * @param {number} [props.size] - Icon size (default: 24)
 * @param {string} [props.color] - Icon color
 * @param {Object} [props.style] - Additional inline styles
 * @param {string} [props.fallback] - Fallback icon name if primary not found (default: 'circle')
 */
export default function DynamicIcon({
  name,
  className = "",
  size = 24,
  color,
  style,
  fallback = "circle",
  ...props
}) {
  // Convert kebab-case to PascalCase
  // e.g., "arrow-right" -> "ArrowRight", "user-check" -> "UserCheck"
  const toPascalCase = (str) => {
    if (!str || typeof str !== "string") return "";
    return str
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join("");
  };

  // Get the icon component from LucideIcons
  const getIconComponent = (iconName) => {
    if (!iconName) return null;
    const pascalName = toPascalCase(iconName);
    return LucideIcons[pascalName] || null;
  };

  // Try to get the requested icon, fall back to fallback icon, then to Circle
  let IconComponent = getIconComponent(name);

  if (!IconComponent) {
    // Try fallback
    IconComponent = getIconComponent(fallback);
  }

  if (!IconComponent) {
    // Ultimate fallback to Circle
    IconComponent = LucideIcons.Circle;
  }

  // If still no icon (shouldn't happen), render nothing
  if (!IconComponent) {
    return null;
  }

  return (
    <IconComponent
      className={className}
      size={size}
      color={color}
      style={style}
      {...props}
    />
  );
}

/**
 * Helper function to check if an icon name is valid
 * @param {string} name - Icon name in kebab-case
 * @returns {boolean}
 */
export function isValidIconName(name) {
  if (!name || typeof name !== "string") return false;
  const pascalName = name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
  return !!LucideIcons[pascalName];
}

/**
 * Get a list of all available Lucide icon names (for debugging/development)
 * @returns {string[]}
 */
export function getAvailableIconNames() {
  return Object.keys(LucideIcons).filter(
    (key) => typeof LucideIcons[key] === "function" && key !== "createLucideIcon"
  );
}
