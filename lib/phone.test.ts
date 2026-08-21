import { formatPhoneInput, validatePhone } from "./phone";

describe("validatePhone", () => {
  it("accepts a valid +222 Mauritanian number in E.164", () => {
    const result = validatePhone("+22222123456");
    expect(result.valid).toBe(true);
    expect(result.e164).toBe("+22222123456");
  });

  it("accepts a spaced international form", () => {
    const result = validatePhone("+222 22 12 34 56");
    expect(result.valid).toBe(true);
    expect(result.e164).toBe("+22222123456");
  });

  it("accepts local digits with the MR region default", () => {
    const result = validatePhone("22123456");
    expect(result.valid).toBe(true);
    expect(result.e164).toBe("+22222123456");
  });

  it("rejects foreign numbers", () => {
    expect(validatePhone("+33501234567").valid).toBe(false);
    expect(validatePhone("+212600000000").valid).toBe(false);
  });

  it("rejects malformed and empty input", () => {
    expect(validatePhone("").valid).toBe(false);
    expect(validatePhone("   ").valid).toBe(false);
    expect(validatePhone("1234").valid).toBe(false);
    expect(validatePhone("+222123").valid).toBe(false);
    expect(validatePhone("abc").valid).toBe(false);
  });
});

describe("formatPhoneInput", () => {
  it("formats progressively as the user types", () => {
    expect(formatPhoneInput("22")).toBe("22");
    expect(formatPhoneInput("22123")).toBe("22 12 3");
  });

  it("prefixes +222 when the user starts with 222", () => {
    expect(formatPhoneInput("22222123456")).toBe("+222 22 12 34 56");
  });
});
