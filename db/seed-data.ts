/**
 * Reference data for Desa Sukamaju.
 *
 * Kept separate from the seeding *logic* in `db/seed.ts` so the vocabulary
 * (names, dusun layout, letter catalogue) can be reviewed and corrected by the
 * village office without touching any algorithm.
 */

export const VILLAGE = {
  name: "Desa Sukamaju",
  district: "Kecamatan Cimaung",
  regency: "Kabupaten Bandung",
  province: "Jawa Barat",
  postalCode: "40374",
  villageCode: "32.04.16.2007",
  headName: "H. Ahmad Suryadi, S.Sos.",
  headNipd: "196804121990031004",
  officeAddress: "Jl. Raya Cimaung No. 24, Sukamaju, Kec. Cimaung, Kab. Bandung 40374",
  officePhone: "(022) 5947012",
  officeEmail: "pemdes.sukamaju@bandung.go.id",
  website: "sukamaju.desa.id",
  sealUrl: "/seal-desa-sukamaju.svg",
  establishedYear: 1912,
} as const;

export const HAMLETS = [
  { code: "D01", name: "Dusun 01 - Cikembang", headName: "Suparman Efendi" },
  { code: "D02", name: "Dusun 02 - Babakan", headName: "Endang Kurnia" },
  { code: "D03", name: "Dusun 03 - Cimuncang", headName: "Dedi Supriadi" },
  { code: "D04", name: "Dusun 04 - Pasirhalang", headName: "Asep Saepudin" },
] as const;

/** RT/RW blocks per dusun, mirroring the real administrative split. */
export const NEIGHBORHOODS: Record<string, { rt: number; rw: number; headName: string }[]> = {
  D01: [
    { rt: 1, rw: 1, headName: "Ujang Solihin" },
    { rt: 2, rw: 1, headName: "Wahyu Hidayat" },
    { rt: 3, rw: 1, headName: "Nandang Suryana" },
    { rt: 4, rw: 2, headName: "Tatang Sutisna" },
  ],
  D02: [
    { rt: 1, rw: 2, headName: "Rudi Hartono" },
    { rt: 2, rw: 2, headName: "Iwan Setiawan" },
    { rt: 3, rw: 3, headName: "Yayan Ruhiyat" },
  ],
  D03: [
    { rt: 4, rw: 2, headName: "Slamet Riyadi" },
    { rt: 1, rw: 3, headName: "Cecep Nurdin" },
    { rt: 2, rw: 3, headName: "Dadan Hamdani" },
  ],
  D04: [
    { rt: 3, rw: 3, headName: "Aan Sujana" },
    { rt: 4, rw: 4, headName: "Heri Gunawan" },
  ],
};

export const STAFF = [
  {
    fullName: "Budi Santoso, S.Kom.",
    jobTitle: "Kasi Pelayanan",
    role: "KASI_PELAYANAN" as const,
    nipd: "198503152010011002",
    email: "budi.santoso@sukamaju.desa.id",
    phone: "0812-2345-6789",
    initials: "BS",
    canSign: false,
    isPrimary: true,
  },
  {
    fullName: "H. Ahmad Suryadi, S.Sos.",
    jobTitle: "Kepala Desa",
    role: "KADES" as const,
    nipd: "196804121990031004",
    email: "kades@sukamaju.desa.id",
    phone: "0813-1100-2200",
    initials: "AS",
    canSign: true,
  },
  {
    fullName: "Dewi Kartika, S.E.",
    jobTitle: "Sekretaris Desa",
    role: "SEKDES" as const,
    nipd: "198709202011012005",
    email: "sekdes@sukamaju.desa.id",
    phone: "0821-4455-7788",
    initials: "DK",
    canSign: false,
  },
  {
    fullName: "Rina Marlina, A.Md.",
    jobTitle: "Operator Desa",
    role: "OPERATOR_DESA" as const,
    nipd: "199402112019022003",
    email: "operator@sukamaju.desa.id",
    phone: "0878-2233-9911",
    initials: "RM",
    canSign: false,
  },
  {
    fullName: "Yusuf Ramadhan",
    jobTitle: "Kaur Tata Usaha & Umum",
    role: "KAUR_TU" as const,
    nipd: "199001072015031001",
    email: "kaurtu@sukamaju.desa.id",
    phone: "0857-8899-1122",
    initials: "YR",
    canSign: false,
  },
  {
    fullName: "Suparman Efendi",
    jobTitle: "Kepala Dusun 01",
    role: "KADUS" as const,
    nipd: "197505101999031002",
    email: "kadus01@sukamaju.desa.id",
    phone: "0819-3344-5566",
    initials: "SE",
    canSign: false,
  },
  {
    fullName: "Endang Kurnia",
    jobTitle: "Kepala Dusun 02",
    role: "KADUS" as const,
    nipd: "197811232003121003",
    email: "kadus02@sukamaju.desa.id",
    phone: "0812-7788-3344",
    initials: "EK",
    canSign: false,
  },
  {
    fullName: "Fitri Handayani, S.Pd.",
    jobTitle: "Staf Pelayanan Loket",
    role: "OPERATOR_DESA" as const,
    nipd: "199607152021012004",
    email: "fitri.handayani@sukamaju.desa.id",
    phone: "0895-1122-8899",
    initials: "FH",
    canSign: false,
  },
] as const;

