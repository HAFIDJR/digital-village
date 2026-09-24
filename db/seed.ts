/**
 * Deterministic seed for Desa Sukamaju.
 *
 * Every number the dashboard renders is *derived from these tables* — there is
 * no hard-coded fixture in the UI layer. Re-running the seed reproduces the
 * same village because all randomness flows through a seeded PRNG.
 *
 *   npm run db:seed     (or npm run db:reset to wipe first)
 */
import { sql } from "drizzle-orm";

import { readEsignPassphrase } from "@/lib/esign";
import { hashPassphrase } from "@/lib/esign-server";

import { getDb } from "./client";
import {
  ANNOUNCEMENT_TEMPLATES,
  BIRTH_PLACES,
  CARGO_CATEGORIES,
  DUSUN_ADDRESS_STREETS,
  EDUCATIONS,
  FEMALE_GIVEN,
  HAMLETS,
  LETTER_TYPES,
  MALE_GIVEN,
  NEIGHBORHOODS,
  OCCUPATIONS_FEMALE,
  OCCUPATIONS_MALE,
  PURPOSE_TEMPLATES,
  RELIGIONS,
  REPORT_SUBJECTS,
  STAFF,
  SURNAMES,
  VILLAGE,
} from "./seed-data";
import * as t from "./schema";

/* -------------------------------------------------------------------------- */
/* Deterministic PRNG (mulberry32) — reproducible villages across runs.        */
/* -------------------------------------------------------------------------- */

function makeRandom(seed: number) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), 1 | x);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

type Next = () => number;

/** WIB is UTC+7 year-round; Indonesia does not observe daylight saving. */
const WIB_OFFSET_MS = 7 * 3_600_000;

/**
 * Converts a WIB wall-clock Date (its UTC fields read as Asia/Jakarta time) into
 * the real instant it names.
 */
const asInstant = (wallClock: Date) => new Date(wallClock.getTime() - WIB_OFFSET_MS);

/**
 * A lifecycle stamp that is always after the previous step and never after now.
 *
 * Verification, signature and collection are derived by adding a plausible
 * elapsed time to the previous step. Done naively ("submitted + 6 hours") a
 * request filed this morning ends up signed in the small hours of tomorrow, and
 * the audit trail — which is the record officers are accountable for — contains
 * events that have not happened yet. When there is not enough elapsed time left,
 * the event is placed inside the window that does remain, so ordering holds and
 * every timestamp stays in the past.
 */
function phaseStamp(rng: Next, from: Date, minMinutes: number, maxMinutes: number, now: Date) {
  const candidate = new Date(from.getTime() + intBetween(rng, minMinutes, maxMinutes) * 60_000);
  if (candidate.getTime() <= now.getTime()) return candidate;
  const remaining = now.getTime() - from.getTime();
  return new Date(from.getTime() + Math.max(1_000, Math.floor(remaining * 0.7)));
}

const pick = <T>(rng: Next, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
const intBetween = (rng: Next, min: number, max: number) =>
  min + Math.floor(rng() * (max - min + 1));

/** Weighted sampler — `weights[i]` corresponds to `values[i]`. */
function weighted<T>(rng: Next, values: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < values.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return values[i];
  }
  return values[values.length - 1];
}

/* -------------------------------------------------------------------------- */
/* Identity helpers                                                            */
/* -------------------------------------------------------------------------- */

/** Birth date for a target age, with a plausible (non-uniform) month/day. */
function birthDateForAge(rng: Next, age: number): Date {
  const now = new Date();
  const d = new Date(now.getFullYear() - age, intBetween(rng, 0, 11), intBetween(rng, 1, 28));
  return d;
}

const pad = (n: number, width: number) => String(n).padStart(width, "0");

/** NIK = 6-digit region + DDMMYY + 4-digit sequence (Permendagri 102/2019). */
function buildNik(regionCode: string, dob: Date, seq: number) {
  return `${regionCode}${pad(dob.getDate(), 2)}${pad(dob.getMonth() + 1, 2)}${pad(
    dob.getFullYear() % 100,
    2,
  )}${pad(seq % 10000, 4)}`;
}

/** KK number: 4-digit region prefix + 12 digits, 16 total (Permendagri 102/2019). */
function buildKkNumber(rng: Next, index: number) {
  return `3204${pad(intBetween(rng, 100000, 999999), 6)}${pad(index % 1_000_000, 6)}`;
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 200);
}

/** Base32-ish code used for the QR verification token on printed letters. */
function verificationCode(rng: Next) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 12; i += 1) out += alphabet[Math.floor(rng() * alphabet.length)];
  return out;
}

/* -------------------------------------------------------------------------- */
/* Main seed                                                                   */
/* -------------------------------------------------------------------------- */

export type SeedOptions = { reset?: boolean };

/** Stable lock key — arbitrary, but unique to this seeder within the cluster. */
const SEED_LOCK_KEY = 732_147_001;

export async function seedDatabase(options: SeedOptions = {}) {
  const db = await getDb();
  const rng = makeRandom(20260924);
  const started = Date.now();

  // `next dev` can spin up several workers that all boot simultaneously. A
  // Postgres advisory lock serialises them, so the loser of the race observes a
  // populated database and exits cleanly instead of hitting unique violations.
  const lock = await db.execute<{ acquired: boolean }>(
    sql`select pg_try_advisory_lock(${SEED_LOCK_KEY}) as acquired`,
  );
  if (!lock.rows[0]?.acquired) {
    return { skipped: true as const, reason: "Another process is seeding", durationMs: 0 };
  }

  try {
    return await populate(db, options, rng, started);
  } finally {
    await db.execute(sql`select pg_advisory_unlock(${SEED_LOCK_KEY})`);
  }
}

type Db = Awaited<ReturnType<typeof getDb>>;

