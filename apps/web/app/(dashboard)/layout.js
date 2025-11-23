"use client";

import Link from "next/link";
import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Sparkles,
  Images,
  Target,
  Coins,
  Clapperboard,
  ChevronLeft,
  PanelLeftClose,
  PanelRightOpen,
  Settings,
  ImageDown
} from "lucide-react";
import { GiBearFace } from "react-icons/gi";
import { clsx } from "../../lib/cn";
import { useUser } from "../../components/user-context";
import { WizardLaunchTrigger } from "../../components/wizard/launch-wizard-trigger";

const navItems = [
  { href: "/dashboard", label: "Overview", Icon: LayoutDashboard },
  { href: "/wizard", label: "Job Wizard", Icon: Sparkles },
  { href: "/assets", label: "Assets", Icon: Images },
  { href: "/images", label: "Images", Icon: ImageDown },
  { href: "/videos", label: "Videos", Icon: Clapperboard },
  { href: "/campaigns", label: "Campaigns", Icon: Target },
  { href: "/credits", label: "Credits", Icon: Coins },
  { href: "/settings/Profile", label: "Settings", Icon: Settings },
];

const SIDEBAR_STORAGE_KEY = "ui.sidebar.open";
const SIDEBAR_WIDTH_EXPANDED = 272;
const SIDEBAR_WIDTH_COLLAPSED = 72;
const SIDEBAR_DESKTOP_BREAKPOINT = 1024;