export const LETTER_TYPES = [
  {
    code: "SKU",
    name: "Surat Keterangan Usaha",
    templateTitle: "SURAT KETERANGAN USAHA",
    description:
      "Keterangan domisili & keberadaan usaha milik warga, untuk keperluan permodalan dan perizinan.",
    slaDays: 2,
    requiresKadesSignature: true,
    feeIdr: 0,
    sortOrder: 1,
    requirements: [
      { docKey: "KTP", label: "KTP Pemohon", mandatory: true },
      { docKey: "KK", label: "Kartu Keluarga", mandatory: true },
      { docKey: "PENGANTAR_RT", label: "Surat Pengantar RT/RW", mandatory: true },
      { docKey: "FOTO_USAHA", label: "Foto Tempat Usaha", mandatory: false },
    ],
  },
  {
    code: "SKCK",
    name: "Surat Pengantar SKCK",
    templateTitle: "SURAT PENGANTAR CATATAN KEPOLISIAN (SKCK)",
    description: "Pengantar dari desa untuk penerbitan SKCK di Polres Kabupaten Bandung.",
    slaDays: 1,
    requiresKadesSignature: true,
    feeIdr: 0,
    sortOrder: 2,
    requirements: [
      { docKey: "KTP", label: "KTP Pemohon", mandatory: true },
      { docKey: "KK", label: "Kartu Keluarga", mandatory: true },
      { docKey: "PENGANTAR_RT", label: "Surat Pengantar RT/RW", mandatory: true },
      { docKey: "AKTA_KELAHIRAN", label: "Akta Kelahiran / Ijazah", mandatory: true },
    ],
  },
  {
    code: "SKD",
    name: "Surat Keterangan Domisili",
    templateTitle: "SURAT KETERANGAN DOMISILI",
    description: "Menerangkan alamat tempat tinggal warga untuk keperluan administrasi.",
    slaDays: 2,
    requiresKadesSignature: true,
    feeIdr: 0,
    sortOrder: 3,
    requirements: [
      { docKey: "KTP", label: "KTP Pemohon", mandatory: true },
      { docKey: "KK", label: "Kartu Keluarga", mandatory: true },
      { docKey: "PENGANTAR_RT", label: "Surat Pengantar RT/RW", mandatory: true },
    ],
  },
  {
    code: "SKM",
    name: "Surat Keterangan Kematian",
    templateTitle: "SURAT KETERANGAN KEMATIAN",
    description: "Keterangan kematian warga untuk pengurusan akta dan administrasi waris.",
    slaDays: 1,
    requiresKadesSignature: true,
    feeIdr: 0,
    sortOrder: 4,
    requirements: [
      { docKey: "KTP", label: "KTP Almarhum/Almarhumah", mandatory: true },
      { docKey: "KK", label: "Kartu Keluarga", mandatory: true },
      { docKey: "SURAT_RT", label: "Surat Keterangan RT/RW", mandatory: true },
      { docKey: "KETERANGAN_MEDIS", label: "Surat Keterangan Medis", mandatory: false },
    ],
  },
  {
    code: "SKTM",
    name: "Surat Keterangan Tidak Mampu",
    templateTitle: "SURAT KETERANGAN TIDAK MAMPU",
    description: "Untuk keringanan biaya pendidikan, kesehatan, dan bantuan sosial.",
    slaDays: 3,
    requiresKadesSignature: true,
    feeIdr: 0,
    sortOrder: 5,
    requirements: [
      { docKey: "KTP", label: "KTP Pemohon", mandatory: true },
      { docKey: "KK", label: "Kartu Keluarga", mandatory: true },
      { docKey: "PENGANTAR_RT", label: "Surat Pengantar RT/RW", mandatory: true },
      { docKey: "FOTO_RUMAH", label: "Foto Rumah Tampak Depan", mandatory: true },
    ],
  },
  {
    code: "SKL",
    name: "Surat Keterangan Kelahiran",
    templateTitle: "SURAT KETERANGAN KELAHIRAN",
    description: "Keterangan kelahiran bayi untuk penerbitan akta kelahiran di Disdukcapil.",
    slaDays: 2,
    requiresKadesSignature: true,
    feeIdr: 0,
    sortOrder: 6,
    requirements: [
      { docKey: "KTP", label: "KTP Orang Tua", mandatory: true },
      { docKey: "KK", label: "Kartu Keluarga", mandatory: true },
      { docKey: "SURAT_RT", label: "Surat Keterangan RT/RW", mandatory: true },
      { docKey: "KETERANGAN_MEDIS", label: "Surat Keterangan Bidan/RS", mandatory: true },
    ],
  },
  {
    code: "SKP",
    name: "Surat Keterangan Pindah",
    templateTitle: "SURAT KETERANGAN PINDAH DATANG",
    description: "Pengantar mutasi penduduk antar wilayah kecamatan/kabupaten.",
    slaDays: 3,
    requiresKadesSignature: true,
    feeIdr: 0,
    sortOrder: 7,
    requirements: [
      { docKey: "KTP", label: "KTP Pemohon", mandatory: true },
      { docKey: "KK", label: "Kartu Keluarga", mandatory: true },
      { docKey: "PENGANTAR_RT", label: "Surat Pengantar RT/RW", mandatory: true },
    ],
  },
  {
    code: "IZN",
    name: "Surat Keterangan Izin Keramaian",
    templateTitle: "SURAT IZIN KERAMAIAN",
    description: "Izin kegiatan/hajatan skala lingkungan, diteruskan ke Polsek.",
    slaDays: 4,
    requiresKadesSignature: true,
    feeIdr: 25000,
    sortOrder: 8,
    requirements: [
      { docKey: "KTP", label: "KTP Penanggung Jawab", mandatory: true },
      { docKey: "KK", label: "Kartu Keluarga", mandatory: true },
      { docKey: "PENGANTAR_RT", label: "Surat Pengantar RT/RW", mandatory: true },
      { docKey: "PROPOSAL", label: "Proposal / Susunan Acara", mandatory: true },
    ],
  },
  {
    code: "SKH",
    name: "Surat Keterangan Penghasilan",
    templateTitle: "SURAT KETERANGAN PENGHASILAN",
    description: "Keterangan penghasilan orang tua untuk beasiswa atau kredit bank.",
    slaDays: 2,
    requiresKadesSignature: true,
    feeIdr: 0,
    sortOrder: 9,
    requirements: [
      { docKey: "KTP", label: "KTP Pemohon", mandatory: true },
      { docKey: "KK", label: "Kartu Keluarga", mandatory: true },
      { docKey: "PENGANTAR_RT", label: "Surat Pengantar RT/RW", mandatory: true },
      { docKey: "SLIP_GAJI", label: "Surat Keterangan Penghasilan", mandatory: false },
    ],
  },
  {
    code: "SKT",
    name: "Surat Keterangan Kepemilikan Tanah",
    templateTitle: "SURAT KETERANGAN KEPEMILIKAN TANAH",
    description: "Keterangan riwayat kepemilikan tanah (Letter C) untuk keperluan sertifikasi.",
    slaDays: 5,
    requiresKadesSignature: true,
    feeIdr: 50000,
    sortOrder: 10,
    requirements: [
      { docKey: "KTP", label: "KTP Pemohon", mandatory: true },
      { docKey: "KK", label: "Kartu Keluarga", mandatory: true },
      { docKey: "SERTIFIKAT_TANAH", label: "Bukti Kepemilikan / Letter C", mandatory: true },
      { docKey: "PENGANTAR_RT", label: "Surat Pengantar RT/RW", mandatory: true },
      { docKey: "BUKTI_PBB", label: "Bukti Pembayaran PBB", mandatory: true },
    ],
  },
  {
    code: "SKN",
    name: "Surat Keterangan Belum Menikah",
    templateTitle: "SURAT KETERANGAN BELUM MENIKAH",
    description: "Keterangan status belum menikah untuk keperluan pernikahan atau pekerjaan.",
    slaDays: 2,
    requiresKadesSignature: true,
    feeIdr: 0,
    sortOrder: 11,
    requirements: [
      { docKey: "KTP", label: "KTP Pemohon", mandatory: true },
      { docKey: "KK", label: "Kartu Keluarga", mandatory: true },
      { docKey: "PENGANTAR_RT", label: "Surat Pengantar RT/RW", mandatory: true },
    ],
  },
  {
    code: "SKB",
    name: "Surat Keterangan Beda Nama",
    templateTitle: "SURAT KETERANGAN BEDA NAMA",
    description: "Menjelaskan perbedaan penulisan nama antar dokumen kependudukan.",
    slaDays: 3,
    requiresKadesSignature: true,
    feeIdr: 0,
    sortOrder: 12,
    requirements: [
      { docKey: "KTP", label: "KTP Pemohon", mandatory: true },
      { docKey: "KK", label: "Kartu Keluarga", mandatory: true },
      { docKey: "DOKUMEN_SILANG", label: "Dokumen dengan Nama Berbeda", mandatory: true },
    ],
  },
] as const;

