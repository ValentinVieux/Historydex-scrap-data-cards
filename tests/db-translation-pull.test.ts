import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { localeTextFromRow, pullDecision, pulledMeta } from "../scripts/_lib/db-translation-pull.js";

const fr = {
  title: "Traité de Versailles",
  blurb: "Traité de paix.",
  body: "Signé en 1919.",
  placeLabel: "Château de Versailles",
  timeDisplayLabel: "1919",
  teaser: "Accord de paix.",
  wherePrompt: { pre: "Où a été ", verb: "signé", post: " ce traité ?" },
  whenPrompt: { pre: "Quand a été ", verb: "signé", post: " ce traité ?" },
} as never;

const card = (locales: Record<string, unknown> = {}) => ({ editorial: { contentVersion: 5 }, display: { locales: { fr, ...locales } } });

const row = {
  dexNum: "002",
  title: "Версальский договор",
  blurb: "Мирный договор.",
  body: "Подписан в 1919 году.",
  placeLabel: "Версальский дворец",
  timeDisplayLabel: "1919",
  teaser: "Мирное соглашение.",
  whereVerb: "подписан",
  whereConsignePre: "Где был ",
  whereConsignePost: " этот договор?",
  whenPromptVerb: "подписан",
  whenPromptPre: "Когда был ",
  whenPromptPost: " этот договор?",
  sourceContentVersion: 5,
};

describe("pullDecision", () => {
  test("une locale déjà présente dans le JSON n'est jamais écrasée", () => {
    assert.equal(pullDecision(card({ ru: { title: "x" } }), "ru", row).kind, "skip-local");
  });
  test("pas de ligne en base → rien", () => {
    assert.equal(pullDecision(card(), "ru", undefined).kind, "no-row");
  });
  test("ligne traduite depuis le FR courant → rapatriée", () => {
    assert.equal(pullDecision(card(), "ru", row).kind, "pull");
  });
  test("ligne traduite depuis un autre FR (ou sans version) → périmée, pas rapatriée", () => {
    assert.deepEqual(pullDecision(card(), "ru", { ...row, sourceContentVersion: 4 }), { kind: "stale", rowVersion: 4, cardVersion: 5 });
    assert.equal(pullDecision(card(), "ru", { ...row, sourceContentVersion: null }).kind, "stale");
  });
});

describe("localeTextFromRow", () => {
  test("mappe les triplets et reprend teaser + placeLabel", () => {
    const loc = localeTextFromRow(row, fr) as Record<string, unknown>;
    assert.deepEqual(loc.whenPrompt, { pre: "Когда был ", verb: "подписан", post: " этот договор?" });
    assert.equal(loc.teaser, "Мирное соглашение.");
    assert.equal(loc.placeLabel, "Версальский дворец");
  });
  test("placeLabel / timeDisplayLabel absents → repli FR ; teaser absent → omis", () => {
    const loc = localeTextFromRow({ ...row, placeLabel: null, timeDisplayLabel: "", teaser: null }, fr) as Record<string, unknown>;
    assert.equal(loc.placeLabel, "Château de Versailles");
    assert.equal(loc.timeDisplayLabel, "1919");
    assert.equal("teaser" in loc, false);
  });
});

describe("pulledMeta", () => {
  test("marque l'origine et stampe les hashes du FR courant", () => {
    const loc = localeTextFromRow(row, fr);
    assert.deepEqual(pulledMeta({ sourceHash: "abc", teaserHash: "def" }, loc, 5), {
      sourceHash: "abc",
      teaserHash: "def",
      origin: "db-pull",
      pulledContentVersion: 5,
    });
  });
  test("pas de teaserHash si la ligne n'a pas de teaser (teaser-translation-stale le réclamera)", () => {
    const loc = localeTextFromRow({ ...row, teaser: null }, fr);
    assert.equal("teaserHash" in pulledMeta({ sourceHash: "abc", teaserHash: "def" }, loc, 5), false);
  });
});
