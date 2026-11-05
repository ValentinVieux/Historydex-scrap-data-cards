// Miroir des langues 2026-11 (app : lib/i18n/translationQuality.ts + lib/catalog/search.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import { CardSchema } from "../schemas/card.schema.js";
import { WHEN_LEAD_INS, targetLocales, validateTranslatedLocale, type LocaleText } from "../scripts/_lib/card-translations.js";
import { normalizeForSearch } from "../scripts/_lib/normalize.js";

const NEW = ["ru", "zh-Hans", "cs", "el", "ro", "uk", "vi", "id", "hu", "ar", "he", "sv", "da", "nb", "fi"];

function row(pre: string, verb: string, post: string): LocaleText {
  return {
    title: "T",
    blurb: "0123456789 blurb",
    body: "x".repeat(50),
    placeLabel: "P",
    timeDisplayLabel: "1200",
    wherePrompt: { pre, verb, post },
    whenPrompt: { pre, verb, post },
  } as LocaleText;
}

test("every new locale has lead-ins and a display.locales schema slot", () => {
  const shape = (CardSchema as unknown as { shape: { display: { shape: { locales: { shape: Record<string, unknown> } } } } })
    .shape.display.shape.locales.shape;
  for (const l of NEW) {
    assert.ok(WHEN_LEAD_INS[l], `WHEN_LEAD_INS.${l}`);
    assert.ok(shape[l], `display.locales.${l}`);
  }
});

test("targetLocales() reads supported-locales.json (27 locales with the app worktree)", { skip: !process.env.SUPPORTED_LOCALES_JSON }, () => {
  const t = targetLocales();
  for (const l of NEW) assert.ok(t.includes(l), l);
});

test("lead-in placement: inside for zh-Hans/hu, head for vi/ar/he, tashkīl ignored", () => {
  assert.equal(validateTranslatedLocale(row("这座纪念碑是什么时候", "建造", "的？"), "ponctuelle", "zh-Hans").ok, true);
  assert.equal(validateTranslatedLocale(row("Ez az emlékmű mikor ", "épült", "?"), "ponctuelle", "hu").ok, true);
  assert.equal(validateTranslatedLocale(row("Vào thời kỳ nào công trình này được ", "xây dựng", "?"), "periodique", "vi").ok, true);
  assert.equal(validateTranslatedLocale(row("في أيّ فترة ", "بُني", " هذا النصب؟"), "periodique", "ar").ok, true);
  assert.equal(validateTranslatedLocale(row("מתי ", "נבנתה", " האנדרטה?"), "ponctuelle", "he").ok, true);
  assert.equal(validateTranslatedLocale(row("Когда был ", "построен", " этот памятник?"), "periodique", "ru").ok, false);
});

test("normalizeForSearch keeps Cyrillic/Greek/Arabic/Hebrew and folds Vietnamese", () => {
  assert.equal(normalizeForSearch("Procès de Galilée"), "procesdegalilee");
  assert.equal(normalizeForSearch("Ёлка Йорк"), "елкаиорк");
  assert.equal(normalizeForSearch("Παρθενώνας"), "παρθενωνασ");
  assert.equal(normalizeForSearch("مَعْرَكَة"), "معركة");
  assert.equal(normalizeForSearch("בֵּית הַמִּקְדָּשׁ"), "ביתהמקדש");
  assert.equal(normalizeForSearch("Điện Biên Phủ"), "dienbienphu");
});
