import React, { useState, useEffect } from 'react';
import { ViewMode, SekolahInfo, Roster, DailyAttendanceMap, AttendanceStatus } from './types';
import {
  loadSekolahInfo,
  saveSekolahInfo,
  loadRoster,
  saveRoster,
  getAttendanceForDate,
  updateAttendanceStatus,
  formatIndonesianDate,
  saveAttendanceForDate
} from './utils/storage';
import { getTodayDateString, DEFAULT_ROSTER, DEFAULT_SEKOLAH_INFO, generateInitialAttendance } from './data/defaultData';
import {
  initCloudDataIfNeeded,
  subscribeSekolahInfo,
  saveSekolahInfoCloud,
  subscribeRoster,
  saveRosterCloud,
  subscribeAttendance,
  saveAttendanceCloud
} from './lib/firebase';
import { HeaderBoard, BottomNav } from './components/HeaderBoard';
import { ViewHome } from './components/ViewHome';
import { ViewAbsenSiswa } from './components/ViewAbsenSiswa';
import { ViewAbsenGuru } from './components/ViewAbsenGuru';
import { ViewAbsenEskul } from './components/ViewAbsenEskul';
import { ViewRekap } from './components/ViewRekap';
import { ViewKelolaData } from './components/ViewKelolaData';
import { BarcodeScannerModal } from './components/BarcodeScannerModal';
import { BarcodeCardModal } from './components/BarcodeCardModal';
import { DEFAULT_ESKULS } from './data/defaultData';
import { Person, PersonRole } from './types';
import { CheckCircle2 } from 'lucide-react';