async function populate(db: Db, options: SeedOptions, rng: Next, started: number) {
  if (options.reset) {
    await db.execute(sql`
      truncate table
        activity_log, notifications, daily_stats, signature_requests, letter_attachments,
        letter_requests, citizen_reports, announcements, resident_mutations, residents,
        families, neighborhoods, hamlets, letter_requirements, letter_types, staff_shifts,
        staff, villages
      restart identity cascade
    `);
  }

  // Guard: never double-seed a populated database.
  const existing = await db.execute<{ n: number }>(sql`select count(*)::int as n from villages`);
  if ((existing.rows[0]?.n ?? 0) > 0) {
    return { skipped: true as const, reason: "Database already seeded", durationMs: 0 };
  }

  const now = new Date();
  // Village wall clock. Everything below composes office hours ("07:30", "the
  // fourth arrival of the day") in *this* frame of reference, then converts to a
  // real instant with `asInstant`. Without the conversion an 11:58 WIB
  // submission would be stored as 11:58 UTC — seven hours in the future — and
  // the worklist would show requests that have not been filed yet.
  const villageNowWallClock = new Date(now.getTime() + WIB_OFFSET_MS);
  const wallToday = new Date(
    Date.UTC(
      villageNowWallClock.getUTCFullYear(),
      villageNowWallClock.getUTCMonth(),
      villageNowWallClock.getUTCDate(),
    ),
  );
  const startOfToday = wallToday;
  /** Midnight WIB as a real instant — the reference for age arithmetic. */
  const villageMidnight = asInstant(wallToday);

  /* ---------------------------------------------------------------- village */
  const [village] = await db
    .insert(t.villages)
    .values({
      name: VILLAGE.name,
      district: VILLAGE.district,
      regency: VILLAGE.regency,
      province: VILLAGE.province,
      postalCode: VILLAGE.postalCode,
      villageCode: VILLAGE.villageCode,
      headName: VILLAGE.headName,
      headNipd: VILLAGE.headNipd,
      officeAddress: VILLAGE.officeAddress,
      officePhone: VILLAGE.officePhone,
      officeEmail: VILLAGE.officeEmail,
      website: VILLAGE.website,
      sealUrl: VILLAGE.sealUrl,
      establishedYear: VILLAGE.establishedYear,
    })
    .returning();

  /* ----------------------------------------------------------------- staff */
  // Only the signer carries an activated credential; everyone else stays null.
  const esign = readEsignPassphrase();
  const signerPassphraseHash = hashPassphrase(esign.passphrase);

  const staffRows = await db
    .insert(t.staff)
    .values(
      STAFF.map((s, i) => ({
        villageId: village.id,
        fullName: s.fullName,
        jobTitle: s.jobTitle,
        role: s.role,
        nipd: s.nipd,
        email: s.email,
        phone: s.phone,
        initials: s.initials,
        canSign: s.canSign,
        signaturePassphraseHash: s.canSign ? signerPassphraseHash : null,
        active: true,
        // Presence drives the "Status Kades E-Sign" card, so it has to be
        // plausible rather than uniform: the officer on shift and the Kepala
        // Desa are active *now*; the rest were last seen earlier this morning.
        lastSeenAt: new Date(
          now.getTime() -
            (i === 0 ? intBetween(rng, 1, 3) : s.canSign ? 0 : intBetween(rng, 20, 190)) * 60_000,
        ),
      })),
    )
    .returning();

  const primaryStaff = staffRows.find((s) => s.role === "KASI_PELAYANAN")!;
  const operatorStaff = staffRows.find((s) => s.role === "OPERATOR_DESA")!;
  const sekdes = staffRows.find((s) => s.role === "SEKDES")!;
  const kades = staffRows.find((s) => s.role === "KADES")!;
  const kaurTu = staffRows.find((s) => s.role === "KAUR_TU")!;

  // The signed-in user is on shift since 07:30 today.
  await db.insert(t.staffShifts).values({
    staffId: primaryStaff.id,
    startedAt: asInstant(new Date(startOfToday.getTime() + 7.5 * 3600_000)),
    station: "Loket Pelayanan 01",
    ipAddress: "10.10.4.27",
  });

  /* --------------------------------------------------------------- dusun/RT */
  const hamletRows = await db
    .insert(t.hamlets)
    .values(HAMLETS.map((h) => ({ villageId: village.id, code: h.code, name: h.name, headName: h.headName })))
    .returning();

  const hamletByCode = new Map(hamletRows.map((h) => [h.code, h]));
  const neighborhoodInput = HAMLETS.flatMap((h) =>
    NEIGHBORHOODS[h.code].map((n) => ({
      hamletId: hamletByCode.get(h.code)!.id,
      rt: n.rt,
      rw: n.rw,
      headName: n.headName,
    })),
  );
  const neighborhoodRows = await db.insert(t.neighborhoods).values(neighborhoodInput).returning();

  const neighborhoodLabel = (id: string) => {
    const n = neighborhoodRows.find((x) => x.id === id)!;
    const h = hamletRows.find((x) => x.id === n.hamletId)!;
    return { dusun: h.name.split(" - ")[0], rt: n.rt, rw: n.rw, full: `${h.name.split(" - ")[0]} · RT ${pad(n.rt, 2)}/RW ${pad(n.rw, 2)}` };
  };

  /* -------------------------------------------------------- letter catalogue */
  const letterTypeRows = await db
    .insert(t.letterTypes)
    .values(
      LETTER_TYPES.map((lt) => ({
        villageId: village.id,
        code: lt.code,
        name: lt.name,
        templateTitle: lt.templateTitle,
        description: lt.description,
        slaDays: lt.slaDays,
        requiresKadesSignature: lt.requiresKadesSignature,
        feeIdr: lt.feeIdr,
        active: true,
        sortOrder: lt.sortOrder,
      })),
    )
    .returning();

  await db.insert(t.letterRequirements).values(
    LETTER_TYPES.flatMap((lt) => {
      const parent = letterTypeRows.find((r) => r.code === lt.code)!;
      return lt.requirements.map((r, i) => ({
        letterTypeId: parent.id,
        docKey: r.docKey,
        label: r.label,
        mandatory: r.mandatory,
        sortOrder: i + 1,
      }));
    }),
  );

  /* ------------------------------------------------------ population registry */
  // The village's official Semester II report (Profil Desa) records 1,412 KK and
  // 4,821 jiwa *aktif*, against 4,929 registry rows — the difference being
  // residents already recorded as meninggal or pindah keluar. We reproduce that
  // exact arithmetic so the KPI row quotes the published figures.
  const TARGET_FAMILIES = 1412;
  const TARGET_ACTIVE_RESIDENTS = 4821;
  const HISTORICAL_RECORDS = 108; // 63 meninggal + 45 pindah keluar
  const TOTAL_REGISTRY_ROWS = TARGET_ACTIVE_RESIDENTS + HISTORICAL_RECORDS;

  const householdSizes: number[] = [];
  const sizeChoices = [1, 2, 3, 4, 5, 6, 7, 8];
  const sizeWeights = [5, 11, 17, 24, 20, 13, 7, 3];

  let allocated = 0;
  for (let i = 0; i < TARGET_FAMILIES; i += 1) {
    const remainingFamilies = TARGET_FAMILIES - i;
    const remainingTarget = TOTAL_REGISTRY_ROWS - allocated;
    // Keep every remaining household viable (1..8) while converging on target.
    const minNeeded = Math.max(1, remainingTarget - (remainingFamilies - 1) * 8);
    const maxAllowed = Math.min(8, remainingTarget - (remainingFamilies - 1) * 1);

    let size = weighted(rng, sizeChoices, sizeWeights);
    size = Math.min(maxAllowed, Math.max(minNeeded, size));
    householdSizes.push(size);
    allocated += size;
  }

  const familyValues = householdSizes.map((size, i) => {
    const neighborhood = neighborhoodRows[i % neighborhoodRows.length];
    const label = neighborhoodLabel(neighborhood.id);
    const headSurname = pick(rng, SURNAMES);
    const headGiven = pick(rng, MALE_GIVEN);
    return {
      villageId: village.id,
      kkNumber: buildKkNumber(rng, i),
      neighborhoodId: neighborhood.id,
      address: `${pick(rng, DUSUN_ADDRESS_STREETS)} No. ${intBetween(rng, 1, 180)}, ${label.dusun} RT ${pad(label.rt, 2)}/RW ${pad(label.rw, 2)}`,
      headName: `${headGiven} ${headSurname}`,
      welfareClass: weighted(rng, ["Pra-Sejahtera", "Sejahtera I", "Sejahtera II", "Sejahtera III", "Sejahtera III Plus"], [14, 26, 29, 21, 10]),
      memberCount: size,
    };
  });

  const familyRows: (typeof t.families.$inferSelect)[] = [];
  for (let i = 0; i < familyValues.length; i += 200) {
    const chunk = await db.insert(t.families).values(familyValues.slice(i, i + 200)).returning();
    familyRows.push(...chunk);
  }

  /* --- residents distributed across those households ---------------------- */
  type ResidentInsert = typeof t.residents.$inferInsert;
  const residentValues: ResidentInsert[] = [];
  const usedNiks = new Set<string>();
  const regionCode = "320416";
  let nikSeq = 1;

  const nextNik = (dob: Date) => {
    let nik = "";
    do {
      nik = buildNik(regionCode, dob, nikSeq++);
    } while (usedNiks.has(nik));
    usedNiks.add(nik);
    return nik;
  };

  for (let f = 0; f < familyRows.length; f += 1) {
    const family = familyRows[f];
    const size = family.memberCount;
    const neighborhood = neighborhoodRows.find((n) => n.id === family.neighborhoodId)!;
    const surname = family.headName.split(" ").at(-1)!;

    for (let m = 0; m < size; m += 1) {
      let relation: string;
      let gender: "L" | "P";
      let age: number;
      let given: string;

      if (m === 0) {
        // Kepala keluarga
        relation = "KEPALA KELUARGA";
        gender = "L";
        age = intBetween(rng, 24, 68);
        given = family.headName.split(" ")[0];
      } else if (m === 1) {
        // Spouse — present in ~88% of multi-person households
        const hasSpouse = rng() < 0.88;
        if (hasSpouse) {
          relation = "ISTRI";
          gender = "P";
          age = Math.max(18, intBetween(rng, 20, 62));
          given = pick(rng, FEMALE_GIVEN);
        } else {
          relation = weighted(rng, ["ANAK", "ORANG TUA", "FAMILI LAIN"], [5, 4, 1]);
          gender = rng() < 0.5 ? "L" : "P";
          age = relation === "ORANG TUA" ? intBetween(rng, 62, 88) : intBetween(rng, 3, 28);
          given = gender === "L" ? pick(rng, MALE_GIVEN) : pick(rng, FEMALE_GIVEN);
        }
      } else {
        relation = weighted(rng, ["ANAK", "ANAK", "ANAK", "ANAK", "ORANG TUA", "FAMILI LAIN", "CUCU"], [40, 20, 12, 8, 8, 8, 4]);
        if (relation === "ANAK") {
          gender = rng() < 0.512 ? "L" : "P";
          age = intBetween(rng, 0, 33);
          given = gender === "L" ? pick(rng, MALE_GIVEN) : pick(rng, FEMALE_GIVEN);
        } else if (relation === "ORANG TUA" || relation === "CUCU") {
          gender = rng() < 0.5 ? "L" : "P";
          age = relation === "ORANG TUA" ? intBetween(rng, 60, 90) : intBetween(rng, 1, 17);
          given = gender === "L" ? pick(rng, MALE_GIVEN) : pick(rng, FEMALE_GIVEN);
        } else {
          gender = rng() < 0.5 ? "L" : "P";
          age = intBetween(rng, 18, 55);
          given = gender === "L" ? pick(rng, MALE_GIVEN) : pick(rng, FEMALE_GIVEN);
        }
      }

      const dob = birthDateForAge(rng, age);
      // Adults carry the household surname; minors are commonly single-named.
      const fullName = rng() < 0.72 || age < 12 ? `${given} ${surname}` : given;

      const isWorkingAge = age >= 17 && age < 60;
      const occupation = !isWorkingAge
        ? age < 17
          ? "Pelajar/Mahasiswa"
          : age >= 60
            ? weighted(rng, ["Pensiunan", "Petani", "Ibu Rumah Tangga", "Tidak Bekerja"], [3, 4, 3, 2])
            : "Belum/Tidak Bekerja"
        : gender === "L"
          ? pick(rng, OCCUPATIONS_MALE)
          : pick(rng, OCCUPATIONS_FEMALE);

      const education = age < 7
        ? "Tidak/Belum Sekolah"
        : age < 13
          ? "SD/Sederajat"
          : age < 16
            ? "SMP/Sederajat"
            : age < 19
              ? "SMA/SMK/Sederajat"
              : weighted(rng, EDUCATIONS.slice(1), [16, 22, 34, 10, 14, 4]);

      residentValues.push({
        villageId: village.id,
        familyId: family.id,
        nik: nextNik(dob),
        fullName,
        gender,
        birthPlace: pick(rng, BIRTH_PLACES),
        birthDate: dob.toISOString().slice(0, 10),
        religion: pick(rng, RELIGIONS) as (typeof t.religionEnum.enumValues)[number],
        maritalStatus:
          age < 17
            ? "BELUM_MENIKAH"
            : age > 22 && rng() < 0.78
              ? weighted(rng, ["KAWIN", "CERAI_HIDUP", "CERAI_MATI"], [92, 5, 3])
              : "BELUM_MENIKAH",
        education,
        occupation,
        nationality: "WNI",
        familyRelation: relation,
        neighborhoodId: neighborhood.id,
        address: family.address,
        phone: age >= 15 ? `08${intBetween(rng, 11, 99)}-${intBetween(rng, 1000, 9999)}-${intBetween(rng, 1000, 9999)}` : null,
        status: "AKTIF",
        documentsVerified: rng() < 0.93,
      });
    }
  }

  // Retire exactly HISTORICAL_RECORDS rows into meninggal / pindah-keluar so the
  // active population lands on the published 4,821 to the person.
  const retireTargets = residentValues
    .map((resident, index) => ({ resident, index }))
    .filter(({ resident }) => {
      const age = Math.floor(
        (villageMidnight.getTime() - new Date(resident.birthDate as string).getTime()) /
          31_557_600_000,
      );
      // Only adults can migrate; only the elderly are recorded as deceased.
      return age >= 60 || (age >= 21 && age <= 46);
    });

  let deceasedAssigned = 0;
  const DECEASED_QUOTA = 63;

  for (let i = 0; i < HISTORICAL_RECORDS; i += 1) {
    // Even stride across the eligible pool keeps the retirements demographically spread.
    const pickIdx = Math.floor((i * retireTargets.length) / HISTORICAL_RECORDS);
    const target = retireTargets[pickIdx];
    if (!target) break;

    const age = Math.floor(
      (villageMidnight.getTime() - new Date(target.resident.birthDate as string).getTime()) /
        31_557_600_000,
    );

    if (age >= 60 && deceasedAssigned < DECEASED_QUOTA) {
      target.resident.status = "MENINGGAL";
      deceasedAssigned += 1;
    } else {
      target.resident.status = "PINDAH_KELUAR";
    }
  }

  for (let i = 0; i < residentValues.length; i += 400) {
    await db.insert(t.residents).values(residentValues.slice(i, i + 400));
  }

  /* ------------------------------------------------------------ mutations */
  const mutationCandidates = residentValues
    .filter((r) => r.status === "MENINGGAL" || r.status === "PINDAH_KELUAR")
    .slice(0, 26);

  if (mutationCandidates.length) {
    const residentByNik = new Map(
      (
        await db.execute<{ id: string; nik: string }>(
          sql`select id, nik from residents where status in ('MENINGGAL','PINDAH_KELUAR')`,
        )
      ).rows.map((r) => [r.nik, r.id]),
    );

    await db.insert(t.residentMutations).values(
      mutationCandidates.flatMap((candidate, i) => {
        const id = residentByNik.get(candidate.nik!);
        if (!id) return [];
        return [
          {
            residentId: id,
            kind: candidate.status === "MENINGGAL" ? "KEMATIAN" : "PINDAH_KELUAR",
            effectiveDate: new Date(now.getTime() - intBetween(rng, 1, 40) * 86_400_000)
              .toISOString()
              .slice(0, 10),
            notes:
              candidate.status === "MENINGGAL"
                ? `Tercatat meninggal, akta kematian diproses oleh ${operatorStaff.fullName}.`
                : "Pindah domisili ke luar wilayah desa, surat pindah telah diterbitkan.",
            recordedByStaffId: [operatorStaff.id, sekdes.id, kaurTu.id][i % 3],
          },
        ];
      }),
    );
  }

  /* ------------------------------------------------ mutasi untuk audit feed */
  const recentMutationResidents = await db.execute<{ id: string; full_name: string }>(
    sql`select id, full_name from residents where status = 'AKTIF' order by random() limit 6`,
  );

  /* ------------------------------------------------------- letter requests */
  // Today: 14 requests, 8 still unprocessed. The rest is a realistic backlog.
  const TODAY_COUNT = 14;
  const TODAY_UNPROCESSED = 8;
  const BACKLOG_COUNT = 34;

  type RequestInsert = typeof t.letterRequests.$inferInsert;
  const requestValues: RequestInsert[] = [];

  // Scheduled arrival times so "10 menit lalu" style stamps look organic.
  const todayArrivalMinutes = [
    4, 11, 19, 27, 34, 46, 58, 73, 96, 118, 143, 171, 205, 238,
  ];

  const applicantPool = await db.execute<{
    id: string;
    full_name: string;
    nik: string;
    phone: string | null;
    family_id: string | null;
    neighborhood_id: string;
    address: string;
  }>(sql`
    select r.id, r.full_name, r.nik, r.phone, r.family_id, r.neighborhood_id, r.address
    from residents r
    where r.status = 'AKTIF' and r.family_relation = 'KEPALA KELUARGA'
    order by r.nik
    limit 900
  `);

  const applicants = applicantPool.rows;

  let ticketCounter = 1000;

  const statusPlan: { status: (typeof t.requestStatusEnum.enumValues)[number]; weight: number }[] = [
    { status: "PENDING_VERIFIKASI", weight: 30 },
    { status: "BERKAS_TIDAK_LENGKAP", weight: 12 },
    { status: "DIVERIFIKASI", weight: 12 },
    { status: "MENUNGGU_TTD_KADES", weight: 18 },
    { status: "DITANDATANGANI", weight: 8 },
    { status: "SIAP_DIAMBIL", weight: 10 },
    { status: "SELESAI", weight: 10 },
  ];

  const buildRequest = (opts: {
    submittedAt: Date;
    status: (typeof t.requestStatusEnum.enumValues)[number];
    priority: (typeof t.priorityEnum.enumValues)[number];
    index: number;
  }): RequestInsert => {
    const applicant = applicants[(opts.index * 7 + 13) % applicants.length];
    const letterType = letterTypeRows[opts.index % letterTypeRows.length];
    const template = LETTER_TYPES.find((l) => l.code === letterType.code)!;
    const label = neighborhoodLabel(applicant.neighborhood_id);

    // Which stages this request has actually been through. Derived from the
    // status so the stamps and the workflow can never disagree.
    const requiresVerification = !["PENDING_VERIFIKASI", "BERKAS_TIDAK_LENGKAP"].includes(
      opts.status,
    );
    const requiresSignature = ["DITANDATANGANI", "SIAP_DIAMBIL", "SELESAI"].includes(opts.status);
    const requiresCollection = opts.status === "SELESAI";

    /*
     * Lifecycle stamps, each derived from the stage before it rather than all
     * three from the submission time: the trail is then monotonic (verified
     * before signed, signed before collected) and `phaseStamp` keeps every
     * timestamp in the past, so the audit log never reports an event that has
     * not happened yet.
     */
    const verifiedAt = requiresVerification
      ? phaseStamp(rng, opts.submittedAt, 20, 300, now)
      : null;
    const signedAt = verifiedAt ? phaseStamp(rng, verifiedAt, 180, 1200, now) : null;
    const completedAt = signedAt && requiresCollection ? phaseStamp(rng, signedAt, 60, 360, now) : null;

    const required = template.requirements.filter((r) => r.mandatory).length;
    const optional = template.requirements.length - required;

    // Incomplete-file cases are exactly the ones that stall at verification.
    const isIncomplete = opts.status === "BERKAS_TIDAK_LENGKAP" || (opts.status === "PENDING_VERIFIKASI" && rng() < 0.22);
    const uploaded = isIncomplete
      ? Math.max(1, required - (rng() < 0.5 ? 1 : 2))
      : required + (optional > 0 && rng() < 0.35 ? 1 : 0);

    const defect = isIncomplete
      ? weighted(
          rng,
          ["KTP Buram", "Surat Pengantar RT belum dilegalisir", "KK terpotong", "Scan tidak terbaca", "Berkas belum lengkap"],
          [26, 22, 14, 18, 20],
        )
      : null;

    const purposes = PURPOSE_TEMPLATES[letterType.code] ?? ["Keperluan administrasi umum"];
    const dueAt = new Date(
      opts.submittedAt.getTime() + letterType.slaDays * 86_400_000,
    );

    const channel = weighted(rng, ["WEBSITE", "LOKET", "WHATSAPP"], [58, 27, 15]);

    return {
      ticket: `SRT-${ticketCounter++}`,
      villageId: village.id,
      letterTypeId: letterType.id,
      applicantResidentId: applicant.id,
      applicantName: applicant.full_name,
      applicantNik: applicant.nik,
      applicantPhone: applicant.phone,
      familyId: applicant.family_id,
      neighborhoodId: applicant.neighborhood_id,
      address: applicant.address,
      purpose: pick(rng, purposes),
      payload: {
        dusun: label.dusun,
        rt: label.rt,
        rw: label.rw,
        lamaDomisili: `${intBetween(rng, 1, 24)} tahun`,
        usaha: letterType.code === "SKU" ? pickupBusiness(rng) : null,
      },
      status: opts.status,
      priority: opts.priority,
      channel,
      documentsUploaded: uploaded,
      documentsRequired: required,
      complianceNote: defect,
      assignedStaffId:
        opts.status === "SELESAI" || opts.status === "SIAP_DIAMBIL" || opts.status === "DITANDATANGANI"
          ? operatorStaff.id
          : opts.status === "MENUNGGU_TTD_KADES"
            ? sekdes.id
            : rng() < 0.55
              ? primaryStaff.id
              : null,
      rejectionReason:
        opts.status === "BERKAS_TIDAK_LENGKAP"
          ? `${defect ?? "Berkas tidak lengkap"} — mohon lengkapi dan ajukan kembali.`
          : null,
      submittedAt: opts.submittedAt,
      dueAt,
      verifiedAt,
      signedAt,
      completedAt,
      verificationCode: verificationCode(rng),
      agendaNumber: 400 + opts.index,
    };
  };

  // --- today's arrivals ----------------------------------------------------
  for (let i = 0; i < TODAY_COUNT; i += 1) {
    const isUnprocessed = i < TODAY_UNPROCESSED;
    const status = isUnprocessed
      ? i < 6
        ? ("PENDING_VERIFIKASI" as const)
        : ("BERKAS_TIDAK_LENGKAP" as const)
      : weighted(
          rng,
          ["DIVERIFIKASI", "MENUNGGU_TTD_KADES", "DITANDATANGANI"] as const,
          [3, 5, 2],
        );

    requestValues.push(
      buildRequest({
        submittedAt: asInstant(
          new Date(startOfToday.getTime() + (8 * 60 + todayArrivalMinutes[i]) * 60_000),
        ),
        status,
        priority: weighted(rng, ["NORMAL", "PRIORITAS", "DARURAT"], [78, 18, 4]),
        index: i,
      }),
    );
  }

  // --- older backlog -------------------------------------------------------
  for (let i = 0; i < BACKLOG_COUNT; i += 1) {
    const daysAgo = intBetween(rng, 1, 9);
    const minuteOfDay = intBetween(rng, 480, 900);
    const submittedAt = asInstant(
      new Date(startOfToday.getTime() - daysAgo * 86_400_000 + minuteOfDay * 60_000),
    );

    requestValues.push(
      buildRequest({
        submittedAt,
        status: weighted(
          rng,
          statusPlan.map((s) => s.status),
          statusPlan.map((s) => s.weight),
        ),
        priority: weighted(rng, ["NORMAL", "PRIORITAS", "DARURAT"], [74, 21, 5]),
        index: TODAY_COUNT + i,
      }),
    );
  }

  const requestRows = await db.insert(t.letterRequests).values(requestValues).returning();

  /* ------------------------------------------------------------- attachments */
  type AttachmentInsert = typeof t.letterAttachments.$inferInsert;
  const attachmentValues: AttachmentInsert[] = [];

  for (const request of requestRows) {
    const letterType = letterTypeRows.find((lt) => lt.id === request.letterTypeId)!;
    const template = LETTER_TYPES.find((l) => l.code === letterType.code)!;
    const ordered = template.requirements;
    const uploadedCount = request.documentsUploaded;

    ordered.forEach((req, i) => {
      if (i >= uploadedCount) return; // not uploaded -> renders as a gap in the drawer

      // Exactly one blocking defect per incomplete request.
      const isDefective =
        request.complianceNote !== null &&
        i === Math.max(0, uploadedCount - 1) &&
        request.documentsUploaded < request.documentsRequired;

      attachmentValues.push({
        requestId: request.id,
        docKey: req.docKey,
        label: req.label,
        fileName: `${request.ticket}-${req.docKey.toLowerCase().replace(/_/g, "-")}.jpg`,
        storageKey: `villages/${village.id}/requests/${request.id}/${req.docKey}.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: intBetween(rng, 180_000, 3_400_000),
        status: isDefective ? "BURAM" : "LENGKAP",
        defectNote: isDefective ? request.complianceNote : null,
        uploadedAt: new Date(request.submittedAt.getTime() + i * intBetween(rng, 60, 900) * 1000),
        verifiedByStaffId: request.verifiedAt ? primaryStaff.id : null,
      });
    });
  }

  for (let i = 0; i < attachmentValues.length; i += 400) {
    await db.insert(t.letterAttachments).values(attachmentValues.slice(i, i + 400));
  }

  /* ------------------------------------------------------ signature requests */
  const pendingSignatureRequests = requestRows.filter((r) => r.status === "MENUNGGU_TTD_KADES");
  const signedRequests = requestRows.filter(
    (r) => r.status === "DITANDATANGANI" || r.status === "SIAP_DIAMBIL" || r.status === "SELESAI",
  );

  const signatureValues: (typeof t.signatureRequests.$inferInsert)[] = [
    ...pendingSignatureRequests.map((r) => ({
      requestId: r.id,
      requestedByStaffId: sekdes.id,
      signerStaffId: kades.id,
      status: "MENUNGGU" as const,
      requestedAt: new Date(
        Math.max(
          r.submittedAt.getTime() + 90 * 60_000,
          asInstant(new Date(startOfToday.getTime() + 8 * 3600_000 + 12 * 60_000)).getTime(),
        ),
      ),
      expiresAt: new Date(Date.now() + 3 * 86_400_000),
      note: "Berkas telah diverifikasi lengkap oleh Sekretaris Desa.",
    })),
    ...signedRequests.map((r) => ({
      requestId: r.id,
      requestedByStaffId: sekdes.id,
      signerStaffId: kades.id,
      status: "DITANDATANGANI" as const,
      certificateSerial: `BSrE-${verificationCode(rng)}`,
      requestedAt: new Date(Math.max(r.submittedAt.getTime() + 60 * 60_000, Date.now() - 5 * 86_400_000)),
      signedAt: r.signedAt ?? new Date(),
      note: null,
    })),
  ];

  if (signatureValues.length) {
    await db.insert(t.signatureRequests).values(signatureValues);
  }

  /* --------------------------------------------------------- citizen reports */
  const reportStatusPlan = [
    { status: "NEW", count: 3, weight: 0 },
    { status: "IN_PROGRESS", count: 2, weight: 0 },
    { status: "RESOLVED", count: 9, weight: 0 },
    { status: "REJECTED", count: 2, weight: 0 },
  ];

  type ReportInsert = typeof t.citizenReports.$inferInsert;
  const reportValues: ReportInsert[] = [];
  let reportTicket = 300;

  const usedSubjects = new Set<string>();
  for (const plan of reportStatusPlan) {
    for (let i = 0; i < plan.count; i += 1) {
      const category = pick(rng, CARGO_CATEGORIES);
      const pool = REPORT_SUBJECTS[category] ?? REPORT_SUBJECTS.LAINNYA;
      let template = pick(rng, pool);
      // Avoid duplicate headlines inside the same worklist.
      let attempts = 0;
      while (usedSubjects.has(template.subject) && attempts < 8) {
        template = pick(rng, pool);
        attempts += 1;
      }
      usedSubjects.add(template.subject);

      const applicant = applicants[(reportTicket * 11) % applicants.length];
      const daysAgo = plan.status === "NEW" ? 0 : intBetween(rng, 1, 21);

      reportValues.push({
        ticket: `LPR-${reportTicket++}`,
        villageId: village.id,
        reporterName: applicant.full_name,
        reporterNik: applicant.nik,
        reporterPhone: applicant.phone,
        neighborhoodId: applicant.neighborhood_id,
        category,
        subject: template.subject,
        body: template.body,
        status: plan.status,
        priority: weighted(rng, ["NORMAL", "PRIORITAS"], [82, 18]),
        handledByStaffId:
          plan.status === "NEW" ? null : [kaurTu.id, primaryStaff.id, operatorStaff.id][i % 3],
        responseCount: plan.status === "NEW" ? 0 : intBetween(rng, 1, 5),
        submittedAt:
          daysAgo === 0
            ? new Date(now.getTime() - intBetween(rng, 25, 300) * 60_000)
            : new Date(now.getTime() - daysAgo * 86_400_000 - intBetween(rng, 0, 20) * 3600_000),
        resolvedAt:
          plan.status === "RESOLVED"
            ? new Date(now.getTime() - intBetween(rng, 1, daysAgo) * 86_400_000)
            : null,
      });
    }
  }

  await db.insert(t.citizenReports).values(reportValues);

  /* ----------------------------------------------------------- announcements */
  await db.insert(t.announcements).values(
    ANNOUNCEMENT_TEMPLATES.map((a, i) => ({
      villageId: village.id,
      title: a.title,
      slug: slugify(a.title),
      excerpt: a.excerpt,
      body: a.body,
      channel: a.channel,
      status: a.status,
      priority: a.priority,
      pinned: a.pinned,
      attachmentCount: i === 1 ? 2 : 0,
      audience: a.audience,
      authorStaffId: i % 2 === 0 ? sekdes.id : kaurTu.id,
      publishAt:
        a.status === "TERBIT"
          ? new Date(now.getTime() - intBetween(rng, 2, 40) * 86_400_000)
          : a.status === "TERJADWAL"
            ? new Date(now.getTime() + 3 * 86_400_000)
            : null,
      expiresAt: a.pinned ? new Date(now.getTime() + 30 * 86_400_000) : null,
      viewCount: a.status === "TERBIT" ? intBetween(rng, 120, 2400) : 0,
    })),
  );

  /* ------------------------------------------------------------ audit trail */
  type ActivityInsert = typeof t.activityLog.$inferInsert;
  const activity: ActivityInsert[] = [];

  const addActivity = (
    entry: Omit<ActivityInsert, "villageId"> & { villageId?: string },
  ) => activity.push({ villageId: village.id, ...entry });

  // New submissions from the last few hours.
  requestRows
    .filter((r) => r.submittedAt >= new Date(now.getTime() - 26 * 3600_000))
    .slice(0, 9)
    .forEach((r) => {
      const lt = letterTypeRows.find((x) => x.id === r.letterTypeId)!;
      addActivity({
        kind: "PENGAJUAN_BARU",
        summary: `${r.ticket} — ${r.applicantName} mengajukan ${lt.name} melalui ${r.channel.toLowerCase()}.`,
        subjectType: "letter_request",
        subjectId: r.id,
        subjectRef: r.ticket,
        actorStaffId: null,
        actorName: "Sistem Pengajuan Warga",
        actorInitials: "SW",
        actorRole: "Kanal Publik",
        meta: { channel: r.channel, letterType: lt.code, uploaded: r.documentsUploaded },
        occurredAt: r.submittedAt,
      });
    });

  // Verifications, signatures, prints.
  requestRows
    .filter((r) => r.verifiedAt)
    .slice(0, 7)
    .forEach((r) => {
      const lt = letterTypeRows.find((x) => x.id === r.letterTypeId)!;
      addActivity({
        kind: r.complianceNote ? "PENOLAKAN" : "VERIFIKASI_BERKAS",
        summary: r.complianceNote
          ? `${r.ticket} ditolak sementara — ${r.complianceNote}. Warga telah dinotifikasi melalui WhatsApp.`
          : `Berkas ${r.ticket} (${lt.code}) dinyatakan lengkap oleh ${primaryStaff.fullName}.`,
        subjectType: "letter_request",
        subjectId: r.id,
        subjectRef: r.ticket,
        actorStaffId: primaryStaff.id,
        actorName: primaryStaff.fullName,
        actorInitials: primaryStaff.initials,
        actorRole: primaryStaff.jobTitle,
        meta: { letterType: lt.code, documents: `${r.documentsUploaded}/${r.documentsRequired}` },
        occurredAt: r.verifiedAt!,
      });
    });

  requestRows
    .filter((r) => r.signedAt)
    .slice(0, 5)
    .forEach((r) => {
      const lt = letterTypeRows.find((x) => x.id === r.letterTypeId)!;
      addActivity({
        kind: "TANDA_TANGAN",
        summary: `${lt.name} ${r.ticket} ditandatangani digital oleh Kepala Desa.`,
        subjectType: "letter_request",
        subjectId: r.id,
        subjectRef: r.ticket,
        actorStaffId: kades.id,
        actorName: kades.fullName,
        actorInitials: kades.initials,
        actorRole: kades.jobTitle,
        meta: { letterType: lt.code, verificationCode: r.verificationCode },
        occurredAt: r.signedAt!,
      });
    });

  requestRows
    .filter((r) => r.status === "SELESAI")
    .slice(0, 4)
    .forEach((r) => {
      const lt = letterTypeRows.find((x) => x.id === r.letterTypeId)!;
      addActivity({
        kind: "CETAK_SURAT",
        summary: `${r.ticket} (${lt.code}) dicetak dengan QR verifikasi ${r.verificationCode} dan diserahkan ke pemohon.`,
        subjectType: "letter_request",
        subjectId: r.id,
        subjectRef: r.ticket,
        actorStaffId: operatorStaff.id,
        actorName: operatorStaff.fullName,
        actorInitials: operatorStaff.initials,
        actorRole: operatorStaff.jobTitle,
        meta: { qr: r.verificationCode, printed: true, letterType: lt.code },
        occurredAt: r.completedAt ?? new Date(Date.now() - 3_600_000),
      });
    });

  // Population mutations.
  recentMutationResidents.rows.slice(0, 3).forEach((r, i) => {
    addActivity({
      kind: "MUTASI_PENDUDUK",
      summary:
        i === 0
          ? `Data kependudukan ${r.full_name} diperbarui — perbaikan status perkawinan setelah verifikasi akta.`
          : `Mutasi penduduk dicatat: ${r.full_name} pindah datang dari Kecamatan Ciwidey.`,
      subjectType: "resident",
      subjectId: r.id,
      subjectRef: null,
      actorStaffId: operatorStaff.id,
      actorName: operatorStaff.fullName,
      actorInitials: operatorStaff.initials,
      actorRole: operatorStaff.jobTitle,
      meta: { mutation: i === 0 ? "PERBAIKAN_DATA" : "PINDAH_DATANG" },
      occurredAt: new Date(now.getTime() - intBetween(rng, 30, 400) * 60_000),
    });
  });

  // Announcement publication.
  addActivity({
    kind: "PENGUMUMAN",
    summary:
      "Pengumuman \"Penyaluran BLT-DD Tahap III\" diterbitkan ke website desa dan disematkan di halaman depan.",
    subjectType: "announcement",
    subjectId: null,
    subjectRef: null,
    actorStaffId: sekdes.id,
    actorName: sekdes.fullName,
    actorInitials: sekdes.initials,
    actorRole: sekdes.jobTitle,
    meta: { channel: "WEBSITE_DESA", pinned: true },
    occurredAt: new Date(now.getTime() - intBetween(rng, 60, 500) * 60_000),
  });

  addActivity({
    kind: "MASUK_LOG",
    summary: `${primaryStaff.fullName} memulai shift pelayanan loket (Loket Pelayanan 01).`,
    subjectType: "staff",
    subjectId: primaryStaff.id,
    subjectRef: null,
    actorStaffId: primaryStaff.id,
    actorName: primaryStaff.fullName,
    actorInitials: primaryStaff.initials,
    actorRole: primaryStaff.jobTitle,
    meta: { station: "Loket Pelayanan 01", ip: "10.10.4.27" },
    occurredAt: asInstant(new Date(startOfToday.getTime() + 7.5 * 3600_000)),
  });

  await db.insert(t.activityLog).values(activity);

  /* ---------------------------------------------------------- notifications */
  const overdueCount = requestRows.filter(
    (r) =>
      r.dueAt !== null &&
      r.dueAt < now &&
      ["PENDING_VERIFIKASI", "BERKAS_TIDAK_LENGKAP", "DIVERIFIKASI", "MENUNGGU_TTD_KADES"].includes(r.status),
  ).length;

  await db.insert(t.notifications).values([
    {
      villageId: village.id,
      recipientStaffId: primaryStaff.id,
      title: `${pendingSignatureRequests.length} surat menunggu tanda tangan Kepala Desa`,
      body: "Sekdes telah menyelesaikan verifikasi. Mohon diteruskan ke agenda tanda tangan hari ini.",
      severity: "WARNING",
      href: "/?status=MENUNGGU_TTD_KADES",
      createdAt: new Date(now.getTime() - 22 * 60_000),
    },
    {
      villageId: village.id,
      recipientStaffId: primaryStaff.id,
      title: `${overdueCount} pengajuan melewati batas SLA`,
      body: "Pengajuan yang melewati jatuh tempo perlu ditindaklanjuti sebelum akhir hari kerja.",
      severity: "CRITICAL",
      href: "/?sla=overdue",
      createdAt: new Date(now.getTime() - 47 * 60_000),
    },
    {
      villageId: village.id,
      recipientStaffId: null,
      title: "3 laporan warga baru masuk dari kanal website",
      body: "Kategori infrastruktur dan air bersih memerlukan penugasan petugas.",
      severity: "INFO",
      href: "/laporan",
      createdAt: new Date(now.getTime() - 96 * 60_000),
    },
    {
      villageId: village.id,
      recipientStaffId: primaryStaff.id,
      title: "Sertifikat e-Sign Kepala Desa diperbarui",
      body: "Sertifikat BSrE berlaku sampai 12 Agustus 2027. Tidak ada tindakan yang diperlukan.",
      severity: "SUCCESS",
      href: null,
      readAt: new Date(now.getTime() - 3 * 3600_000),
      createdAt: new Date(now.getTime() - 5 * 3600_000),
    },
    {
      villageId: village.id,
      recipientStaffId: primaryStaff.id,
      title: "Sinkronisasi data Disdukcapil berhasil",
      body: "1.412 Kartu Keluarga dan 4.821 jiwa tersinkron pada pukul 05.00 WIB.",
      severity: "SUCCESS",
      href: null,
      readAt: new Date(now.getTime() - 6 * 3600_000),
      createdAt: asInstant(new Date(startOfToday.getTime() + 5 * 3600_000)),
    },
    {
      villageId: village.id,
      recipientStaffId: primaryStaff.id,
      title: "Pengingat: cetak berkas arsip bulan lalu",
      body: "32 surat selesai bulan lalu belum ditandai tercetak pada arsip fisik.",
      severity: "INFO",
      href: "/arsip",
      readAt: new Date(now.getTime() - 20 * 3600_000),
      createdAt: new Date(now.getTime() - 30 * 3600_000),
    },
  ]);

  /* ------------------------------------------------------------- daily stats */
  const statValues: (typeof t.dailyStats.$inferInsert)[] = [];
  let residentTotal = TARGET_ACTIVE_RESIDENTS;
  let familyTotal = TARGET_FAMILIES;

  for (let d = 29; d >= 0; d -= 1) {
    const day = new Date(startOfToday.getTime() - d * 86_400_000);
    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
    const received = isWeekend ? intBetween(rng, 1, 5) : intBetween(rng, 9, 19);
    const completed = Math.min(received + intBetween(rng, 0, 3), received + 4);

    statValues.push({
      villageId: village.id,
      statDate: day.toISOString().slice(0, 10),
      lettersReceived: d === 0 ? TODAY_COUNT : received,
      lettersCompleted: isWeekend ? intBetween(rng, 1, 4) : completed,
      lettersRejected: intBetween(rng, 0, 2),
      lettersPrinted: isWeekend ? 0 : intBetween(rng, 4, 14),
      activeResidents: residentTotal,
      activeFamilies: familyTotal,
      reportsNew: intBetween(rng, 0, 4),
      danaDesaDisbursed: String(intBetween(rng, 18_000_000, 96_000_000)),
    });

    // Walk the census backwards so the trend line tells a true story.
    residentTotal -= intBetween(rng, 0, 3);
    familyTotal -= rng() < 0.4 ? 1 : 0;
  }

  await db.insert(t.dailyStats).values(statValues);

  return {
    skipped: false as const,
    durationMs: Date.now() - started,
    counts: {
      villagers: residentValues.length,
      families: familyRows.length,
      neighborhoods: neighborhoodRows.length,
      staff: staffRows.length,
      letterTypes: letterTypeRows.length,
      requests: requestRows.length,
      attachments: attachmentValues.length,
      activities: activity.length,
      reports: reportValues.length,
    },
    sampleTicket: requestRows[0]?.ticket ?? null,
  };
}

const BUSINESS_NAMES = [
  "Warung Sembako Bu Imas",
  "Toko Bangunan Cikembang Jaya",
  "Bengkel Motor Asep",
  "Warung Kopi Cimuncang",
  "Konveksi Sunda Rizki",
  "Peternakan Ayam Pak Ujang",
  "Kios Sayur Pasirhalang",
  "Jasa Jahit Neneng",
  "Toko Kelontong Sukajadi",
  "Katering Ibu Lilis",
];

function pickupBusiness(rng: Next) {
  return pick(rng, BUSINESS_NAMES);
}