function AccountMenuPopup({
  anchorRef,
  open,
  onClose,
  menuId,
  children,
  preferredPosition = "top",
  boundaryRef,
}) {
  const containerRef = useRef(null);
  const [style, setStyle] = useState({ visibility: "hidden" });

  useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    const menu = containerRef.current;
    if (!anchor || !menu) return;

    const gap = 8;
    const horizontalGap = 12;
    const preferredWidth = 272;
    const boundaryEl = boundaryRef?.current ?? null;

    const positionMenu = () => {
      menu.style.height = "auto";
      menu.style.maxHeight = "";
      const anchorRect = anchor.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const rawBoundary = boundaryEl?.getBoundingClientRect?.();
      const boundaryRect = rawBoundary
        ? {
            top: rawBoundary.top,
            left: rawBoundary.left,
            width: rawBoundary.width,
            height: rawBoundary.height,
            right:
              typeof rawBoundary.right === "number"
                ? rawBoundary.right
                : rawBoundary.left + rawBoundary.width,
            bottom:
              typeof rawBoundary.bottom === "number"
                ? rawBoundary.bottom
                : rawBoundary.top + rawBoundary.height,
          }
        : {
            top: 0,
            left: 0,
            width: viewportWidth,
            height: viewportHeight,
            right: viewportWidth,
            bottom: viewportHeight,
          };

      const boundaryStyles = boundaryEl
        ? window.getComputedStyle(boundaryEl)
        : null;
      const paddingLeft = boundaryStyles
        ? parseFloat(boundaryStyles.paddingLeft) || 0
        : 0;
      const paddingRight = boundaryStyles
        ? parseFloat(boundaryStyles.paddingRight) || 0
        : 0;
      const paddingTop = boundaryStyles
        ? parseFloat(boundaryStyles.paddingTop) || 0
        : 0;
      const paddingBottom = boundaryStyles
        ? parseFloat(boundaryStyles.paddingBottom) || 0
        : 0;
      const innerLeft = boundaryRect.left + paddingLeft;
      const innerRight = boundaryRect.right - paddingRight;
      const innerTop = boundaryRect.top + paddingTop;
      const innerBottom = boundaryRect.bottom - paddingBottom;
      const innerWidth = Math.max(0, innerRight - innerLeft);
      const innerHeight = Math.max(0, innerBottom - innerTop);

      let width = preferredWidth;
      if (boundaryEl) {
        const availableWidth = Math.max(0, innerWidth - horizontalGap * 2);
        width = Math.min(preferredWidth, Math.max(200, availableWidth));
        if (availableWidth > 0 && width > availableWidth) {
          width = availableWidth;
        }
        if (width <= 0 && availableWidth > 0) {
          width = availableWidth;
        }
      }
      menu.style.width = `${width}px`;
      const updatedMenuRect = menu.getBoundingClientRect();

      let top;
      let left;

      if (preferredPosition === "right") {
        top = anchorRect.top;
        left = anchorRect.right + gap;
      } else {
        const availableAboveRaw = anchorRect.top - innerTop - gap;
        const boundaryVerticalSpace = Math.max(120, innerHeight - gap * 2);
        const maxHeight = Math.min(
          480,
          viewportHeight * 0.8,
          boundaryRef?.current
            ? Math.max(0, availableAboveRaw) || boundaryVerticalSpace
            : boundaryVerticalSpace
        );
        const contentHeight = Math.min(updatedMenuRect.height, maxHeight);

        top = anchorRect.top - gap - contentHeight;
        left = boundaryEl ? innerLeft + horizontalGap : anchorRect.left;

        if (boundaryEl) {
          const minTop = innerTop + gap;
          const maxTop = innerBottom - gap - contentHeight;
          top = Math.min(Math.max(top, minTop), maxTop);
        }

        menu.style.height = `${contentHeight}px`;
        menu.style.maxHeight = `${contentHeight}px`;
      }

      const finalRect = menu.getBoundingClientRect();

      if (top < 12) {
        top = Math.min(
          Math.max(12, anchorRect.bottom + gap),
          viewportHeight - finalRect.height - 12
        );
      }

      if (top + finalRect.height > viewportHeight - 12) {
        top = viewportHeight - finalRect.height - 12;
      }

      if (preferredPosition === "right") {
        if (left + updatedMenuRect.width > viewportWidth - 12) {
          left = viewportWidth - updatedMenuRect.width - 12;
        }
      } else if (boundaryRef?.current) {
        const maxLeft = innerRight - horizontalGap - updatedMenuRect.width;
        const minLeft = innerLeft + horizontalGap;
        left = Math.min(Math.max(left, minLeft), maxLeft);
      } else if (left + updatedMenuRect.width > viewportWidth - 12) {
        left = viewportWidth - updatedMenuRect.width - 12;
      }
      if (left < 12) {
        left = 12;
      }

      const appliedHeight =
        preferredPosition === "right"
          ? undefined
          : menu.style.height || undefined;

      setStyle({
        top: `${top + window.scrollY}px`,
        left: `${left + window.scrollX}px`,
        maxHeight: `${Math.min(finalRect.height, viewportHeight * 0.8, 480)}px`,
        width: `${width}px`,
        height: appliedHeight,
        visibility: "visible",
      });
    };

    positionMenu();
    const handleResize = () => positionMenu();
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize, true);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, true);
    };
  }, [anchorRef, boundaryRef, open, preferredPosition]);

  useEffect(() => {
    if (!open) return;
    const menu = containerRef.current;
    if (!menu) return;

    const focusable = menu.querySelectorAll(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    const handleKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key === "Tab" && focusable.length) {
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (!focusable.length) return;
        const currentIndex = Array.from(focusable).indexOf(
          document.activeElement
        );
        let nextIndex = 0;
        if (event.key === "ArrowDown") {
          nextIndex =
            currentIndex === -1 ? 0 : (currentIndex + 1) % focusable.length;
        } else {
          nextIndex =
            currentIndex <= 0
              ? focusable.length - 1
              : (currentIndex - 1 + focusable.length) % focusable.length;
        }
        focusable[nextIndex].focus();
      }
    };

    menu.addEventListener("keydown", handleKey);
    (first || menu).focus();
    return () => {
      menu.removeEventListener("keydown", handleKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event) => {
      const menu = containerRef.current;
      const anchor = anchorRef.current;
      if (!menu) return;
      if (menu.contains(event.target) || anchor?.contains(event.target)) {
        return;
      }
      onClose();
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [anchorRef, onClose, open]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      ref={containerRef}
      style={style}
      className="fixed z-[9999] w-72 overflow-hidden rounded-2xl border border-neutral-200 bg-white text-sm text-neutral-700 shadow-xl"
      role="menu"
      id={menuId}
      aria-label="Account menu"
      tabIndex={-1}
    >
      <div className="max-h-[min(80vh,480px)] overflow-auto p-4">
        {children}
      </div>
    </div>,
    document.body
  );
}

function AccountMenuContent({ displayUser, onClose, handleSignOut }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-neutral-50/80 p-3">
        <p className="text-sm font-semibold text-neutral-900">
          {displayUser.profile?.name}
        </p>
        <p className="text-xs text-neutral-500">{displayUser.auth?.email}</p>
        {displayUser.profile?.companyName ? (
          <p className="mt-1 text-xs text-neutral-400">
            {displayUser.profile.companyName}
          </p>
        ) : null}
      </div>
      <div className="space-y-1">
        <Link
          href="/"
          className="block rounded-lg px-3 py-2 transition hover:bg-neutral-100"
          onClick={onClose}
          role="menuitem"
        >
          Home
        </Link>
        <Link
          href="/dashboard"
          className="block rounded-lg px-3 py-2 transition hover:bg-neutral-100"
          onClick={onClose}
          role="menuitem"
        >
          Dashboard
        </Link>
        <Link
          href="/settings"
          className="block rounded-lg px-3 py-2 transition hover:bg-neutral-100"
          onClick={onClose}
          role="menuitem"
        >
          Settings
        </Link>
      </div>
      <button
        onClick={() => {
          onClose();
          handleSignOut();
        }}
        className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-600 transition hover:bg-red-50"
        role="menuitem"
      >
        Sign out
      </button>
    </div>
  );
}