export default function App() {
  const todayStr = getTodayDateString();
  const formattedToday = formatIndonesianDate(todayStr);

  const [activeView, setActiveView] = useState<ViewMode>('home');
  const [sekolahInfo, setSekolahInfo] = useState<SekolahInfo>(() => loadSekolahInfo());
  const [roster, setRoster] = useState<Roster>(() => loadRoster());

  const [selectedDateSiswa, setSelectedDateSiswa] = useState<string>(todayStr);
  const [selectedDateGuru, setSelectedDateGuru] = useState<string>(todayStr);
  const [selectedDateEskul, setSelectedDateEskul] = useState<string>(todayStr);
  const [selectedEskulId, setSelectedEskulId] = useState<string>(() => {
    const list = roster.eskuls || DEFAULT_ESKULS;
    return list[0]?.id || 'esk_1';
  });
  const [selectedKelasSiswa, setSelectedKelasSiswa] = useState<string>(() => roster.classes[0] || '');

  const [attSiswa, setAttSiswa] = useState<DailyAttendanceMap>(() =>
    getAttendanceForDate('siswa', todayStr)
  );
  const [attGuru, setAttGuru] = useState<DailyAttendanceMap>(() =>
    getAttendanceForDate('guru', todayStr)
  );
  const [attEskul, setAttEskul] = useState<DailyAttendanceMap>(() =>
    getAttendanceForDate(`eskul_${selectedEskulId}`, todayStr)
  );

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);
  const [barcodeCardModal, setBarcodeCardModal] = useState<{ isOpen: boolean; person: Person | null }>({
    isOpen: false,
    person: null
  });

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((current) => (current === msg ? null : current));
    }, 2400);
  };

  const openBarcodeCard = (person?: Person | null) => {
    setBarcodeCardModal({
      isOpen: true,
      person: person || null
    });
  };

  // Initialize Firebase Cloud Data & Real-time Subscriptions
  useEffect(() => {
    const initialAtt = generateInitialAttendance(todayStr);
    initCloudDataIfNeeded(DEFAULT_SEKOLAH_INFO, DEFAULT_ROSTER, todayStr, initialAtt);

    const unsubInfo = subscribeSekolahInfo((info) => {
      setSekolahInfo(info);
      saveSekolahInfo(info);
    });

    const unsubRoster = subscribeRoster((newRoster) => {
      let updatedRoster = newRoster;
      if (!updatedRoster.teachers || updatedRoster.teachers.length === 0) {
        updatedRoster = { ...updatedRoster, teachers: DEFAULT_ROSTER.teachers };
        saveRosterCloud(updatedRoster);
      }
      setRoster(updatedRoster);
      saveRoster(updatedRoster);
    });

    return () => {
      unsubInfo();
      unsubRoster();
    };
  }, [todayStr]);

  // Real-time Attendance Listener for Siswa
  useEffect(() => {
    const unsub = subscribeAttendance('siswa', selectedDateSiswa, (dataMap) => {
      setAttSiswa(dataMap);
      saveAttendanceForDate('siswa', selectedDateSiswa, dataMap);
    });
    return () => unsub();
  }, [selectedDateSiswa]);

  // Real-time Attendance Listener for Guru
  useEffect(() => {
    const unsub = subscribeAttendance('guru', selectedDateGuru, (dataMap) => {
      setAttGuru(dataMap);
      saveAttendanceForDate('guru', selectedDateGuru, dataMap);
    });
    return () => unsub();
  }, [selectedDateGuru]);

  // Real-time Attendance Listener for Eskul
  useEffect(() => {
    const typeKey = `eskul_${selectedEskulId}`;
    const unsub = subscribeAttendance(typeKey, selectedDateEskul, (dataMap) => {
      setAttEskul(dataMap);
      saveAttendanceForDate(typeKey, selectedDateEskul, dataMap);
    });
    return () => unsub();
  }, [selectedEskulId, selectedDateEskul]);

  // Keep selected kelas valid
  useEffect(() => {
    if (roster.classes.length > 0 && (!selectedKelasSiswa || !roster.classes.includes(selectedKelasSiswa))) {
      setSelectedKelasSiswa(roster.classes[0]);
    }
  }, [roster.classes, selectedKelasSiswa]);

  // Single stamp handler
  const handleStampStatus = (
    type: 'siswa' | 'guru',
    personId: string,
    status: AttendanceStatus | null,
    note?: string
  ) => {
    const dateStr = type === 'siswa' ? selectedDateSiswa : selectedDateGuru;
    const updated = updateAttendanceStatus(type, dateStr, personId, status, note);
    if (type === 'siswa') setAttSiswa(updated);
    else setAttGuru(updated);

    // Save to Cloud Firebase
    saveAttendanceCloud(type, dateStr, updated);
  };

  // Bulk stamp handler
  const handleBulkStamp = (type: 'siswa' | 'guru', personIds: string[], status: AttendanceStatus) => {
    const dateStr = type === 'siswa' ? selectedDateSiswa : selectedDateGuru;
    const current = getAttendanceForDate(type, dateStr);
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    personIds.forEach((id) => {
      current[id] = {
        status,
        jam: current[id]?.jam || timeStr,
        keterangan: current[id]?.keterangan || ''
      };
    });

    saveAttendanceForDate(type, dateStr, current);
    if (type === 'siswa') setAttSiswa({ ...current });
    else setAttGuru({ ...current });

    // Save to Cloud Firebase
    saveAttendanceCloud(type, dateStr, current);
  };

  // Reset attendance handler
  const handleResetAttendance = (type: 'siswa' | 'guru', personIds: string[]) => {
    const dateStr = type === 'siswa' ? selectedDateSiswa : selectedDateGuru;
    const current = getAttendanceForDate(type, dateStr);
    personIds.forEach((id) => {
      delete current[id];
    });
    saveAttendanceForDate(type, dateStr, current);
    if (type === 'siswa') setAttSiswa({ ...current });
    else setAttGuru({ ...current });

    // Save to Cloud Firebase
    saveAttendanceCloud(type, dateStr, current);
  };

  // Save updated roster
  const handleSaveRoster = (newRoster: Roster) => {
    setRoster(newRoster);
    saveRoster(newRoster);
    saveRosterCloud(newRoster);
  };

  // Save updated school info
  const handleSaveSekolahInfo = (newInfo: SekolahInfo) => {
    setSekolahInfo(newInfo);
    saveSekolahInfo(newInfo);
    saveSekolahInfoCloud(newInfo);
  };

  // Reset all data to initial demo state
  const handleResetDemoData = () => {
    setSekolahInfo(DEFAULT_SEKOLAH_INFO);
    saveSekolahInfo(DEFAULT_SEKOLAH_INFO);
    saveSekolahInfoCloud(DEFAULT_SEKOLAH_INFO);

    setRoster(DEFAULT_ROSTER);
    saveRoster(DEFAULT_ROSTER);
    saveRosterCloud(DEFAULT_ROSTER);

    const initial = generateInitialAttendance(todayStr);
    saveAttendanceForDate('siswa', todayStr, initial.siswa);
    saveAttendanceForDate('guru', todayStr, initial.guru);
    saveAttendanceCloud('siswa', todayStr, initial.siswa);
    saveAttendanceCloud('guru', todayStr, initial.guru);

    setAttSiswa(initial.siswa);
    setAttGuru(initial.guru);
    setSelectedKelasSiswa(DEFAULT_ROSTER.classes[0]);
    showToast('Data berhasil di-reset ke data awal demo');
  };

  // Clear all data (empty students, retain default teachers if empty)
  const handleClearAllData = () => {
    const emptyRoster: Roster = {
      classes: ['1A'],
      students: [],
      teachers: roster.teachers && roster.teachers.length > 0 ? roster.teachers : DEFAULT_ROSTER.teachers
    };
    setRoster(emptyRoster);
    saveRoster(emptyRoster);
    saveRosterCloud(emptyRoster);

    saveAttendanceForDate('siswa', todayStr, {});
    saveAttendanceForDate('guru', todayStr, {});
    saveAttendanceCloud('siswa', todayStr, {});
    saveAttendanceCloud('guru', todayStr, {});

    setAttSiswa({});
    setAttGuru({});
    setSelectedKelasSiswa('1A');
    showToast('Semua data siswa & guru berhasil dihapus!');
  };

  return (
    <div className="min-h-screen chalkboard-bg text-[#22303F] font-sans antialiased flex flex-col pb-16 sm:pb-20">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-[#1F3D2E] text-[#F5F0E6] border-2 border-[#CFE3D6]/40 px-4 py-2.5 rounded-xl shadow-2xl text-xs sm:text-sm font-semibold flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-[#CFE3D6]" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Blackboard Header */}
      <HeaderBoard
        sekolahInfo={sekolahInfo}
        todayDateStr={todayStr}
        formattedToday={formattedToday}
        onOpenScanner={() => setIsScannerOpen(true)}
        onOpenBarcodeCard={() => openBarcodeCard()}
      />

      {/* Main Notebook Paper Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-2 sm:px-4 py-1.5 sm:py-3">
        <div className="notebook-page border-l-[3px] border-l-[#34A88E]/40 rounded-r-2xl rounded-bl-2xl shadow-xl p-3 sm:p-5 pl-3.5 sm:pl-5 min-h-[520px] relative border border-[#EDE8DC] border-l-[#34A88E]/40">
          
          {activeView === 'home' && (
            <ViewHome
              roster={roster}
              attSiswa={attSiswa}
              attGuru={attGuru}
              onNavigate={setActiveView}
              formattedToday={formattedToday}
              onOpenScanner={() => setIsScannerOpen(true)}
              onOpenBarcodeCard={() => openBarcodeCard()}
            />
          )}

          {activeView === 'siswa' && (
            <ViewAbsenSiswa
              roster={roster}
              selectedKelas={selectedKelasSiswa}
              onSelectKelas={setSelectedKelasSiswa}
              selectedDate={selectedDateSiswa}
              onSelectDate={setSelectedDateSiswa}
              attendanceMap={attSiswa}
              onStampStatus={(id, status, note) => handleStampStatus('siswa', id, status, note)}
              onBulkStamp={(ids, status) => handleBulkStamp('siswa', ids, status)}
              onResetAttendance={(ids) => handleResetAttendance('siswa', ids)}
              onShowToast={showToast}
              onOpenScanner={() => setIsScannerOpen(true)}
              onOpenBarcodeCard={(person) => openBarcodeCard(person)}
            />
          )}

          {activeView === 'guru' && (
            <ViewAbsenGuru
              roster={roster}
              selectedDate={selectedDateGuru}
              onSelectDate={setSelectedDateGuru}
              attendanceMap={attGuru}
              onStampStatus={(id, status, note) => handleStampStatus('guru', id, status, note)}
              onBulkStamp={(ids, status) => handleBulkStamp('guru', ids, status)}
              onResetAttendance={(ids) => handleResetAttendance('guru', ids)}
              onShowToast={showToast}
              onOpenScanner={() => setIsScannerOpen(true)}
              onOpenBarcodeCard={(person) => openBarcodeCard(person)}
            />
          )}

          {activeView === 'eskul' && (
            <ViewAbsenEskul
              roster={roster}
              selectedEskulId={selectedEskulId}
              onSelectEskulId={setSelectedEskulId}
              selectedDate={selectedDateEskul}
              onSelectDate={setSelectedDateEskul}
              attendanceMap={attEskul}
              onStampStatus={(id, status, note) => {
                const attType = `eskul_${selectedEskulId}`;
                const updated = updateAttendanceStatus(attType, selectedDateEskul, id, status, note);
                setAttEskul(updated);
                saveAttendanceCloud(attType, selectedDateEskul, updated);
              }}
              onBulkStamp={(ids, status) => {
                const attType = `eskul_${selectedEskulId}`;
                const current = getAttendanceForDate(attType, selectedDateEskul);
                const now = new Date();
                const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                ids.forEach(id => {
                  current[id] = { status, jam: current[id]?.jam || timeStr, keterangan: current[id]?.keterangan || '' };
                });
                saveAttendanceForDate(attType, selectedDateEskul, current);
                setAttEskul({ ...current });
                saveAttendanceCloud(attType, selectedDateEskul, current);
              }}
              onResetAttendance={(ids) => {
                const attType = `eskul_${selectedEskulId}`;
                const current = getAttendanceForDate(attType, selectedDateEskul);
                ids.forEach(id => delete current[id]);
                saveAttendanceForDate(attType, selectedDateEskul, current);
                setAttEskul({ ...current });
                saveAttendanceCloud(attType, selectedDateEskul, current);
              }}
              onShowToast={showToast}
              onOpenScanner={() => setIsScannerOpen(true)}
              onOpenBarcodeCard={(person) => openBarcodeCard(person)}
            />
          )}

          {(activeView === 'kelola' || activeView === 'rekap') && (
            <ViewKelolaData
              sekolahInfo={sekolahInfo}
              onSaveSekolahInfo={handleSaveSekolahInfo}
              roster={roster}
              onSaveRoster={handleSaveRoster}
              onResetDemoData={handleResetDemoData}
              onClearAllData={handleClearAllData}
              onShowToast={showToast}
              todayDateStr={todayStr}
              initialTab={activeView === 'rekap' ? 'rekap' : 'master'}
              onAttendanceReset={() => {
                setAttSiswa(getAttendanceForDate('siswa', selectedDateSiswa));
                setAttGuru(getAttendanceForDate('guru', selectedDateGuru));
                if (selectedEskulId) {
                  setAttEskul(getAttendanceForDate(`eskul_${selectedEskulId}`, selectedDateEskul));
                }
              }}
            />
          )}

        </div>
      </main>

      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        roster={roster}
        selectedDate={activeView === 'eskul' ? selectedDateEskul : todayStr}
        onStampAttendance={(personId, role, status) => {
          if (activeView === 'eskul' && selectedEskulId) {
            const attType = `eskul_${selectedEskulId}`;
            const updated = updateAttendanceStatus(attType, selectedDateEskul, personId, status);
            setAttEskul(updated);
            saveAttendanceCloud(attType, selectedDateEskul, updated);
          } else {
            handleStampStatus(role, personId, status);
          }
        }}
        onShowToast={showToast}
      />

      {/* Barcode Member Card Printable Modal */}
      <BarcodeCardModal
        isOpen={barcodeCardModal.isOpen}
        onClose={() => setBarcodeCardModal({ isOpen: false, person: null })}
        roster={roster}
        sekolahNama={sekolahInfo.nama}
        sekolahInfo={sekolahInfo}
        onSaveSekolahInfo={handleSaveSekolahInfo}
        onSaveRoster={handleSaveRoster}
        initialPerson={barcodeCardModal.person}
      />

      {/* Bottom Navigation Menu */}
      <BottomNav
        activeView={activeView}
        onNavigate={setActiveView}
        onOpenScanner={() => setIsScannerOpen(true)}
      />
    </div>
  );
}
