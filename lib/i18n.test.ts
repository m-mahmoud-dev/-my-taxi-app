import { getLocales } from "expo-localization";

import { getLocale, isRTL, t, translations } from "./i18n";

jest.mock("expo-localization", () => ({
  getLocales: jest.fn(() => [{ languageCode: "en" }]),
}));

describe("i18n", () => {
  describe("getLocale", () => {
    it("returns the device language when supported", () => {
      (getLocales as jest.Mock).mockReturnValue([{ languageCode: "ar" }]);
      expect(getLocale()).toBe("ar");
    });

    it("falls back to English for unsupported languages", () => {
      (getLocales as jest.Mock).mockReturnValue([{ languageCode: "de" }]);
      expect(getLocale()).toBe("en");
    });
  });

  describe("isRTL", () => {
    it("treats Arabic as RTL and others as LTR", () => {
      expect(isRTL("ar")).toBe(true);
      expect(isRTL("fr")).toBe(false);
      expect(isRTL("en")).toBe(false);
    });
  });

  describe("t", () => {
    it("translates keys in each supported locale", () => {
      expect(t("signin.submit", "en")).toBe("Sign In");
      expect(t("signin.submit", "fr")).toBe("Se connecter");
      expect(t("signin.submit", "ar")).toBe("تسجيل الدخول");
    });

    it("interpolates params", () => {
      expect(t("book.payInCash", "en", { amount: "200 MRU" })).toBe(
        "You will pay 200 MRU in cash to your driver.",
      );
    });

    it("returns the key when missing", () => {
      expect(t("nonexistent.key", "en")).toBe("nonexistent.key");
    });
  });

  describe("locale parity", () => {
    it("every locale defines exactly the same keys as English", () => {
      const enKeys = Object.keys(translations.en).sort();
      for (const locale of ["fr", "ar"] as const) {
        expect(Object.keys(translations[locale]).sort()).toEqual(enKeys);
      }
    });
  });
});
