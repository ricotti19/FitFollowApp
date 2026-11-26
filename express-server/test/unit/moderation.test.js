/**
 * moderation.test.js
 * Edge-case tests for caption moderation (Melissa's work).
 *
 * Run with: npx jest moderation.test.js
 *
 * ASSUMED INTERFACE:
 *   moderateCaption(text) -> { allowed: boolean, reason: string }
 *
 *   reason is one of:
 *     "ok"             caption is fine
 *     "profanity"      swear words / slurs
 *     "spam"           links, ads, repeated junk, contact info
 *     "off_topic"      not about fitness, food, body, or progress
 *     "too_long"       over MAX_CAPTION_LENGTH
 *     "invalid_input"  not a string (number, object, array)
 *
 *   If a caption breaks more than one rule, the reason follows this order:
 *     invalid_input > too_long > profanity > spam > off_topic
 *
 *   An empty caption is allowed, since a progress photo can be posted with no text.
 */


import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { moderateCaption, moderateBio, moderateComment, MAX_CAPTION_LENGTH } from "../../src/moderation.js";

const expect = (actual) => ({
  toBe: (expected) => assert.strictEqual(actual, expected),
  not: {
    toBe: (expected) => assert.notStrictEqual(actual, expected),
    toThrow: () => { assert.doesNotThrow(actual); },
  },
  toEqual: (expected) => assert.deepStrictEqual(actual, expected),
  toBeLessThan: (n) => assert.ok(actual < n, `Expected ${actual} < ${n}`),
  toHaveProperty: (prop) => assert.ok(actual != null && prop in actual, `Expected property "${prop}"`),
});

test.each = (cases) => (template, fn) => {
  for (const row of cases) {
    const label = template.replace(/%s/g, (_, idx) => String(row));
    test(row.join(": "), () => fn(...row));
  }
};

// Helpers so each test reads like a sentence
const expectAllowed = (text) => {
  const result = moderateCaption(text);
  expect(result.allowed).toBe(true);
  expect(result.reason).toBe("ok");
};

const expectBlocked = (text, reason) => {
  const result = moderateCaption(text);
  expect(result.allowed).toBe(false);
  expect(result.reason).toBe(reason);
};

// ─────────────────────────────────────────────────────────────
// 1. Normal fitness captions should go through
// ─────────────────────────────────────────────────────────────
describe("Normal fitness captions (should be allowed)", () => {
  test.each([
    ["workout PR", "Hit a 225 squat PR today"],
    ["meal post", "Meal prep: chicken, rice, and broccoli"],
    ["weigh-in", "Down 5 lb this month, slow and steady"],
    ["steps", "Got my 10k steps in before lunch"],
    ["lifting shorthand", "Bench 185x5x3"],
    ["rest day", "Rest day, legs are sore from yesterday"],
    ["cardio", "5k run in 24:10, new best"],
  ])("%s: %s", (_label, caption) => {
    expectAllowed(caption);
  });

  test("hype in all caps is still allowed (gym talk, not spam)", () => {
    expectAllowed("LETS GOOOO NEW PR");
  });

  test("emoji-only caption is allowed", () => {
    expectAllowed("💪🔥");
  });

  test("caption in another language is allowed", () => {
    expectAllowed("Día de pierna, nuevo récord en sentadilla");
  });
});

// ─────────────────────────────────────────────────────────────
// 2. Profanity
// ─────────────────────────────────────────────────────────────
describe("Profanity (should be blocked)", () => {
  test("plain swear word", () => {
    expectBlocked("this workout was shit", "profanity");
  });

  test("ALL CAPS swear word", () => {
    expectBlocked("THIS WORKOUT WAS SHIT", "profanity");
  });

  test("swear word with punctuation stuck to it", () => {
    expectBlocked("shit!!! leg day", "profanity");
  });

  test("letters swapped for numbers or symbols (leetspeak)", () => {
    expectBlocked("this workout was sh1t", "profanity");
    expectBlocked("this workout was $hit", "profanity");
  });

  test("stretched out letters", () => {
    expectBlocked("shiiiiit that was hard", "profanity");
  });

  test("hidden zero-width character inside the word", () => {
    expectBlocked("sh​it workout", "profanity");
  });

  test("fitness caption with a swear word is still blocked (profanity wins)", () => {
    expectBlocked("Squat PR today, felt like shit after", "profanity");
  });
});

// ─────────────────────────────────────────────────────────────
// 3. False positives: normal words that CONTAIN a bad word
// ─────────────────────────────────────────────────────────────
describe("Words that look bad but aren't (should be allowed)", () => {
  test.each([
    ["class", "Spin class at 6am"],
    ["assistant", "My assistant coach fixed my form"],
    ["pass", "Did 3 passes on the rower"],
    ["Essex", "Ran the Essex half marathon"],
    ["cocktail", "Skipped the cocktail, had a protein shake"],
  ])("contains '%s': %s", (_word, caption) => {
    expectAllowed(caption);
  });
});