/* -------------------------------------------------------------------------- */
/* Name pools — drawn from the Sundanese/Indonesian naming conventions used in */
/* Kabupaten Bandung. Kept intentionally broad so the search and duplicate-    */
/* detection features have realistic collision rates.                          */
/* -------------------------------------------------------------------------- */

export const MALE_GIVEN = [
  "Agus", "Asep", "Bambang", "Budi", "Cecep", "Dadan", "Dadang", "Dede", "Dedi", "Deni",
  "Endang", "Erik", "Fajar", "Gilang", "Hafiz", "Hendra", "Heri", "Ilham", "Irfan", "Iwan",
  "Joko", "Lukman", "Nurdin", "Ridwan", "Rizki", "Rudi", "Sigit", "Slamet", "Tatang", "Taufik",
  "Ujang", "Udin", "Wahyu", "Wawan", "Yayan", "Yudi", "Yusuf", "Arif", "Dani", "Rahman",
  "Ajat", "Undang", "Nandang", "Solihin", "Aceng", "Adang", "Kurnia", "Surya", "Bagja", "Darma",
];

export const FEMALE_GIVEN = [
  "Siti", "Sri", "Nur", "Dewi", "Rina", "Yanti", "Euis", "Neneng", "Imas", "Tuti",
  "Umi", "Lilis", "Elin", "Fitri", "Aisyah", "Ratna", "Wati", "Ika", "Indah", "Kartika",
  "Lestari", "Maya", "Nia", "Wulan", "Yuliana", "Zulaikha", "Ani", "Bunga", "Citra", "Dini",
  "Erni", "Gina", "Hesti", "Intan", "Julia", "Komariah", "Lina", "Mega", "Ningsih", "Rahmi",
  "Ai", "Enung", "Cucu", "Popon", "Nunung", "Titin", "Winda", "Silvi", "Nabila", "Salma",
];

