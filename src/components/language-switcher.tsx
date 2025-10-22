'use client';

import { useState, useRef, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDownIcon, LanguageIcon } from '@heroicons/react/24/outline';
import { languageOptions, locales, type Locale } from '@/i18n';

interface LanguageSwitcherProps {
  variant?: 'dropdown' | 'inline';
  showLabel?: boolean;
  className?: string;
}

/**
 * Language Switcher Component
 *
 * Provides accessible language switching with URL-based locale changes.
 * Designed for Southeast Asian business users with cultural sensitivity.
 *
 * Features:
 * - Dropdown with flags and native names
 * - Keyboard navigation support
 * - Mobile-friendly touch interactions
 * - Dark theme compatible
 * - Preserves current page path
 */
export function LanguageSwitcher({
  variant = 'dropdown',
  showLabel = true,
  className = ''
}: LanguageSwitcherProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations('settings');
  const pathname = usePathname();
  const router = useRouter();


  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentLanguage = languageOptions.find(lang => lang.code === locale) || languageOptions[0];

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setIsOpen(!isOpen);
    } else if (event.key === 'Escape') {
      setIsOpen(false);
    }
  };

  // Switch language and preserve current page
  const switchLanguage = (newLocale: Locale) => {
    setIsOpen(false);

    // Create regex pattern to match any valid locale at the start of the path with proper anchoring
    const localePattern = new RegExp(`^/(${locales.join('|')})(/|$)`);

    // Extract the path without the locale prefix
    const pathWithoutLocale = pathname.replace(localePattern, '/');

    // Ensure path starts with / and doesn't have double slashes
    const cleanPath = pathWithoutLocale.startsWith('/') ? pathWithoutLocale : `/${pathWithoutLocale}`;

    // Construct new path with the selected language
    const newPath = `/${newLocale}${cleanPath === '/' ? '' : cleanPath}`;


    // Navigate immediately without delay
    router.push(newPath);
  };

  if (variant === 'inline') {
    return (
      <div className={`flex space-x-2 ${className}`}>
        {languageOptions.map((language) => (
          <button
            key={language.code}
            onClick={() => switchLanguage(language.code)}
            className={`
              px-3 py-2 text-sm font-medium rounded-md transition-colors duration-200
              ${locale === language.code
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-accent-foreground hover:bg-accent'
              }
            `}
            aria-label={`Switch to ${language.name}`}
          >
            <span className="mr-1">{language.flag}</span>
            <span className="hidden sm:inline">{language.nativeName}</span>
            <span className="sm:hidden">{language.code.toUpperCase()}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className="flex items-center space-x-1 px-2 py-1 text-sm font-medium text-foreground hover:text-accent-foreground hover:bg-accent rounded transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label={`Current language: ${currentLanguage.name}. Click to change language.`}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >

        <div className="flex items-center space-x-1">
          <span className="text-base">{currentLanguage.flag}</span>
          <span className="hidden sm:block text-sm">{currentLanguage.nativeName}</span>
          <span className="sm:hidden text-xs font-bold">{currentLanguage.code.toUpperCase()}</span>
        </div>

        <ChevronDownIcon
          className={`h-3 w-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          className="
            absolute top-full right-0 mt-2 w-56 bg-popover border border-border
            rounded-md shadow-lg z-50 py-1
          "
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="language-menu"
        >
          {languageOptions.map((language) => (
            <button
              key={language.code}
              onClick={() => switchLanguage(language.code)}
              className={`
                w-full flex items-center space-x-3 px-4 py-3 text-sm transition-colors duration-200
                ${locale === language.code
                  ? 'bg-primary text-primary-foreground'
                  : 'text-popover-foreground hover:bg-accent hover:text-accent-foreground'
                }
              `}
              role="menuitem"
              aria-label={`Switch to ${language.name} (${language.nativeName})`}
            >
              <span className="text-lg">{language.flag}</span>
              <div className="flex flex-col items-start">
                <span className="font-medium">{language.nativeName}</span>
                <span className="text-xs text-muted-foreground">
                  {language.name} • {language.region}
                </span>
              </div>
              {locale === language.code && (
                <div className="ml-auto">
                  <div className="h-2 w-2 bg-green-500 rounded-full"></div>
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}