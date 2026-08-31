export type AttendanceStatus = 'hadir' | 'izin' | 'sakit' | 'alpa';
export type PersonRole = 'siswa' | 'guru';

export interface Person {
  id: string;
  nama: string;
  nisNip?: string;
  kelas?: string; // required for siswa
  role: PersonRole;
  mataPelajaran?: string; // for guru
  jadwalHari?: string[]; // e.g. ['Senin', 'Rabu', 'Jumat']
  jadwalPiket?: string[]; // e.g. ['Senin', 'Kamis']
  tarifHarian?: number; // Honor/Gaji per hari hadir (in Rupiah)
  eskulIds?: string[]; // IDs of Eskuls assigned to this teacher/pembina
  fotoUrl?: string; // Pas foto 3x4 (Base64 or URL)
  tempatLahir?: string; // Tempat lahir (e.g. Jakarta)
  tanggalLahir?: string; // Tanggal lahir (e.g. 2010-05-15 or 15 Mei 2010)
}

export interface AttendanceEntry {
  status: AttendanceStatus;
  jam: string;
  keterangan?: string;
}

// Map key: "personId" -> AttendanceEntry
export type DailyAttendanceMap = Record<string, AttendanceEntry>;

export interface EskulItem {
  id: string;
  nama: string;
  pembina?: string;
  hari?: string;
  jam?: string;
  tarifPerSesi?: number; // Honor pembina per kegiatan/sesi eskul (Rp)
  pembinaIds?: string[];
}

export interface Roster {
  classes: string[];
  students: Person[];
  teachers: Person[];
  eskuls?: EskulItem[];
}

export interface SekolahInfo {
  nama: string;
  alamat?: string;
  npsn?: string;
  kepalaSekolah?: string;
  nipKepalaSekolah?: string;
  logoUrl?: string;
  stempelUrl?: string; // Base64 data URL or image URL for official school stamp
  ttdUrl?: string;
}

export type ViewMode = 'home' | 'siswa' | 'guru' | 'eskul' | 'rekap' | 'kelola';