export const SURNAMES = [
  "Rahmawati", "Santoso", "Setiawan", "Wijaya", "Kusuma", "Pratama", "Hidayat", "Firmansyah",
  "Nugraha", "Permana", "Sudrajat", "Suherman", "Gunawan", "Saputra", "Ramadhan", "Maulana",
  "Firdaus", "Kurniawan", "Suryana", "Supriatna", "Maryam", "Hasanah", "Oktaviani", "Anggraeni",
  "Marlina", "Rosidah", "Suryani", "Wijayanti", "Yulianti", "Zakaria", "Sutisna", "Rukmana",
  "Hakim", "Iskandar", "Purnama", "Sihombing", "Wibowo", "Sudarman", "Rahayu", "Hartati",
  "Solihah", "Mulyadi", "Sasmita", "Nurhayati", "Suparman", "Rustandi", "Kosasih", "Suherlan",
];

export const PATRONYMIC_MALE = ["bin", "bin", "bin"];
export const PATRONYMIC_FEMALE = ["binti", "binti", "binti"];

export const BIRTH_PLACES = [
  "Bandung", "Cimaung", "Ciwidey", "Soreang", "Banjar", "Pangalengan", "Cicalengka",
  "Majalaya", "Garut", "Cimahi", "Sumedang", "Subang",
];

