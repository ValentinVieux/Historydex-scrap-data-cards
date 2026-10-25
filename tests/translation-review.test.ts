import assert from "node:assert/strict";
import { test } from "node:test";
import { applyReview } from "../scripts/_lib/translation-review.js";

const prose = { title: "Estoque", blurb: "MT blurb", body: "MT body", placeLabel: "Canadá" };

test("le titre relu remplace toujours le titre MT, les fixes remplacent la prose", () => {
  const r = applyReview(prose, { dexNum: "1", title: " Lacrosse ", fixes: { body: "corps corrigé" } });
  assert.deepEqual(r, { ok: true, prose: { ...prose, title: "Lacrosse", body: "corps corrigé" } });
});

test("sans titre relu, la carte est rejetée", () => {
  assert.equal(applyReview(prose, { dexNum: "1" }).ok, false);
  assert.equal(applyReview(prose, { dexNum: "1", title: "  " }).ok, false);
});

test("fix interdit : champ non relisible, vide, ou absent de la prose staged", () => {
  assert.equal(applyReview(prose, { dexNum: "1", title: "T", fixes: { wherePrompt: "x" } }).ok, false);
  assert.equal(applyReview(prose, { dexNum: "1", title: "T", fixes: { body: " " } }).ok, false);
  assert.equal(applyReview(prose, { dexNum: "1", title: "T", fixes: { teaser: "inventé" } }).ok, false);
});
