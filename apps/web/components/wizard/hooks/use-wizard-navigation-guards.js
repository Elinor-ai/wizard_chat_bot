/**
 * @file use-wizard-navigation-guards.js
 * Custom hook for navigation guards (beforeunload, anchor click prevention).
 * Extracted from use-wizard-controller.js for better modularity.
 */

import { useEffect } from "react";

/**
 * Set up navigation guards to prevent accidental data loss.
 * Handles both browser navigation (beforeunload) and in-app navigation (anchor clicks).
 *
 * @param {Object} params
 * @param {boolean} params.unsavedChanges - Whether there are unsaved changes
 */
export function useWizardNavigationGuards({ unsavedChanges }) {
  // Browser beforeunload handler
  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleBeforeUnload = (event) => {
      if (!unsavedChanges) {
        return;
      }
      event.preventDefault();
      // eslint-disable-next-line no-param-reassign
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [unsavedChanges]);

  // In-app anchor click handler
  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    if (!unsavedChanges) {
      return undefined;
    }

    const confirmationMessage =
      "You have unsaved changes. Are you sure you want to leave without saving?";

    const handleAnchorClick = (event) => {
      const path =
        typeof event.composedPath === "function" ? event.composedPath() : [];

      let anchor =
        path.find((node) => node instanceof HTMLAnchorElement) ?? null;

      if (!anchor) {
        let element = event.target;
        while (
          element &&
          element instanceof Element &&
          element.tagName.toLowerCase() !== "a"
        ) {
          element = element.parentElement;
        }
        if (element instanceof HTMLAnchorElement) {
          anchor = element;
        }
      }

      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }

      if (anchor.target && anchor.target !== "_self") {
        return;
      }

      if (anchor.hasAttribute("download")) {
        return;
      }

      const href = anchor.getAttribute("href");
      if (!href) {
        return;
      }

      if (href.startsWith("#")) {
        return;
      }

      if (href.startsWith("javascript:")) {
        return;
      }

      let targetUrl;
      try {
        targetUrl = new URL(href, window.location.href);
      } catch {
        return;
      }

      if (targetUrl.origin !== window.location.origin) {
        return;
      }

      if (
        targetUrl.pathname === window.location.pathname &&
        targetUrl.search === window.location.search
      ) {
        return;
      }

      // eslint-disable-next-line no-alert
      const confirmed = window.confirm(confirmationMessage);
      if (!confirmed) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener("click", handleAnchorClick, true);
    return () => document.removeEventListener("click", handleAnchorClick, true);
  }, [unsavedChanges]);
}