export const OCCUPATIONS_MALE = [
  "Petani", "Petani", "Petani", "Buruh Tani", "Buruh Harian Lepas", "Pedagang",
  "Wiraswasta", "Karyawan Swasta", "Tukang Bangunan", "Sopir", "Peternak", "Guru",
  "PNS", "TNI/Polri", "Pelajar/Mahasiswa", "Belum/Tidak Bekerja", "Pensiunan", "Nelayan",
];

export const OCCUPATIONS_FEMALE = [
  "Ibu Rumah Tangga", "Ibu Rumah Tangga", "Ibu Rumah Tangga", "Pedagang", "Petani",
  "Buruh Harian Lepas", "Karyawan Swasta", "Guru", "PNS", "Wiraswasta", "Karyawati Swasta",
  "Pelajar/Mahasiswa", "Belum/Tidak Bekerja", "Bidan", "Perawat", "Pensiunan",
];

export const EDUCATIONS = [
  "Tidak/Belum Sekolah", "SD/Sederajat", "SMP/Sederajat", "SMA/SMK/Sederajat",
  "D1/D2/D3", "S1/D4", "S2/S3",
];

export const RELIGIONS = [
  "ISLAM", "ISLAM", "ISLAM", "ISLAM", "ISLAM", "ISLAM", "ISLAM", "ISLAM",
  "KRISTEN", "KATOLIK", "HINDU", "BUDDHA",
] as const;

export const WELFARE_CLASSES = [
  "Pra-Sejahtera", "Pra-Sejahtera", "Sejahtera I", "Sejahtera I", "Sejahtera II",
  "Sejahtera II", "Sejahtera III", "Sejahtera III Plus",
];

export const DUSUN_ADDRESS_STREETS = [
  "Kp. Cikembang", "Kp. Babakan", "Kp. Cimuncang", "Kp. Pasirhalang", "Kp. Sukajadi",
  "Kp. Cibiru", "Kp. Ciloa", "Kp. Margahayu", "Kp. Cukanggenteng", "Kp. Pasirjambu",
];

export const CARGO_CATEGORIES = [
  "INFRASTRUKTUR",
  "KEBERSIHAN",
  "KEAMANAN",
  "AIR_BERSIH",
  "LAYANAN_PUBLIK",
  "LAINNYA",
] as const;

export const REPORT_SUBJECTS: Record<string, { subject: string; body: string }[]> = {
  INFRASTRUKTUR: [
    {
      subject: "Jalan gang RT 04 berlubang dan licin saat hujan",
      body: "Mohon perbaikan jalan gang di depan rumah warga RT 04 RW 02. Sudah dua kali pengendara motor terjatuh saat hujan karena jalan berlubang cukup dalam. Diharapkan dapat dianggarkan pada rehab jalan tahap berikutnya.",
    },
    {
      subject: "Jembatan bambu Dusun 03 rusak, rawan putus",
      body: "Jembatan penghubung antar RT di Dusun 03 kondisinya sudah miring dan beberapa papan bambu patah. Warga lansia dan anak sekolah melintas setiap hari. Mohon ditinjau bersama.",
    },
    {
      subject: "Drainase RT 01 tersumbat sampah, terjadi genangan",
      body: "Drainase di depan balai RW 01 tersumbat sehingga air menggenang setinggi mata kaki saat hujan deras. Mohon pengerukan rutin dan pemasangan penutup got.",
    },
  ],
  KEBERSIHAN: [
    {
      subject: "Tumpukan sampah di tepi pasar desa belum terangkut",
      body: "Sampah rumah tangga menumpuk di TPS pasar sejak tiga hari lalu dan mulai berbau. Mohon penjadwalan pengangkutan ditambah, terutama hari Senin dan Kamis.",
    },
    {
      subject: "Usulan bank sampah untuk Dusun 02",
      body: "Kami ingin mengusulkan pembentukan bank sampah di Dusun 02 mengingat banyak ibu-ibu PKK yang aktif mengumpulkan plastik bekas. Mohon difasilitasi pelatihan awal.",
    },
  ],
  KEAMANAN: [
    {
      subject: "Lampu penerangan jalan mati di 5 titik RW 03",
      body: "Lima titik lampu jalan mati dari pertigaan sampai ujung gang. Kondisi gelap membuat warga tidak nyaman keluar malam. Mohon pemasangan pengganti atau pemeliharaan.",
    },
  ],
  AIR_BERSIH: [
    {
      subject: "Aliran air PDAM Dusun 04 tidak lancar sejak 2 minggu",
      body: "Warga Dusun 04 kesulitan air bersih karena tekanan PDAM sangat kecil, terutama pagi hari. Mohon koordinasi ke Perumda Air Minum.",
    },
  ],
  LAYANAN_PUBLIK: [
    {
      subject: "Pengajuan surat pengantar SKCK belum ada kabar 4 hari",
      body: "Saya mengajukan surat pengantar SKCK melalui website pada tanggal 12 dan sudah melengkapi seluruh berkas, namun status belum berubah. Mohon dibantu pengecekan.",
    },
  ],
  LAINNYA: [
    {
      subject: "Usulan pelatihan UMKM digital untuk pelaku usaha kecil",
      body: "Banyak pelaku usaha di desa belum menguasai pemasaran daring. Kami mengusulkan pelatihan foto produk dan pemasaran marketplace bekerja sama dengan Dinas Koperasi.",
    },
  ],
};

