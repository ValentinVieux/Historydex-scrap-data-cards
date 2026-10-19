import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { teaserHints } from "../scripts/_lib/teaser-hint.js";

const ctx = { title: "Bataille d'Actium", placeLabel: "Actium (Grèce)", countryCode: "GR", region: 2 };
const errors = (t: string, c = ctx) => teaserHints(t, c).filter((h) => h.severity === "error").map((h) => h.message);
const warnings = (t: string, c = ctx) => teaserHints(t, c).filter((h) => h.severity === "warning").map((h) => h.message);

describe("teaserHints", () => {
  test("accepte les 8 teasers neutres de l'essai du 2026-10-19", () => {
    const ok: Array<[string, typeof ctx]> = [
      ["Portrait d'une femme au sourire énigmatique, peint à l'huile sur un panneau de bois. L'un des visages les plus reproduits de l'histoire de l'art.", { title: "La Joconde", placeLabel: "Musée du Louvre, Paris", countryCode: "FR", region: 1 }],
      ["Choc de deux flottes de guerre dont l'issue met fin à une longue guerre civile et donne à un seul homme le pouvoir sur un immense État.", ctx],
      ["Maître à penser dont les leçons sur le respect, la vertu et le bon gouvernement ont façonné des sociétés entières pendant des siècles.", { title: "Confucius", placeLabel: "Qufu, Chine", countryCode: "CN", region: 6 }],
      ["Immense église aux vitraux colorés et aux milliers de statues sculptées, où l'on couronnait les rois pendant des siècles.", { title: "Cathédrale Notre-Dame de Reims", placeLabel: "Reims", countryCode: "FR", region: 1 }],
      ["Épidémie qui emporte entre un tiers et la moitié des habitants d'un continent en quelques années, et bouleverse durablement toute la société.", { title: "Peste noire en Europe", placeLabel: "Europe", countryCode: null, region: 1 }],
      ["Texte par lequel de grands seigneurs révoltés imposent à leur roi des limites écrites à son pouvoir. Il inspire encore les constitutions d'aujourd'hui.", { title: "Magna Carta", placeLabel: "Runnymede, Angleterre", countryCode: "GB", region: 1 }],
    ];
    for (const [t, c] of ok) assert.deepEqual(errors(t, c), [], t);
  });

  test("les blurbs actuels sont bien attrapés (année, siècle, gentilé, placeLabel, continent)", () => {
    assert.ok(errors("Pandémie qui décime la population au milieu du XIVᵉ siècle.").some((m) => m.includes("siècle")));
    assert.ok(errors("Ensemble découvert en 1940 dans une vallée.").some((m) => m.includes("année")));
    assert.ok(errors("Philosophe et fonctionnaire chinois dont l'enseignement a marqué l'Asie de l'Est.", { title: "Confucius", placeLabel: "Qufu, Chine", countryCode: "CN", region: 6 }).some((m) => m.includes("gentilé")));
    assert.ok(errors("Exécution d'un prédicateur à Jérusalem sous un préfet.", { title: "Crucifixion de Jésus", placeLabel: "Jérusalem", countryCode: "IL", region: 4 }).some((m) => m.includes("placeLabel")));
    assert.ok(errors("Chef-d'œuvre du gothique, lieu des sacres.", { title: "Cathédrale de Reims", placeLabel: "Reims", countryCode: "FR", region: 1 }).some((m) => m.includes("gothique")));
    assert.ok(errors("Bataille livrée en 31 av. J.-C. entre deux flottes.").some((m) => m.includes("av. J.-C.")));
    assert.ok(errors("Première mission à se poser sur la Lune, aboutissement de la course à l'espace menée par les Américains.", { title: "Apollo 11", placeLabel: "Mer de la Tranquillité", countryCode: "US", region: 10 }).some((m) => m.includes("americain")));
  });

  test("un lieu présent dans le titre reste autorisé ; les noms propres hors titre sont des warnings", () => {
    assert.deepEqual(errors("Épidémie qui ravage l'Europe en quelques années et bouleverse la société.", { title: "Peste noire en Europe", placeLabel: "Europe", countryCode: null, region: 1 }), []);
    assert.ok(warnings("Portrait peint par Léonard devenu une icône de la peinture.", { title: "La Joconde", placeLabel: "Louvre", countryCode: "FR", region: 1 }).some((m) => m.includes("Léonard")));
    assert.deepEqual(warnings("Première fois que des humains posent le pied sur un autre monde que la Terre.", { title: "Apollo 11", placeLabel: "Mer de la Tranquillité", countryCode: "US", region: 10 }), []);
  });

  test("bornes de longueur", () => {
    assert.ok(errors("Trop court.").some((m) => m.includes("trop court")));
    assert.ok(errors("x".repeat(201)).some((m) => m.includes("trop long")));
  });
});
