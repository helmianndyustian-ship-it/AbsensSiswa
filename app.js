// ─── CONFIG ──────────────────────────────────────────────────────────────────
const SHEET_URL = 'https://script.google.com/macros/s/AKfycbyJN12lGSlzwZRPTcBaHXvzgnsyrRfBPiO-4yZwAlYBy9NRT1PsNwazJX4ZC65U4jYJFA/exec';

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const genId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

// Tanggal hari ini format YYYY-MM-DD (untuk input date picker & logika internal)
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Konversi YYYY-MM-DD → YYYYMMDD (untuk dikirim ke Sheets — angka murni, tidak auto-convert)
function toSheetDate(yyyymmdd) {
  return yyyymmdd.replace(/-/g, ''); // "2026-05-09" → "20260509"
}

// Konversi dari Sheets (bisa "20260509" atau Date object) → YYYY-MM-DD
function fromSheetDate(val) {
  if (!val) return '';
  // Kalau Date object (Sheets masih auto-convert data lama)
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(val).trim();
  // Format YYYYMMDD → YYYY-MM-DD
  if (s.length === 8 && !s.includes('-')) {
    return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
  }
  // Sudah YYYY-MM-DD atau format lain
  return s.split('T')[0];
}

// Format YYYY-MM-DD ke tampilan Indonesia
function formatTampil(yyyymmdd) {
  if (!yyyymmdd) return '-';
  return new Date(yyyymmdd + 'T00:00:00').toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

// ─── STATE ───────────────────────────────────────────────────────────────────
let currentKelasId = null;
let navBackTarget = null;
let cache = { kelas: null, siswa: null, absensi: null };

// ─── API LAYER ───────────────────────────────────────────────────────────────
async function apiGetAll() {
  const url = `${SHEET_URL}?action=getAll`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Gagal mengambil data');
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json;
}

async function apiAction(action, params = {}) {
  const url = new URL(SHEET_URL);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k, v]) => {
    url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : v);
  });
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Gagal: ${action}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json;
}

// ─── CACHE ───────────────────────────────────────────────────────────────────
async function loadAllData() {
  showLoading(true);
  try {
    const data = await apiGetAll();
    cache.kelas = data.kelas || [];
    cache.siswa = data.siswa || [];
    // Normalisasi semua tanggal ke YYYY-MM-DD saat load
    cache.absensi = (data.absensi || []).map(a => ({
      ...a,
      tanggal: fromSheetDate(a.tanggal)
    }));
  } finally {
    showLoading(false);
  }
}

async function getData(key) {
  if (cache[key] !== null) return cache[key];
  await loadAllData();
  return cache[key];
}

function invalidateCache() {
  cache = { kelas: null, siswa: null, absensi: null };
}

