import { clsx as baseClsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function clsx(...inputs) {
  return twMerge(baseClsx(...inputs));
}