export const ANNOUNCEMENT_TEMPLATES = [
  {
    title: "Jadwal Pelayanan Loket Desa Selama Bulan Puasa",
    excerpt:
      "Pelayanan loket maju 30 menit dan ditutup pukul 13.00 WIB selama bulan puasa. Pengajuan daring tetap diproses seperti biasa.",
    body: "Sehubungan dengan bulan suci Ramadan, jam pelayanan Kantor Desa Sukamaju disesuaikan: Senin–Jumat, pukul 08.00–13.00 WIB, dan loket dibuka mulai pukul 07.30 WIB. Pengajuan surat melalui website tetap dapat dilakukan 24 jam. Mohon maaf atas ketidaknyamanannya.",
    channel: "WEBSITE_DESA" as const,
    status: "TERBIT" as const,
    priority: "NORMAL" as const,
    pinned: true,
    audience: "Seluruh Warga",
  },
  {
    title: "Pengumuman Penyaluran Bantuan Langsung Tunai Dana Desa Tahap III",
    excerpt:
      "Penyaluran BLT-DD Tahap III dilaksanakan 3 hari kerja di Balai Desa. Warga penerima diharap membawa KTP dan KK asli.",
    body: "Penyaluran Bantuan Langsung Tunai Dana Desa (BLT-DD) Tahap III akan dilaksanakan secara berkala di Balai Desa Sukamaju. Penerima manfaat wajib hadir langsung dengan membawa KTP dan Kartu Keluarga asli. Jadwal lengkap per dusun akan ditempel di papan informasi RT/RW.",
    channel: "WEBSITE_DESA" as const,
    status: "TERBIT" as const,
    priority: "PRIORITAS" as const,
    pinned: true,
    audience: "Seluruh Warga",
  },
  {
    title: "Kerja Bakti Serentak: Normalisasi Saluran Irigasi Cikembang",
    excerpt:
      "Kerja bakti serentak seluruh dusun pada hari Minggu pukul 07.00 WIB, diikuti perangkat desa, RT/RW, dan karang taruna.",
    body: "Dalam rangka menyambut musim tanam, akan dilaksanakan kerja bakti serentak untuk normalisasi saluran irigasi Cikembang. Titik kumpul di masing-masing Balai RW. Warga diharapkan membawa peralatan yang diperlukan. Konsumsi disediakan oleh PKK Desa.",
    channel: "PAPAN_INFORMASI" as const,
    status: "TERJADWAL" as const,
    priority: "NORMAL" as const,
    pinned: false,
    audience: "Seluruh Warga",
  },
  {
    title: "Pemenang Sayembara Desain Maskot Desa Sukamaju",
    excerpt:
      "Terima kasih atas 47 karya yang masuk. Pemenang diumumkan pada laman ini dan akan diundang pada upacara HUT Desa.",
    body: "Dewan juri telah menetapkan pemenang sayembara desain maskot Desa Sukamaju. Penilaian mencakup keterwakilan budaya Sunda, kesederhanaan bentuk, dan kemudahan aplikasi pada media digital. Pemenang akan dihubungi melalui nomor telepon yang terdaftar.",
    channel: "WEBSITE_DESA" as const,
    status: "TERBIT" as const,
    priority: "NORMAL" as const,
    pinned: false,
    audience: "Umum",
  },
  {
    title: "Draf RKPDes 2027 — Undangan Musyawarah Dusun",
    excerpt:
      "Musyawarah dusun membahas usulan prioritas pembangunan 2027. Draf dapat diunduh pada menu Dokumen Perencanaan.",
    body: "Seluruh warga diundang menghadiri Musyawarah Dusun (Musdus) penyusunan RKPDes 2027. Setiap RT diharapkan mengirimkan minimal tiga perwakilan. Kartu usulan dapat diambil di kantor desa atau diunduh dari laman ini.",
    channel: "WEBSITE_DESA" as const,
    status: "DRAF" as const,
    priority: "NORMAL" as const,
    pinned: false,
    audience: "Perangkat & RT/RW",
  },
];

