-- Presence module: privacy + preferred status preferences (lastSeen already on users).

CREATE TYPE "PresencePrivacy" AS ENUM ('EVERYONE', 'CONTACTS', 'NOBODY');

CREATE TYPE "PresencePreferredStatus" AS ENUM ('ONLINE', 'AWAY', 'INVISIBLE');

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "presencePrivacy" "PresencePrivacy" NOT NULL DEFAULT 'EVERYONE',
  ADD COLUMN IF NOT EXISTS "presencePreferredStatus" "PresencePreferredStatus" NOT NULL DEFAULT 'ONLINE';