// ─────────────────────────────────────────────────────────────
// 4. Off-topic captions
// ─────────────────────────────────────────────────────────────
describe("Off-topic captions (should be blocked)", () => {
  test("off-topic lifestyle statement with no fitness point", () => {
    expectBlocked("I watch Netflix 24/7 on my couch", "off_topic");
  });


  test("random keyboard mash", () => {
    expectBlocked("asdfghjkl", "off_topic");
  });

  test("totally unrelated topic", () => {
    expectBlocked("Who's watching the game tonight", "off_topic");
  });

  test("unrelated topic with a fitness hashtag doesn't sneak through", () => {
    expectBlocked("New phone just came in the mail #fitness", "off_topic");
  });
});

describe("Off-topic edge cases (food in a fitness context should be allowed)", () => {
  test("ice cream as a planned cheat meal", () => {
    expectAllowed("Ice cream after leg day, earned it");
  });

  test("ice cream logged for macros", () => {
    expectAllowed("Fit ice cream into my macros today, 250 kcal");
  });
});

// ─────────────────────────────────────────────────────────────
// 5. Spam
// ─────────────────────────────────────────────────────────────
describe("Spam (should be blocked)", () => {
  test("link in caption", () => {
    expectBlocked("Get shredded fast at bit.ly/abc123", "spam");
  });

  test("full URL", () => {
    expectBlocked("Best protein deals https://example.com/deal", "spam");
  });

  test("selling followers", () => {
    expectBlocked("Buy 1000 followers cheap DM me", "spam");
  });

  test("phone number", () => {
    expectBlocked("Personal training text me 214-555-0199", "spam");
  });

  test("email address", () => {
    expectBlocked("Coaching inquiries: coach@example.com", "spam");
  });

  test("same word repeated over and over", () => {
    expectBlocked("gains ".repeat(50).trim(), "spam");
  });

  test("one character repeated over and over", () => {
    expectBlocked("!".repeat(100), "spam");
  });
});

// ─────────────────────────────────────────────────────────────
// 6. Empty, blank, and weird input
// ─────────────────────────────────────────────────────────────
describe("Empty and weird input", () => {
  test("empty string is allowed (photo-only post)", () => {
    expectAllowed("");
  });

  test("only spaces, tabs, and new lines is allowed (treated as empty)", () => {
    expectAllowed("   \n\t  ");
  });

  test("null and undefined are treated as no caption", () => {
    expectAllowed(null);
    expectAllowed(undefined);
  });

  test.each([
    ["number", 12345],
    ["object", { text: "hi" }],
    ["array", ["leg", "day"]],
    ["boolean", true],
  ])("%s input returns invalid_input instead of crashing", (_type, input) => {
    expect(() => moderateCaption(input)).not.toThrow();
    expectBlocked(input, "invalid_input");
  });

  test("HTML or script tags don't crash it", () => {
    expect(() => moderateCaption("<script>alert('hi')</script> leg day")).not.toThrow();
  });

  test("extra spaces around a normal caption don't change the result", () => {
    expectAllowed("   Hit a 225 squat PR today   ");
  });
});

// ─────────────────────────────────────────────────────────────
// 7. Length limits (boundary tests)
// ─────────────────────────────────────────────────────────────
describe("Length limits", () => {
  // Builds an on-topic caption of exactly n characters.
  // It always ends in "!" so trimming spaces can't make it shorter.
  const captionOfLength = (n) => {
    const base = "Leg day squat PR ";
    return base.repeat(Math.ceil(n / base.length)).slice(0, n - 1) + "!";
  };

  test(`exactly ${MAX_CAPTION_LENGTH} characters is allowed`, () => {
    const result = moderateCaption(captionOfLength(MAX_CAPTION_LENGTH));
    expect(result.reason).not.toBe("too_long");
  });

  test(`${MAX_CAPTION_LENGTH + 1} characters is blocked`, () => {
    expectBlocked(captionOfLength(MAX_CAPTION_LENGTH + 1), "too_long");
  });

  test("one giant word with no spaces is blocked", () => {
    expectBlocked("a".repeat(MAX_CAPTION_LENGTH + 1), "too_long");
  });
});

// ─────────────────────────────────────────────────────────────
// 8. Consistency and speed
// ─────────────────────────────────────────────────────────────
describe("Consistency and speed", () => {
  test("same caption gives the same answer every time", () => {
    const first = moderateCaption("I eat icecream 24/7");
    for (let i = 0; i < 20; i++) {
      expect(moderateCaption("I eat icecream 24/7")).toEqual(first);
    }
  });

  test("1,000 captions finish in under 2 seconds (NFR-1)", () => {
    const start = Date.now();
    for (let i = 0; i < 1000; i++) {
      moderateCaption("Hit a 225 squat PR today");
    }
    expect(Date.now() - start).toBeLessThan(2000);
  });

  test("result always has allowed and reason fields", () => {
    const result = moderateCaption("Leg day done");
    expect(result).toHaveProperty("allowed");
    expect(result).toHaveProperty("reason");
    expect(typeof result.allowed).toBe("boolean");
    expect(typeof result.reason).toBe("string");
  });
});