// ─── LOADING ─────────────────────────────────────────────────────────────────
function showLoading(show) {
  let el = document.getElementById('global-loading');
  if (!el) {
    el = document.createElement('div');
    el.id = 'global-loading';
    el.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 3px;
      background: linear-gradient(90deg, #6c63ff, #a78bfa);
      z-index: 9999;
    `;
    document.body.appendChild(el);
  }
  el.style.display = show ? 'block' : 'none';
}

// ─── NAVIGATION ──────────────────────────────────────────────────────────────
function goPage(pageId, backLabel = null, backTarget = 'page-dashboard') {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
  const back = document.getElementById('navBack');
  if (backLabel) {
    back.textContent = '← ' + backLabel;
    back.classList.add('show');
    navBackTarget = backTarget;
  } else {
    back.classList.remove('show');
    navBackTarget = null;
  }
  window.scrollTo(0, 0);
}

function navBackAction() {
  if (navBackTarget) goPage(navBackTarget);
  renderDashboard();
}

function goHome() {
  goPage('page-dashboard');
  renderDashboard();
}

// ─── TOAST ───────────────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function showError(msg) {
  showToast('❌ ' + msg);
  console.error(msg);
}

// ─── MODAL ───────────────────────────────────────────────────────────────────
function showModal(id) { document.getElementById(id).classList.add('show'); }
function hideModal(id) { document.getElementById(id).classList.remove('show'); }

document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('show'); });
});

// ─── KELAS ───────────────────────────────────────────────────────────────────
async function tambahKelas() {
  const nama  = document.getElementById('input-nama-kelas').value.trim();
  const mapel = document.getElementById('input-mapel').value.trim();
  if (!nama) return alert('Nama kelas wajib diisi');

  try {
    showLoading(true);
    await apiAction('tambahKelas', { data: { id: genId(), nama, mapel } });
    invalidateCache();
    document.getElementById('input-nama-kelas').value = '';
    document.getElementById('input-mapel').value = '';
    hideModal('modal-tambah-kelas');
    await renderDashboard();
    showToast('Kelas berhasil ditambahkan ✓');
  } catch (e) {
    showError('Gagal menambah kelas: ' + e.message);
  } finally {
    showLoading(false);
  }
}

async function hapusKelas() {
  if (!confirm('Hapus kelas ini beserta semua data siswa dan absensinya?')) return;
  try {
    showLoading(true);
    await apiAction('hapusKelas', { kelasId: currentKelasId });
    invalidateCache();
    showToast('Kelas dihapus');
    goHome();
  } catch (e) {
    showError('Gagal menghapus kelas: ' + e.message);
  } finally {
    showLoading(false);
  }
}

async function bukaKelas(kelasId) {
  currentKelasId = kelasId;
  try {
    const kelas = (await getData('kelas')).find(k => k.id === kelasId);
    document.getElementById('kelas-title').textContent = kelas.nama;
    document.getElementById('kelas-sub').textContent = kelas.mapel || 'Tap absensi untuk mulai';
    await renderSiswa();
    goPage('page-kelas', 'Dashboard');
  } catch (e) {
    showError('Gagal membuka kelas: ' + e.message);
  }
}

// ─── SISWA ───────────────────────────────────────────────────────────────────
async function tambahSiswa() {
  const nama = document.getElementById('input-nama-siswa').value.trim();
  if (!nama) return alert('Nama siswa wajib diisi');

  try {
    showLoading(true);
    await apiAction('tambahSiswa', { data: { id: genId(), nama, kelasId: currentKelasId } });
    invalidateCache();
    document.getElementById('input-nama-siswa').value = '';
    hideModal('modal-tambah-siswa');
    await renderSiswa();
    showToast('Siswa berhasil ditambahkan ✓');
  } catch (e) {
    showError('Gagal menambah siswa: ' + e.message);
  } finally {
    showLoading(false);
  }
}

async function hapusSiswa(siswaId) {
  if (!confirm('Hapus siswa ini?')) return;
  try {
    showLoading(true);
    await apiAction('hapusSiswa', { siswaId });
    invalidateCache();
    await renderSiswa();
    showToast('Siswa dihapus');
  } catch (e) {
    showError('Gagal menghapus siswa: ' + e.message);
  } finally {
    showLoading(false);
  }
}

async function renderSiswa() {
  const siswa = (await getData('siswa')).filter(s => s.kelasId === currentKelasId);
  const el = document.getElementById('list-siswa');

  if (!siswa.length) {
    el.innerHTML = `
      <div class="empty">
        <div class="empty-icon">👤</div>
        <div class="empty-text">Belum ada siswa</div>
        <div class="empty-sub">Tap tombol Tambah untuk menambah siswa</div>
      </div>`;
    return;
  }

  el.innerHTML = siswa.map((s, i) => `
    <div class="siswa-item">
      <div class="siswa-avatar">${s.nama.charAt(0).toUpperCase()}</div>
      <div class="siswa-nama"><span class="siswa-no">${i + 1}.</span>${s.nama}</div>
      <button class="btn btn-danger btn-sm" onclick="hapusSiswa('${s.id}')">✕</button>
    </div>
  `).join('');
}

// ─── ABSENSI ─────────────────────────────────────────────────────────────────
async function goAbsen() {
  const siswa = (await getData('siswa')).filter(s => s.kelasId === currentKelasId);
  if (!siswa.length) return alert('Tambah siswa dulu sebelum absensi');

  const kelas = (await getData('kelas')).find(k => k.id === currentKelasId);
  document.getElementById('absen-info').textContent = kelas.nama + (kelas.mapel ? ' · ' + kelas.mapel : '');
  document.getElementById('absen-tanggal').value = today();
  await renderAbsenForm();
  goPage('page-absen', kelas.nama);
}

async function renderAbsenForm() {
  const siswa = (await getData('siswa')).filter(s => s.kelasId === currentKelasId);
  const el = document.getElementById('absen-list');

  el.innerHTML = siswa.map((s, i) => `
    <div class="absen-row hadir" id="row-${s.id}">
      <div class="absen-top">
        <div class="absen-number">${i + 1}</div>
        <div class="absen-nama">${s.nama}</div>
      </div>
      <div class="status-group">
        ${['Hadir', 'Sakit', 'Izin', 'Alfa'].map(st => `
          <button class="status-btn ${st === 'Hadir' ? 'active-hadir' : ''}"
            onclick="setStatus('${s.id}', '${st.toLowerCase()}')"
            id="btn-${s.id}-${st.toLowerCase()}">${st}</button>
        `).join('')}
      </div>
      <div class="keterangan-input" id="ket-${s.id}">
        <input type="text" placeholder="Keterangan (opsional)" id="ket-input-${s.id}" />
      </div>
    </div>
  `).join('');
}

function setStatus(siswaId, status) {
  document.getElementById('row-' + siswaId).className = 'absen-row ' + status;
  ['hadir', 'sakit', 'izin', 'alfa'].forEach(s => {
    const btn = document.getElementById(`btn-${siswaId}-${s}`);
    btn.className = 'status-btn' + (s === status ? ` active-${s}` : '');
  });
  const ket = document.getElementById('ket-' + siswaId);
  status !== 'hadir' ? ket.classList.add('show') : ket.classList.remove('show');
}

async function simpanAbsen() {
  const tanggalInput = document.getElementById('absen-tanggal').value; // YYYY-MM-DD
  if (!tanggalInput) return alert('Pilih tanggal absensi');

  // Kirim ke Sheets dalam format YYYYMMDD (angka murni, tidak dikenali sebagai Date)
  const tanggalSheet = toSheetDate(tanggalInput); // "2026-05-09" → "20260509"

  try {
    showLoading(true);
    const siswa = (await getData('siswa')).filter(s => s.kelasId === currentKelasId);

    const dataAbsen = siswa.map(s => {
      const status = ['hadir', 'sakit', 'izin', 'alfa']
        .find(st => document.getElementById(`btn-${s.id}-${st}`)?.classList.contains(`active-${st}`)) || 'hadir';
      const keterangan = document.getElementById(`ket-input-${s.id}`)?.value || '';

      return {
        id: genId(),
        siswaId: s.id,
        kelasId: currentKelasId,
        tanggal: tanggalSheet, // "20260509" — plain text di Sheets
        status,
        keterangan
      };
    });

    await apiAction('saveAbsensi', { data: dataAbsen });
    invalidateCache();
    showToast('Absensi berhasil disimpan ✓');
    await bukaKelas(currentKelasId);
  } catch (e) {
    showError('Gagal menyimpan absensi: ' + e.message);
  } finally {
    showLoading(false);
  }
}

// ─── REKAP ───────────────────────────────────────────────────────────────────
async function goRekapKelas() {
  await renderRekapPage(currentKelasId);
}

async function renderRekapPage(kelasId = '') {
  const filterKelas = document.getElementById('rekap-filter-kelas');
  const kelas = await getData('kelas');
  filterKelas.innerHTML = '<option value="">Semua Kelas</option>' +
    kelas.map(k => `<option value="${k.id}" ${k.id === kelasId ? 'selected' : ''}>${k.nama}</option>`).join('');
  document.getElementById('rekap-filter-tanggal').value = '';
  goPage('page-rekap', 'Dashboard');
  await renderRekap();
}

async function renderRekap() {
  try {
    showLoading(true);
    const kelasId   = document.getElementById('rekap-filter-kelas').value;
    const filterTgl = document.getElementById('rekap-filter-tanggal').value; // YYYY-MM-DD

    const [siswaAll, kelasAll, absensiAll] = await Promise.all([
      getData('siswa'), getData('kelas'), getData('absensi')
    ]);

    // absensi sudah dinormalisasi ke YYYY-MM-DD di loadAllData
    let absensi = [...absensiAll];
    if (kelasId)   absensi = absensi.filter(a => a.kelasId === kelasId);
    if (filterTgl) absensi = absensi.filter(a => a.tanggal === filterTgl);

    const counts = { hadir: 0, sakit: 0, izin: 0, alfa: 0 };
    absensi.forEach(a => { if (counts[a.status] !== undefined) counts[a.status]++; });

    const statsEl = document.getElementById('rekap-stats');
    if (absensi.length) {
      statsEl.style.display = 'grid';
      statsEl.innerHTML = `
        <div class="stat-card stat-hadir"><div class="stat-num">${counts.hadir}</div><div class="stat-label">Hadir</div></div>
        <div class="stat-card stat-sakit"><div class="stat-num">${counts.sakit}</div><div class="stat-label">Sakit</div></div>
        <div class="stat-card stat-izin"><div class="stat-num">${counts.izin}</div><div class="stat-label">Izin</div></div>
        <div class="stat-card stat-alfa"><div class="stat-num">${counts.alfa}</div><div class="stat-label">Alfa</div></div>
      `;
    } else {
      statsEl.style.display = 'none';
    }

    const el = document.getElementById('rekap-content');
    if (!absensi.length) {
      el.innerHTML = `
        <div class="empty">
          <div class="empty-icon">📋</div>
          <div class="empty-text">Belum ada data absensi</div>
          <div class="empty-sub">Mulai absensi dari halaman kelas</div>
        </div>`;
      return;
    }

    const sorted = [...absensi].sort((a, b) => b.tanggal.localeCompare(a.tanggal));
    el.innerHTML = `
      <table class="rekap-table">
        <thead><tr>
          <th>Tanggal</th><th>Kelas</th><th>Siswa</th><th>Status</th><th>Keterangan</th>
        </tr></thead>
        <tbody>
          ${sorted.map(a => {
            const siswa = siswaAll.find(s => s.id === a.siswaId);
            const kelas = kelasAll.find(k => k.id === a.kelasId);
            return `<tr>
              <td>${formatTampil(a.tanggal)}</td>
              <td>${kelas?.nama || '-'}</td>
              <td>${siswa?.nama || '-'}</td>
              <td><span class="badge badge-${a.status}">${a.status.charAt(0).toUpperCase() + a.status.slice(1)}</span></td>
              <td>${a.keterangan || '-'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  } catch (e) {
    showError('Gagal memuat rekap: ' + e.message);
  } finally {
    showLoading(false);
  }
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
async function renderDashboard() {
  const el = document.getElementById('list-kelas-dashboard');
  el.innerHTML = `<div class="empty"><div class="empty-icon">⏳</div><div class="empty-text">Memuat data...</div></div>`;

  try {
    invalidateCache();
    await loadAllData();

    const kelas      = cache.kelas;
    const siswaAll   = cache.siswa;
    const absensiAll = cache.absensi;
    const todayStr   = today(); // YYYY-MM-DD, sudah cocok dengan cache.absensi

    if (!kelas.length) {
      el.innerHTML = `
        <div class="empty">
          <div class="empty-icon">📚</div>
          <div class="empty-text">Belum ada kelas</div>
          <div class="empty-sub">Tap tombol Tambah Kelas untuk memulai</div>
        </div>`;
    } else {
      el.innerHTML = kelas.map(k => {
        const jmlSiswa   = siswaAll.filter(s => s.kelasId === k.id).length;
        const sudahAbsen = absensiAll.some(a => a.kelasId === k.id && a.tanggal === todayStr);
        return `
          <div class="kelas-card" onclick="bukaKelas('${k.id}')">
            <div class="kelas-icon">📖</div>
            <div class="kelas-info">
              <div class="kelas-nama">${k.nama}</div>
              <div class="kelas-meta">${k.mapel ? k.mapel + ' · ' : ''}${jmlSiswa} siswa${sudahAbsen ? ' · ✅ Sudah absen hari ini' : ''}</div>
            </div>
            <div class="kelas-arrow">›</div>
          </div>`;
      }).join('');
    }

    const rekapEl    = document.getElementById('dashboard-rekap-info');
    const totalAbsen = absensiAll.filter(a => a.tanggal === todayStr).length;
    if (totalAbsen) {
      rekapEl.innerHTML = `<div class="alert alert-success">✅ ${totalAbsen} siswa sudah diabsensi hari ini. <span style="cursor:pointer;text-decoration:underline;" onclick="renderRekapPage()">Lihat rekap →</span></div>`;
    } else {
      rekapEl.innerHTML = `<div class="alert alert-info">📋 Belum ada absensi hari ini. Pilih kelas untuk mulai.</div>`;
    }
  } catch (e) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">⚠️</div><div class="empty-text">Gagal memuat data</div><div class="empty-sub">${e.message}</div></div>`;
  }
}

// ─── EXPORT PDF ──────────────────────────────────────────────────────────────
async function exportPDF() {
  const kelasId   = document.getElementById('rekap-filter-kelas').value;
  const filterTgl = document.getElementById('rekap-filter-tanggal').value;

  const [siswaAll, kelasAll, absensiAll] = await Promise.all([
    getData('siswa'), getData('kelas'), getData('absensi')
  ]);

  let absensi = [...absensiAll];
  if (kelasId)   absensi = absensi.filter(a => a.kelasId === kelasId);
  if (filterTgl) absensi = absensi.filter(a => a.tanggal === filterTgl);

  if (!absensi.length) return alert('Tidak ada data untuk diexport');

  const namaKelas = kelasId ? (kelasAll.find(k => k.id === kelasId)?.nama || 'Semua Kelas') : 'Semua Kelas';
  const sorted = [...absensi].sort((a, b) => b.tanggal.localeCompare(a.tanggal));

  const counts = { hadir: 0, sakit: 0, izin: 0, alfa: 0 };
  absensi.forEach(a => { if (counts[a.status] !== undefined) counts[a.status]++; });

  const statusColor = { hadir: '#16a34a', sakit: '#d97706', izin: '#2563eb', alfa: '#dc2626' };
  const rows = sorted.map(a => {
    const siswa = siswaAll.find(s => s.id === a.siswaId);
    const kelas = kelasAll.find(k => k.id === a.kelasId);
    return `
      <tr>
        <td>${formatTampil(a.tanggal)}</td>
        <td>${kelas?.nama || '-'}</td>
        <td>${siswa?.nama || '-'}</td>
        <td style="color:${statusColor[a.status]||'#000'};font-weight:600;">
          ${a.status.charAt(0).toUpperCase() + a.status.slice(1)}
        </td>
        <td>${a.keterangan || '-'}</td>
      </tr>`;
  }).join('');

  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8"/>
      <title>Rekap Absensi - ${namaKelas}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Arial', sans-serif; padding: 32px; color: #1e1e2e; }
        .header { text-align: center; margin-bottom: 24px; border-bottom: 2px solid #6c63ff; padding-bottom: 16px; }
        .header h1 { font-size: 22px; color: #6c63ff; margin-bottom: 4px; }
        .header p { font-size: 13px; color: #666; }
        .stats { display: flex; gap: 12px; margin-bottom: 20px; }
        .stat { flex: 1; text-align: center; padding: 10px; border-radius: 8px; }
        .stat-num { font-size: 22px; font-weight: 700; }
        .stat-label { font-size: 11px; margin-top: 2px; }
        .s-hadir { background: #dcfce7; color: #16a34a; }
        .s-sakit { background: #fef9c3; color: #d97706; }
        .s-izin  { background: #dbeafe; color: #2563eb; }
        .s-alfa  { background: #fee2e2; color: #dc2626; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        thead tr { background: #6c63ff; color: white; }
        th { padding: 10px 12px; text-align: left; }
        td { padding: 8px 12px; border-bottom: 1px solid #e5e7eb; }
        tr:nth-child(even) td { background: #f9fafb; }
        .footer { margin-top: 24px; font-size: 11px; color: #999; text-align: right; }
        @media print { body { padding: 16px; } button { display: none; } }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>📋 Rekap Absensi — ${namaKelas}</h1>
        <p>${filterTgl ? formatTampil(filterTgl) : 'Semua Tanggal'} &nbsp;|&nbsp; Dicetak: ${new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
      </div>
      <div class="stats">
        <div class="stat s-hadir"><div class="stat-num">${counts.hadir}</div><div class="stat-label">Hadir</div></div>
        <div class="stat s-sakit"><div class="stat-num">${counts.sakit}</div><div class="stat-label">Sakit</div></div>
        <div class="stat s-izin"><div class="stat-num">${counts.izin}</div><div class="stat-label">Izin</div></div>
        <div class="stat s-alfa"><div class="stat-num">${counts.alfa}</div><div class="stat-label">Alfa</div></div>
      </div>
      <table>
        <thead>
          <tr><th>Tanggal</th><th>Kelas</th><th>Siswa</th><th>Status</th><th>Keterangan</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="footer">AbsenGuru &nbsp;·&nbsp; Total: ${absensi.length} record</div>
      <script>window.onload = () => window.print();<\/script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.getElementById('absen-tanggal').max = today();
renderDashboard();