export default function DashboardLayout({ children }) {
  const { user, setUser, isHydrated } = useUser();
  const { data: session, status } = useSession();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarHydrated, setSidebarHydrated] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const [showSidebarUserMenu, setShowSidebarUserMenu] = useState(false);
  const sidebarContainerRef = useRef(null);
  const sidebarButtonRef = useRef(null);
  const headerButtonRef = useRef(null);
  const headerMenuRef = useRef(null);
  const sidebarOpenRef = useRef(sidebarOpen);
  const [isDesktop, setIsDesktop] = useState(true);
  const isSidebarCollapsed = isDesktop ? !sidebarOpen : false;
  const sidebarNavId = "dashboard-sidebar-navigation";
  const computedSidebarWidth = isDesktop
    ? sidebarOpen
      ? "var(--sb-w-open)"
      : "var(--sb-w-closed)"
    : "var(--sb-w-open)";

  const closeAllUserMenus = () => {
    setShowUserMenu(false);
    setShowSidebarUserMenu(false);
  };

  // Sync OAuth session with user context
  useEffect(() => {
    if (status === "authenticated" && session?.user) {
      const mergedUser = {
        ...session.user,
        authToken: session.accessToken ?? user?.authToken ?? null,
      };
      if (!user || user.id !== mergedUser.id || user.authToken !== mergedUser.authToken) {
        setUser(mergedUser);
      }
    } else if (status === "unauthenticated" && user) {
      setUser(null);
    }
  }, [session, status, user, setUser]);

  // Use session user as fallback if user context is empty
  const fallbackSessionUser =
    session?.user && !user
      ? { ...session.user, authToken: session.accessToken ?? null }
      : session?.user;
  const displayUser = user || fallbackSessionUser;
  const isLoading = status === "loading" || !isHydrated;
  const sidebarMenuId = "sidebar-account-menu";
  const headerMenuId = "header-account-menu";

  const handleSignOut = async () => {
    setUser(null);
    await signOut({ callbackUrl: "/" });
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const media = window.matchMedia(
      `(min-width: ${SIDEBAR_DESKTOP_BREAKPOINT}px)`
    );
    let initialOpen = media.matches;
    try {
      const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (stored !== null) {
        initialOpen = stored === "1";
      }
    } catch (error) {
      console.error(error);
    }

    setSidebarOpen(initialOpen);
    sidebarOpenRef.current = initialOpen;
    setIsDesktop(media.matches);
    setIsMobileMenuOpen(!media.matches && initialOpen);
    setSidebarHydrated(true);

    const handleMediaChange = (event) => {
      setIsDesktop(event.matches);
      if (event.matches) {
        setIsMobileMenuOpen(false);
      } else {
        setIsMobileMenuOpen(sidebarOpenRef.current);
      }
    };

    media.addEventListener("change", handleMediaChange);
    return () => media.removeEventListener("change", handleMediaChange);
  }, []);

  useEffect(() => {
    sidebarOpenRef.current = sidebarOpen;
  }, [sidebarOpen]);

  useEffect(() => {
    if (!sidebarHydrated || typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarOpen ? "1" : "0");
    } catch (error) {
      console.error(error);
    }

    const media = window.matchMedia(
      `(min-width: ${SIDEBAR_DESKTOP_BREAKPOINT}px)`
    );
    if (media.matches) {
      setIsMobileMenuOpen(false);
    } else {
      setIsMobileMenuOpen(sidebarOpen);
    }
  }, [sidebarOpen, sidebarHydrated]);

  useEffect(() => {
    if (isDesktop) {
      document.body.style.removeProperty("overflow");
      return;
    }

    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.removeProperty("overflow");
      sidebarButtonRef.current?.focus();
    }

    return () => {
      document.body.style.removeProperty("overflow");
    };
  }, [isMobileMenuOpen, isDesktop]);

  useEffect(() => {
    if (!isMobileMenuOpen) {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setSidebarOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isMobileMenuOpen]);

  useEffect(() => {
    if (!showUserMenu) {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setShowUserMenu(false);
      }
    };

    const handleClickOutside = (event) => {
      const target = event.target;
      if (
        headerMenuRef.current?.contains(target) ||
        headerButtonRef.current?.contains(target)
      ) {
        return;
      }
      setShowUserMenu(false);
    };

    document.addEventListener("keydown", handleEscape);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showUserMenu]);

  return (
    <div className="flex min-h-screen bg-neutral-100">
      <aside
        ref={sidebarContainerRef}
        className={clsx(
          "fixed inset-y-0 left-0 z-40 flex -translate-x-full flex-col border-r border-neutral-200 bg-white px-6 py-8 shadow-xl transition-[transform,width] duration-200 md:sticky md:top-0 md:self-start md:z-auto md:flex md:translate-x-0 md:shadow-none md:h-screen",
          isSidebarCollapsed ? "md:px-3" : "md:px-6",
          isMobileMenuOpen ? "translate-x-0" : ""
        )}
        style={{
          "--sb-w-open": `${SIDEBAR_WIDTH_EXPANDED}px`,
          "--sb-w-closed": `${SIDEBAR_WIDTH_COLLAPSED}px`,
          width: computedSidebarWidth,
          transitionDuration: "180ms",
        }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between bg-white pb-4">
          <div className="flex items-center gap-36">
            {isSidebarCollapsed ? (
              <button
                type="button"
                onClick={() => {
                  setSidebarOpen(true);
                  setIsMobileMenuOpen(false);
                }}
                aria-label="Open sidebar"
                title="Open sidebar"
                aria-expanded={sidebarOpen}
                aria-controls={sidebarNavId}
                className="group relative inline-flex h-9 w-9 items-center justify-center p-1.5 text-primary-600 transition duration-200 hover:text-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2 focus:ring-offset-white"
              >
                <GiBearFace className="h-6 w-6 transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0" />
                <PanelRightOpen className="absolute inset-0 m-auto h-6 w-6 opacity-0 transition-all duration-150 group-hover:rotate-6 group-hover:opacity-100 group-focus-visible:rotate-6 group-focus-visible:opacity-100" />
              </button>
            ) : (
              <>
                <div
                  className="inline-flex h-9 w-9 items-center justify-center text-primary-600"
                  aria-hidden="true"
                  title="Wizard Console"
                >
                  <GiBearFace className="h-6 w-6" />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSidebarOpen(false);
                    setIsMobileMenuOpen(false);
                  }}
                  aria-label="Collapse sidebar"
                  title="Collapse sidebar"
                  aria-expanded={sidebarOpen}
                  aria-controls={sidebarNavId}
                  className="group hidden h-9 w-9 items-center justify-center p-1.5 text-primary-600 transition duration-200 hover:text-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2 focus:ring-offset-white md:flex"
                >
                  <PanelLeftClose className="h-6 w-6 transition-transform duration-200 group-hover:-rotate-12 group-focus-visible:-rotate-12" />
                </button>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-label="Close navigation"
            className="inline-flex rounded-full border border-neutral-200 p-2 text-neutral-500 transition hover:border-primary-200 hover:text-primary-600 md:hidden"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-8 flex flex-1 flex-col overflow-hidden">
          <nav
            id={sidebarNavId}
            className="flex-1 space-y-2 overflow-y-auto pr-1 text-sm font-medium text-neutral-600"
          >
            {navItems.map((item) => (
              item.href === "/wizard" ? (
                <WizardLaunchTrigger key={item.href}>
                  {({ onClick }) => (
                    <button
                      type="button"
                      onClick={() => {
                        onClick();
                        setIsMobileMenuOpen(false);
                      }}
                      className={clsx(
                        "flex w-full items-center gap-3 rounded-xl py-2 text-left transition hover:bg-primary-50 hover:text-primary-600",
                        isSidebarCollapsed ? "justify-center px-2" : "px-3",
                        pathname === item.href ? "bg-primary-50 text-primary-600" : ""
                      )}
                    >
                      <item.Icon className="h-5 w-5" />
                      <span
                        className={clsx(
                          "transition-opacity	duration-150",
                          isSidebarCollapsed ? "hidden" : "block"
                        )}
                      >
                        {item.label}
                      </span>
                    </button>
                  )}
                </WizardLaunchTrigger>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "flex items-center gap-3 rounded-xl py-2 transition hover:bg-primary-50 hover:text-primary-600",
                    isSidebarCollapsed ? "justify-center px-2" : "px-3",
                    pathname === item.href ? "bg-primary-50 text-primary-600" : ""
                  )}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <item.Icon className="h-5 w-5" />
                  <span
                    className={clsx(
                      "transition-opacity duration-150",
                      isSidebarCollapsed ? "hidden" : "block"
                    )}
                  >
                    {item.label}
                  </span>
                </Link>
              )
            ))}
          </nav>

          {displayUser ? (
            <div className="mt-4 border-t border-neutral-100 pt-4">
              <div
                className={clsx(
                  "relative",
                  isSidebarCollapsed ? "flex justify-center" : ""
                )}
              >
                <button
                  ref={sidebarButtonRef}
                  type="button"
                  onClick={() => {
                    setShowSidebarUserMenu((prev) => !prev);
                    setShowUserMenu(false);
                  }}
                  className={clsx(
                    "flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-primary-50",
                    isSidebarCollapsed ? "justify-center px-0" : "justify-start"
                  )}
                  aria-haspopup="menu"
                  aria-expanded={showSidebarUserMenu}
                  aria-controls={showSidebarUserMenu ? sidebarMenuId : undefined}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700">
                    {displayUser.profile?.name?.[0]?.toUpperCase() ||
                      displayUser.auth?.email?.[0]?.toUpperCase() ||
                      "U"}
                  </div>
                  {!isSidebarCollapsed ? (
                    <>
                      <span>
                        {displayUser.profile?.name || displayUser.auth?.email}
                      </span>
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </>
                  ) : null}
                </button>
                <AccountMenuPopup
                  anchorRef={sidebarButtonRef}
                  open={showSidebarUserMenu}
                  onClose={closeAllUserMenus}
                  menuId={sidebarMenuId}
                  boundaryRef={sidebarContainerRef}
                >
                  <AccountMenuContent
                    displayUser={displayUser}
                    onClose={closeAllUserMenus}
                    handleSignOut={handleSignOut}
                  />
                </AccountMenuPopup>
              </div>
            </div>
          ) : null}
        </div>
      </aside>

      {isMobileMenuOpen ? (
        <div
          role="presentation"
          onClick={() => setIsMobileMenuOpen(false)}
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
        />
      ) : null}

      <div className="flex flex-1 flex-col">
        <main className="flex-1 px-4 py-6 md:px-10">{children}</main>
      </div>
    </div>
  );
}
