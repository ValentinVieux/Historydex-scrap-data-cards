// Helper centralisé : lit les credentials InstantDB depuis .env, initialise
// le client admin, exporte une instance prête à utiliser par push:db / wipe-db /
// review-server.
//
// Refuse de démarrer si les variables d'env sont absentes — pas de fallback
// silencieux pour éviter qu'un script écrive accidentellement sur la prod
// (ou ne fasse rien sans qu'on s'en rende compte).

import { init } from "@instantdb/admin";
import "dotenv/config";
import schema from "./instantdb-schema.js";

const APP_ID = process.env.EXPO_PUBLIC_INSTANT_APP_ID;
const ADMIN_TOKEN = process.env.INSTANT_APP_ADMIN_TOKEN;

if (!APP_ID || !ADMIN_TOKEN) {
  throw new Error(
    "InstantDB credentials manquants. Ajoute EXPO_PUBLIC_INSTANT_APP_ID et " +
      "INSTANT_APP_ADMIN_TOKEN dans .env (cf. .env.example).",
  );
}

// Singleton client admin, partagé par tous les scripts du pipeline qui parlent
// à InstantDB.
export const db = init({ appId: APP_ID, adminToken: ADMIN_TOKEN, schema });

export { schema };