export const PURPOSE_TEMPLATES: Record<string, string[]> = {
  SKU: [
    "Persyaratan pengajuan Kredit Usaha Rakyat (KUR) di BRI Unit Cimaung",
    "Kelengkapan berkas pendaftaran UMKM pada Dinas Koperasi Kab. Bandung",
    "Persyaratan iklan usaha warung pada aplikasi mitra niaga",
  ],
  SKCK: [
    "Persyaratan melamar kerja sebagai karyawan swasta di Bandung",
    "Kelengkapan pendaftaran seleksi anggota POLRI tahun 2026",
    "Persyaratan pembuatan paspor di Kantor Imigrasi Kelas I Bandung",
  ],
  SKD: [
    "Persyaratan pendaftaran sekolah anak di SMPN 2 Cimaung",
    "Kelengkapan administrasi pengajuan kredit pemilikan rumah",
    "Persyaratan pembukaan rekening bank syariah",
  ],
  SKM: [
    "Kelengkapan pengurusan akta kematian di Disdukcapil",
    "Administrasi pembagian waris keluarga",
    "Persyaratan penghentian bantuan sosial almarhum",
  ],
  SKTM: [
    "Kelengkapan pengajuan beasiswa Bidikmisi mahasiswa",
    "Persyaratan keringanan biaya rawat inap RSUD Cileunyi",
    "Kelengkapan pendaftaran Kartu Indonesia Pintar (KIP)",
  ],
  SKL: [
    "Persyaratan pembuatan akta kelahiran anak di Disdukcapil",
    "Kelengkapan administrasi pendaftaran BPJS Kesehatan bayi",
    "Persyaratan pembuatan Kartu Identitas Anak (KIA)",
  ],
  SKP: [
    "Persyaratan pindah domisili ke Kota Bandung karena pekerjaan",
    "Mutasi alamat keluarga pindah ke Kecamatan Soreang",
    "Kelengkapan administrasi perpindahan sekolah anak",
  ],
  IZN: [
    "Izin penyelenggaraan hajatan pernikahan keluarga",
    "Izin kegiatan seni tradisional dalam rangka HUT Desa",
    "Izin kegiatan pengajian akbar Muharram",
  ],
  SKH: [
    "Persyaratan pengajuan beasiswa prestasi universitas",
    "Kelengkapan permohonan kredit mikro bank",
    "Persyaratan pendaftaran program bantuan pendidikan",
  ],
  SKT: [
    "Kelengkapan pengurusan sertifikat tanah pada BPN",
    "Persyaratan pengajuan kredit dengan agunan tanah",
    "Administrasi pembagian waris bidang tanah",
  ],
  SKN: [
    "Persyaratan pendaftaran pernikahan di KUA Cimaung",
    "Kelengkapan administrasi pendaftaran pekerjaan",
    "Persyaratan pendaftaran sekolah kedinasan",
  ],
  SKB: [
    "Perbedaan penulisan nama antara ijazah dan KTP",
    "Perbedaan nama antara akta kelahiran dan Kartu Keluarga",
    "Kelengkapan klaim asuransi karena salah penulisan nama",
  ],
};
